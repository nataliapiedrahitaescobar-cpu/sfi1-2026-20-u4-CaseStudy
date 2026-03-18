const { SerialPort } = require("serialport");
const BaseAdapter = require("./BaseAdapter");

class ParseError extends Error { }

//Interpreta el texto del hardware 
function parseCsvLine(line) {
  line = line.trim();

  // 🔹 Validar inicio de trama
  if (!line.startsWith("$")) {
    throw new ParseError("Invalid start of frame");
  }

  const values = line.split("|");
  if (values.length !== 6) {
    throw new ParseError(`Expected 6 values, got ${values.length}`);
  }

  try {
    const x = Number(values[1].split(":")[1]);
    const y = Number(values[2].split(":")[1]);
    const btnA = Number(values[3].split(":")[1]);
    const btnB = Number(values[4].split(":")[1]);
    const chk = Number(values[5].split(":")[1]);

    // 🔹 Validar números
    if (![x, y, btnA, btnB, chk].every(Number.isFinite)) {
      throw new ParseError("Invalid numeric data");
    }

    // 🔹 Validar rango acelerómetro
    if (x < -2048 || x > 2047 || y < -2048 || y > 2047) {
      throw new ParseError("Out of expected range");
    }

    // 🔹 Validar botones (0 o 1)
    if (![0, 1].includes(btnA) || ![0, 1].includes(btnB)) {
      throw new ParseError("Invalid button data");
    }

    // 🔹 Checksum (usa valores numéricos)
    const calc = Math.abs(x) + Math.abs(y) + btnA + btnB;

    if (calc !== chk) {
      throw new ParseError("Checksum mismatch");
    }

    // 🔹 Retorno final (transformación a boolean)
    return {
      x: x,
      y: y,
      btnA: btnA === 1,
      btnB: btnB === 1
    };

  } catch (err) {
    throw new ParseError("Malformed frame");
  }
}


class MicrobitAsciiAdapter extends BaseAdapter {
  constructor({ path, baud = 115200, verbose = false } = {}) {
    super();
    this.path = path;
    this.baud = baud;
    this.port = null;
    this.buf = "";
    this.verbose = verbose;
  }

  async connect() {
    if (this.connected) return;
    if (!this.path) throw new Error("serialPort is required for microbit device mode");

    this.port = new SerialPort({
      path: this.path,
      baudRate: this.baud,
      autoOpen: false,
    });

    await new Promise((resolve, reject) => {
      this.port.open((err) => (err ? reject(err) : resolve()));
    });

    this.connected = true;
    this.onConnected?.(`serial open ${this.path} @${this.baud}`);

    this.port.on("data", (chunk) => this._onChunk(chunk));
    this.port.on("error", (err) => this._fail(err));
    this.port.on("close", () => this._closed());
  }

  async disconnect() {
    if (!this.connected) return;
    this.connected = false;

    if (this.port && this.port.isOpen) {
      await new Promise((resolve, reject) => {
        this.port.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    this.port = null;
    this.buf = "";
    this.onDisconnected?.("serial closed");
  }

  getConnectionDetail() {
    return `serial open ${this.path}`;
  }

  _onChunk(chunk) {
    this.buf += chunk.toString("utf8");

    let idx;
    while ((idx = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);

      if (!line) continue;

      try {
        const parsed = parseCsvLine(line);
        this.onData?.(parsed);
      } catch (e) {
        if (e instanceof ParseError) {
          if (this.verbose) console.log("Bad data:", e.message, "raw:", line);
        } else {
          this._fail(e);
        }
      }
    }

    if (this.buf.length > 4096) this.buf = "";
  }

  _fail(err) {
    this.onError?.(String(err?.message || err));
    this.disconnect();
  }

  _closed() {
    if (!this.connected) return;
    this.connected = false;
    this.port = null;
    this.buf = "";
    this.onDisconnected?.("serial closed (event)");
  }

  async writeLine(line) {
    if (!this.port || !this.port.isOpen) return;
    await new Promise((resolve, reject) => {
      this.port.write(line, (err) => (err ? reject(err) : resolve()));
    });
  }

  async handleCommand(cmd) {
    if (cmd?.cmd === "setLed") {
      const x = Math.max(0, Math.min(4, Math.trunc(cmd.x)));
      const y = Math.max(0, Math.min(4, Math.trunc(cmd.y)));
      const v = Math.max(0, Math.min(9, Math.trunc(cmd.value)));
      await this.writeLine(`LED,${x},${y},${v}\n`);
    }
  }
}

module.exports = MicrobitAsciiAdapter;
