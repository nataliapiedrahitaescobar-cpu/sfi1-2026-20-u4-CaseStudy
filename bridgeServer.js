//   Uso:
//     node bridgeServer.js
//     node bridgeServer.js --device microbit
//     node bridgeServer.js --device sim --wsPort 8081 --hz 30
//     node bridgeServer.js --device microbit --wsPort 8081 --serialPort COM5 --baud 115200
//     node bridgeServer.js --device microbit-v2
//     node bridgeServer.js --device microbitBinary --serialPort COM --wsPort 8081
//     node bridgeServer.js --device strudel --wsPort 8082

const { WebSocketServer } = require("ws");
const { SerialPort } = require("serialport");

const SimAdapter = require("./adapters/SimAdapter");
const MicrobitASCIIAdapter = require("./adapters/MicrobitASCIIAdapter");
const Microbit2ASCIIAdapter = require("./adapters/Microbit2ASCIIAdapter");
const MicrobitBinaryAdapter = require("./adapters/MicrobitBinaryAdapter.js");
const StrudelAdapter = require("./adapters/StrudelAdapter");
const OSCAdapter = require("./adapters/OSCAdapter");

const log = {
  info: (...args) => console.log(`[${new Date().toISOString()}] [INFO]`, ...args),
  warn: (...args) => console.warn(`[${new Date().toISOString()}] [WARN]`, ...args),
  error: (...args) => console.error(`[${new Date().toISOString()}] [ERROR]`, ...args)
};

function getArg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return def;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function nowMs() {
  return Date.now();
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch (e) {
    log.warn("Failed to parse JSON:", s, e);
    return null;
  }
}

function broadcast(wss, obj) {
  const text = JSON.stringify(obj);

  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(text);
    }
  }
}

function status(wss, state, detail = "") {
  broadcast(wss, {
    type: "status",
    state,
    detail,
    t: nowMs()
  });
}

const DEVICE = (getArg("device", "sim") || "sim").toLowerCase();
const WS_PORT = parseInt(getArg("wsPort", "8081"), 10);
const SERIAL_PATH = getArg("serialPort", null);
const BAUD = parseInt(getArg("baud", "115200"), 10);
const SIM_HZ = parseInt(getArg("hz", "30"), 10);
const VERBOSE = hasFlag("verbose");

async function findMicrobitPort() {
  const ports = await SerialPort.list();

  const microbit = ports.find(
    p => p.vendorId && parseInt(p.vendorId, 16) === 0x0D28
  );

  return microbit?.path ?? null;
}

async function createAdapter() {

  // MICROBIT V1
  if (DEVICE === "microbit") {

    const path = SERIAL_PATH ?? await findMicrobitPort();

    if (!path) {
      log.error("micro:bit not found.");
      process.exit(1);
    }

    return new MicrobitASCIIAdapter({
      path,
      baud: BAUD,
      verbose: VERBOSE
    });
  }

  // MICROBIT V2
  if (DEVICE === "microbit-v2") {

    const path = SERIAL_PATH ?? await findMicrobitPort();

    if (!path) {
      log.error("micro:bit v2 not found.");
      process.exit(1);
    }

    return new Microbit2ASCIIAdapter({
      path,
      baud: BAUD,
      verbose: VERBOSE
    });
  }

  // MICROBIT BINARY
  if (DEVICE === "microbitbinary") {

    const path = SERIAL_PATH ?? "COM8";

    return new MicrobitBinaryAdapter({
      path,
      baud: BAUD,
      verbose: VERBOSE
    });
  }

  // STRUDEL
  if (DEVICE === "strudel") {

    return new StrudelAdapter({
      port: 8080,
      verbose: VERBOSE
    });
  }

  // OSC
  if (DEVICE === "osc") {

    return new OSCAdapter(9000);
  }

  // SIMULADOR
  return new SimAdapter({
    hz: SIM_HZ
  });
}

async function main() {

  const wss = new WebSocketServer({
    port: WS_PORT
  });

  log.info(`WS listening on ws://127.0.0.1:${WS_PORT} device=${DEVICE}`);

  // ARRAY DE ADAPTERS
  const adapters = [];

  // MAIN ADAPTER
  const mainAdapter = await createAdapter();
  adapters.push(mainAdapter);

  // OSC ADAPTER
  const oscAdapter = new OSCAdapter(9000);
  adapters.push(oscAdapter);

  // EVENTOS PARA TODOS LOS ADAPTERS
  for (const adapter of adapters) {

    adapter.onConnected = (detail) => {
      log.info(`[ADAPTER] Connected: ${detail}`);
      status(wss, "connected", detail);
    };

    adapter.onDisconnected = (detail) => {
      log.warn(`[ADAPTER] Disconnected: ${detail}`);
      status(wss, "disconnected", detail);
    };

    adapter.onError = (detail) => {
      log.error(`[ADAPTER] Error: ${detail}`);
      status(wss, "error", detail);
    };

    adapter.onData = (d) => {

      // STRUDEL
      if (d.type === "strudel") {
        broadcast(wss, d);
        return;
      }

      // OSC
      if (d.type === "osc") {
        broadcast(wss, d);
        return;
      }

      // MICROBIT
      broadcast(wss, {
        type: "microbit",
        x: d.x,
        y: d.y,
        btnA: !!d.btnA,
        btnB: !!d.btnB,
        t: nowMs()
      });
    };
  }

  status(wss, "ready", `bridge up (${DEVICE})`);

  wss.on("connection", (ws, req) => {

    log.info(`[NETWORK] Client connected from ${req.socket.remoteAddress}`);

    const state = mainAdapter.connected
      ? "connected"
      : "ready";

    const detail = mainAdapter.connected
      ? mainAdapter.getConnectionDetail?.() || "connected"
      : `bridge (${DEVICE})`;

    ws.send(JSON.stringify({
      type: "status",
      state,
      detail,
      t: nowMs()
    }));

    ws.on("message", async (raw) => {

      const msg = safeJsonParse(raw.toString("utf8"));

      if (!msg) return;

      // CONNECT
      if (msg.cmd === "connect") {

        try {

          for (const adapter of adapters) {
            await adapter.connect();
          }

        } catch (e) {

          const detail = `connect failed: ${e.message || e}`;

          log.error(detail);

          status(wss, "error", detail);
        }
      }

      // DISCONNECT
      if (msg.cmd === "disconnect") {

        try {

          for (const adapter of adapters) {
            await adapter.disconnect();
          }

        } catch (e) {

          const detail = `disconnect failed: ${e.message || e}`;

          log.error(detail);

          status(wss, "error", detail);
        }
      }

      // SIM HZ
      if (msg.cmd === "setSimHz" && mainAdapter instanceof SimAdapter) {

        await mainAdapter.handleCommand(msg);

        status(wss, "connected", `sim hz=${mainAdapter.hz}`);
      }

      // SET LED
      if (msg.cmd === "setLed") {

        try {

          await mainAdapter.handleCommand?.(msg);

        } catch (e) {

          const detail = `command failed: ${e.message || e}`;

          log.error(detail);

          status(wss, "error", detail);
        }
      }
    });

    ws.on("close", async () => {

      log.info(`[NETWORK] Client disconnected`);

      if (wss.clients.size === 0) {

        for (const adapter of adapters) {
          await adapter.disconnect();
        }
      }
    });
  });

  // AUTO CONNECT SOLO SIM
  if (DEVICE === "sim") {

    for (const adapter of adapters) {
      await adapter.connect();
    }
  }
}

main().catch((e) => {

  log.error("Fatal:", e);

  process.exit(1);
});