class BridgeClient {
  constructor(url = "ws://127.0.0.1:8081") { //Define en donde se conecta el bridge, por defecto es en el localHost en el puerto 8081.
    this._url = url;
    //Muestra el estado de la conexión con el bridge, si está abierto o cerrado.
    this._ws = null;
    this._isOpen = false;
    
    //Callbacks para manejar eventos de datos, conexión, dexconexión y estado.
    this._onData = null;
    this._onConnect = null;
    this._onDisconnect = null;
    this._onStatus = null;
  }

  get isOpen() {
    return this._isOpen;
  }

  onData(callback) { this._onData = callback; } //Cuando llegan datos, se ejecuta la función.
  onConnect(callback) { this._onConnect = callback; } //Cuando se conecta, se ejecuta la función.
  onDisconnect(callback) { this._onDisconnect = callback; } //Cuando se desconecta.
  onStatus(callback) { this._onStatus = callback; } //Mensajes de estado, como errores o cambios de estado del microbit.

  open() { //Se conecta al bridgeServer.
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      if (!this._isOpen) this.send({ cmd: "connect" });
      return;
    }

    if (this._ws) {
      this.close();
    }

    this._ws = new WebSocket(this._url);

    this._ws.onopen = () => {
      this.send({ cmd: "connect" });
    };

    this._ws.onmessage = (event) => { //Es donde llegan todos los mensajes del bridgeServer
      // Esperamos JSON normalizado desde el bridge
      let msg;
      try {
        msg = JSON.parse(event.data); //Parsear a JSON, convierte el mensaje en un objeto.
      } catch (e) {
        console.warn("WS message is not JSON:", event.data);
        return;
      }

      // Convención mínima:
      // - {type:"status", state:"...", detail:"..."}
      // - {type:"microbit", x:..., y:..., btnA:..., btnB:...}
      if (msg.type === "status") {
        this._onStatus?.(msg);

        if (msg.state === "connected") {
          this._isOpen = true;
          this._onConnect?.();
        }

        if (msg.state === "disconnected" || msg.state === "error" || msg.state === "ready") {
          this._isOpen = false; 
          this._onDisconnect?.();
          if (msg.state === "error") {
            this._ws?.close();
            this._ws = null;
          }          
        }
        return;
      }

      if (msg.type === "microbit") {
        // payload ya normalizado
        this._onData?.(msg);
        return;
      }

      if (msg.type === "strudel") {
        this._onData?.(msg); //Si el mensaje es del tipo strudel, se envía a la función de datos. Esto es para que el cliente pueda recibir los datos del strudel.
        return;
      }
    };

    this._ws.onerror = (err) => { //Muestra los errores de conexión con el bridgeServer.
      console.warn("WS error:", err);
    };

    this._ws.onclose = () => { //Si se cae la conexión con el bridgeServer, se muestra un mensaje de advertencia y se ejecuta la función de desconexión.
      this._handleDisconnect();
    };
  }

  close() {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;

    try {
      this.send({ cmd: "disconnect" }); //Le dice al bridgeServer que se desconecte.
      this._isOpen = false;
    } catch (e) {
      console.warn("Failed to send disconnect command:", e);
    }
  }

  send(obj) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
    this._ws.send(JSON.stringify(obj));
  }

  _handleDisconnect() {
    this._isOpen = false;
    this._ws = null;
    this._onDisconnect?.();
  }
}
