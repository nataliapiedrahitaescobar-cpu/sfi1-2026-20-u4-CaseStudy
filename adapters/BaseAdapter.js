class BaseAdapter {
  constructor() {
    this.connected = false;
    this.onData = null;
    this.onError = null;
    this.onConnected = null;
    this.onDisconnected = null;
  }

  async connect() {
    throw new Error("connect() not implemented");
  }

  async disconnect() {
    throw new Error("disconnect() not implemented");
  }

  getConnectionDetail() {
    throw new Error("getConnectionDetail() must be implemented by subclass");
  }  

  async handleCommand(_cmd) {
    console.warn("handleCommand() not implemented for command", _cmd);
    // Las subclases lo pueden o no sobreescribir
  }
}

module.exports = BaseAdapter;