const BaseAdapter = require("./BaseAdapter");

class SimAdapter extends BaseAdapter {
  constructor({ hz = 30 } = {}) {
    super();
    this.hz = hz;
    this.timer = null;

    this.x = 0;
    this.y = 0;
    this.btnA = false;
    this.btnB = false;
    this._tick = 0;
  }

  connect() {
    if (this.connected) return;
    this.connected = true;
    this.onConnected?.("sim connected");
    this._startLoop();
  }

  disconnect() {
    if (!this.connected) return;
    this.connected = false;
    this._stopLoop();
    this.onDisconnected?.("sim disconnected");
  }

  getConnectionDetail() {
    return `sim running at ${this.hz}Hz`;
  }

  setHz(hz) {
    const n = Number(hz);
    if (!Number.isFinite(n) || n < 1 || n > 240) return;
    this.hz = n | 0;
    if (this.connected) {
      this._stopLoop();
      this._startLoop();
    }
  }

  _startLoop() {
    const period = Math.max(1, Math.floor(1000 / this.hz));
    this.timer = setInterval(() => {
      this._tick++;

      this.x = Math.round((Math.random() * 40 - 20));
      this.y = Math.round((Math.random() * 40 - 20));

      this.btnA = true;
      this.btnB = false;
      this.onData?.({ x: this.x, y: this.y, btnA: this.btnA, btnB: this.btnB });
    }, period);
  }

  _stopLoop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async handleCommand(cmd) {
    if (cmd?.cmd === "setSimHz") this.setHz(cmd.hz);
  }
}

module.exports = SimAdapter;