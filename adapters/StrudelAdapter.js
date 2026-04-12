const WebSocket = require("ws"); //Tipo de conexión que permite enviar datos, recibir datos en tiempo real sin recargar la página.
const BaseAdapter = require("./BaseAdapter");

class StrudelAdapter extends BaseAdapter{ 
    constructor({ url =  "ws://localhost:8080", verbose = false } = {}) {
        super();
        this.url = url;
        this.ws = null;
        this.verbose = verbose;
    }

    async connect() {
        if (this.connected) return;

        this.ws = new WebSocket(this.url);

        this.ws.on("open", () => {
            this.connected = true;
            this.onConnected?.(`connected to ${this.url}`);
        })

        this.ws.on("message", (message) => {
            try {
                const msg = JSON.parse(message);

                //Extraer datos importantes 
                const args = msg.args || [];

                const getArg = (key) => {
                    const i = args.indexOf(key);
                    return i >= 0 ? args[i + 1] : null;
                };

                const s = getArg("s");
                const delta = getArg("delta");

                //Normalizar evento
                this.onData?.({
                    type: "strudel",
                    timestamp: msg.timestamp,
                    payload: {
                        s,
                        delta
                    }
                });
            } catch (e) {
                if(this.verbose) console.log("Bad strudel message", message);
            }
        });
        this.ws.on("error", (err) => this._fail(err));
        this.ws.on("close", () => this._closed()); 
    }
    
    async disconnect(){
        if (!this.connected) return;
        this.connected = false;

        if(this.ws) {
            this.ws.close();
        }

        this.ws = null;
        this.onDisconnected?.("ws closed");
    }

    getConnectionDetail() {
        return `ws ${this.url}`;
    }

    _fail(err) {
        this.onError?.(String(err?.message || err));
        this.disconnect();
    }

    _closed() {
        if (!this.connected) return;
        this.connected = false;
        this.ws = null;
        this.onDisconnected?.("ws closed (event)");
    }
}

module.exports = StrudelAdapter;


