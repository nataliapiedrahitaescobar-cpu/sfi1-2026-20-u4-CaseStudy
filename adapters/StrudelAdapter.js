const WebSocket = require("ws");
const BaseAdapter = require("./BaseAdapter");

class StrudelAdapter extends BaseAdapter {

    constructor({ url = "ws://localhost:8080", verbose = false } = {}) {
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

            console.log("Conectado a Strudel");

            this.onConnected?.(`Connected to ${this.url}`);
        });

        this.ws.on("message", (message) => {

            try {

                const msg = JSON.parse(message);

                const args = msg.args || [];

                const getArg = (key) => {
                    const i = args.indexOf(key);
                    return i >= 0 ? args[i + 1] : null;
                };

                const s = getArg(("s") || "");
                const delta = Number(getArg("delta") || 0.25);

                this.onData?.({
                    type: "strudel",
                    timestamp: msg.timestamp,
                    payload: {
                        s,
                        delta
                    }
                });

            } catch (e) {

                if (this.verbose) {
                    console.log("Bad strudel message", message);
                }
            }
        });

        this.ws.on("close", () => {

            this.connected = false;

            this.onDisconnected?.("Strudel disconnected");
        });

        this.ws.on("error", (err) => {

            console.error("Strudel error:", err);

            this.onError?.(err);
        });
    }

    async disconnect() {

        if (!this.connected) return;

        this.connected = false;

        if (this.ws) {
            this.ws.close();
        }

        this.ws = null;

        this.onDisconnected?.("ws closed");
    }

    getConnectionDetail() {
        return `Strudel WS ${this.url}`;
    }
}

module.exports = StrudelAdapter;