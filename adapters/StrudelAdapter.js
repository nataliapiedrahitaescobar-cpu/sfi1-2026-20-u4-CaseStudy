const WebSocket = require("ws"); //Tipo de conexión que permite enviar datos, recibir datos en tiempo real sin recargar la página.
const BaseAdapter = require("./BaseAdapter");

class StrudelAdapter extends BaseAdapter{  //Es el adaptador que se conecta al servidor de Strudel.
    constructor({port = 8080, verbose = false } = {}) {
        super();
        this.port = port; //Puerto en el que se conecta al servidor de Strudel.
        this.ws = null; //Conexión WebSocket que inicialmente está desconectada.
        this.verbose = verbose;
    }

    async connect() { //Crea la conexión con Strudel y define los eventos para recibir datos.
        if (this.connected) return;

        this.wss = new WebSocket.Server({ port: this.port})

        this.connected = true;
        this.onConnected?.(`Strudel WS server on ${this.port}`);

        this.wss.on("connection", (ws) => {
            console.log("Strudel conectado al Bridge");

            ws.on("message", (message) => {
                try{
                    const msg = JSON.parse(message);

                    const args = msg.args || [];

                    const getArg = (key) => {
                        const i = args.indexOf(key);
                        return i >= 0 ? args[i + 1] : null;
                    };

                    const s = getArg("s");
                    const delta = getArg("delta");

                    this.onData?.({
                        type: "strudel",
                        timestamp: msg.timestamp,
                        payload: {
                            s,
                            delta
                        }
                    });

                } catch (e) {
                    if (this.verbose) console.log("Bad strudel message", message);
                }
            });
        });
       
    }

       
    
    async disconnect(){ //Cierra la conexión con Strudel, si está abierta, y  notifica al cliente que se ha desconectado.
        if (!this.connected) return;
        this.connected = false;

        if(this.ws) {
            this.ws.close();
        }

        this.ws = null;
        this.onDisconnected?.("ws closed");
    }

}
    
module.exports = StrudelAdapter;
