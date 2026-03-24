
//   Uso:
//     node bridgeServer.js
//     node bridgeServer.js --device microbit
//     node bridgeServer.js --device sim --wsPort 8081 --hz 30
//     node bridgeServer.js --device microbit --wsPort 8081 --serialPort COM5 --baud 115200

//   WS contract:
//    * bridge To client:
//        {type:"status", state:"ready|connected|disconnected|error", detail:"..."}
//        {type:"microbit", x:int, y:int, btnA:bool, btnB:bool, t:ms}
//    * client To bridge:
//        {cmd:"connect"} | {cmd:"disconnect"}
//        {cmd:"setSimHz", hz:30}
//        {cmd:"setLed", x:2, y:3, value:9}


const { WebSocketServer } = require("ws"); //Comunicación con el navegador.
const { SerialPort } = require("serialport"); //Conexión con el microbit a través del puerto serial.
const SimAdapter = require("./adapters/SimAdapter"); //Simulador.
const MicrobitAsciiAdapter = require("./adapters/MicrobitASCIIAdapter"); //El hardware real.
// const MicrobitBinaryAdapter = require("./adapters/MicrobitBinaryAdapter");
const Microbit2ASCIIAdapter = require("./adapters/Microbit2ASCIIAdapter"); //El hardware con protocolo binario.
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

function nowMs() { return Date.now(); }

function safeJsonParse(s) {
  try {
    return JSON.parse(s);

  } catch (e) {
    log.warn("Failed to parse JSON: ", s, e);
    return null;
  }
}

function broadcast(wss, obj) {
  const text = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(text);
  }
}

function status(wss, state, detail = "") {
  broadcast(wss, { type: "status", state, detail, t: nowMs() });
}

//Configuración del sketch de p5.js para recibir los datos del microbit a través del bridgeServer y dibujar en el canvas según esos datos.
const DEVICE = (getArg("device", "sim") || "sim").toLowerCase();
const WS_PORT = parseInt(getArg("wsPort", "8081"), 10);
const SERIAL_PATH = getArg("serialPort", null);
const BAUD = parseInt(getArg("baud", "115200"), 10);
const SIM_HZ = parseInt(getArg("hz", "30"), 10);
const VERBOSE = hasFlag("verbose");

//Buscar microbit automáticamente, si no se encuentra, usar el simulador.
async function findMicrobitPort() { //Detecta el microbit automáticamente buscando en los puertos seriales un dispositivo con el vendorId del microbit.
  const ports = await SerialPort.list();
  const microbit = ports.find(p =>
    p.vendorId && parseInt(p.vendorId, 16) === 0x0D28
  );
  return microbit?.path ?? null;
}

async function createAdapter() { //Crea el adapter y decide si se conecta al microbit real o al simulador.
  //Microbit v1
  if (DEVICE === "microbit") {
    const path = SERIAL_PATH ?? await findMicrobitPort();
    if (!path) {
      log.error("micro:bit not found. Use --serialPort to specify manually.");
      process.exit(1);
    }
    log.info(`micro:bit (v1) found at ${path}`);
    return new MicrobitASCIIAdapter({ path, baud: BAUD, verbose: VERBOSE});
  }

  //Microbit v2 
  if (DEVICE === "microbit-v2") {
    const path = SERIAL_PATH ?? await findMicrobitPort();

    if(!path) {
      log.error("micro:bit not found. Use --serialPort to specify manually");
      process.exit(1);
    }
    log.info(`micro:bit (v2) found at ${path})`);
    return new Microbit2ASCIIAdapter({ path, baud: BAUD, verbose: VERBOSE});
  }


  // if (DEVICE === "microbit-bin") {
  //   const path = SERIAL_PATH ?? await findMicrobitPort();
  //   if (!path) {
  //     log.error("micro:bit not found. Use --serialPort to specify manually.");
  //     process.exit(1);
  //   }
  //   return new MicrobitBinaryAdapter({ path, baud: BAUD });
  // }
  log.info("Using Simulator");
  return new SimAdapter({ hz: SIM_HZ });
}

