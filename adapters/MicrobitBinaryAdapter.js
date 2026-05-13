const { SerialPort } = require("serialport");
const BaseAdapter = require("./BaseAdapter");

class ParseError extends Error { }



class MicrobitBinaryAdapter extends BaseAdapter {
  constructor({ path, baud = 115200, verbose = false } = {}) {
    super();
    this.path = path;
    this.baud = baud;
    this.port = null;
    this.buf = Buffer.alloc(0);
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
    this.buf = Buffer.alloc(0); //Ya no es texto, es un buffer de bytes.
    this.onDisconnected?.("serial closed");
  }

  getConnectionDetail() {
    return `serial open ${this.path}`;
  }

  _onChunk(chunk) {
   //Donde se acumulan los bytes
   this.buf = Buffer.concat([this.buf, chunk]);

   //Procesa los paquetes
   while(this.buf.length >= 8) {

    //Buscar el header del paquete (0xAA)
    if(this.buf[0] !== 0xAA) {
        this.buf = this.buf.slice(1); //Si el dato no es el header, se descarta y se sigue buscando.
        continue;
    }

    //Tomar el paquete completo de 8 bytes
    const packet = this.buf.slice(0,8); 
    if(this.verbose){
      console.log("PACKET:", packet);
    }



    //Calcular el checksum
    let sum = 0;
    for(let i = 1; i <= 6; i++) {
        sum += packet[i];
    }
    const checksum = sum % 256;

    //Verificar el checksum
    {
        if(checksum !== packet[7]) {
            console.warn("Checksum inválido");
            this.buf = this.buf.slice(1); //Descartar el byte del header y seguir buscando.
            continue;
        }
    }

    //Parsear los datos del paquete
    const x = packet.readInt16BE(1); //Bytes 1 y 2
    const y = packet.readInt16BE(3); //Bytes 3 y 4
    const btnA = packet[5] === 1; //Byte 5
    const btnB = packet[6] === 1; //Byte 6

    //Enviar los datos al navegador
    this.onData?.({ x, y, btnA, btnB});

    //Limpiar el buffer de los bytes procesados 
    this.buf = this.buf.slice(8); //Se descartan los 8 bytes del paquete procesado y se sigue con el siguiente paquete.
   }
    
   //Evitar crecimiento infinito del buffer en caso de datos corruptos.
   if (this.buf.length > 4096) this.buf = Buffer.alloc(0); //Si el buffer crece demasiado sin encontrar paquetes válidos, se reinicia el buffer para evitar problemas de memoria.
  }

  _fail(err) {
    this.onError?.(String(err?.message || err));
    this.disconnect();
  }

  _closed() {
    if (!this.connected) return;
    this.connected = false;
    this.port = null;
    this.buf = Buffer.alloc(0);
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

module.exports = MicrobitBinaryAdapter;