async function main() {
  const wss = new WebSocketServer({ port: WS_PORT }); //Permite que el navegador (sketch.js) se conecte
  log.info(`WS listening on ws://127.0.0.1:${WS_PORT} device=${DEVICE}`);

  const adapter = await createAdapter();
   
  //Eventos del adapter
  adapter.onConnected = (detail) => {
    log.info(`[ADAPTER] Device Connected: ${detail}`);
    status(wss, "connected", detail);
  };

  adapter.onDisconnected = (detail) => {
    log.warn(`[ADAPTER] Device Disconnected: ${detail}`);
    status(wss, "disconnected", detail);
  };

  adapter.onError = (detail) => {
    log.error(`[ADAPTER] Device Error: ${detail}`);
    status(wss, "error", detail);
  };

  adapter.onData = (d) => { //Son los eventos del adapter, es donde se reciben los datos del parser, los coniverte a JSON y los envía al navegador.
    broadcast(wss, {
      type: "microbit",
      x: d.x,
      y: d.y,
      btnA: !!d.btnA,
      btnB: !!d.btnB,
      t: nowMs(),
    });
  };

  status(wss, "ready", `bridge up (${DEVICE})`);

  //Conexión con el cliente. 
  wss.on("connection", (ws, req) => { //Conexión con el cliente. Aquí se conecta el navegador y recibe los estados.
    log.info(`[NETWORK] Remote Client connected from ${req.socket.remoteAddress}. Total clients: ${wss.clients.size}`);

    const state = adapter.connected ? "connected" : "ready";

    const detail = adapter.connected
      ? adapter.getConnectionDetail()
      : `bridge (${DEVICE})`;

    ws.send(JSON.stringify({ type: "status", state, detail, t: nowMs() }));

    ws.on("message", async (raw) => {
      const msg = safeJsonParse(raw.toString("utf8"));
      if (!msg) return;

      if (msg.cmd === "connect") {
        log.info(`[NETWORK] Client requested adapter connect`);

        if (adapter.connected) {
         ws.send(JSON.stringify({
          type: "status",
          state: "connected",
          detail: adapter.getConnectionDetail(),
          t: nowMs()
        }));
        return;
      }

        
        try {
          await adapter.connect();
        } catch (e) {
          const detail = `connect failed: ${e.message || e}`;
          log.error(`[ADAPTER] ` + detail);
          status(wss, "error", detail);
        }
      }
        

      if (msg.cmd === "disconnect") {
        log.info(`[NETWORK] Client requested adapter disconnect`);
     
        try{
          await adapter.disconnect();
        } catch (e) {
          const detail = `disconnect failed: ${e.message || e}`;
          log.error(detail);
          status (wss, "error", detail);
        }
      }

      if (msg.cmd === "setSimHz" && adapter instanceof SimAdapter) {
        log.info(`Setting Sim Hz to ${msg.hz}`); 
        await adapter.handleCommand(msg);
        status(wss, "connected", `sim hz=${adapter.hz}`);
      }
      
      if (msg.cmd === "setLed") {
        try {
          await adapter.handleCommand?.(msg);
          } catch (e) {
            const detail = `command failed: ${e.message || e}`;
            log.error(`[ADAPTER] ` + detail);
            status(wss, "error", detail);
          }
        }
      });
             
      ws.on("close", () => {
        log.info(`[NETWORK] Remote Client disconnected. Total clients left: ${wss.clients.size}`);
        if (wss.clients.size === 0) {
          log.info("[HW-POLICY] No more remote clients. Auto-disconnecting adapter device to free resources...");
          adapter.disconnect();
        }
      });
    });
    
    //Auto-connect solo para el simulador.
    if (DEVICE === "sim") {
      await adapter.connect();
    }
  }
  
  main().catch((e) => {
    log.error("Fatal:", e);
    process.exit(1);
  });
        
     



