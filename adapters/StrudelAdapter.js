const WebSocket = require("ws"); //Tipo de conexión que permite enviar datos, recibir datos en tiempo real sin recargar la página.
const BaseAdapter = require("./BaseAdapter");

class StrudelAdapter extends BaseAdapter{  //Es el adaptador que se conecta al servidor de Strudel.
    constructor({ url =  "ws://localhost:8080", verbose = false } = {}) {
        super();
        this.url = url; //Dirección donde el Strudel envía datos.
        this.ws = null; //Conexión WebSocket que inicialmente está desconectada.
        this.verbose = verbose;
    }

    async connect() { //Crea la conexión con Strudel y define los eventos para recibir datos.
        if (this.connected) return;

        this.ws = new WebSocket(this.url);

        //Cuando se conecta, se establece la conexión y se notifica al cliente que está conectado.
        this.ws.on("open", () => {
            this.connected = true;
            this.onConnected?.(`connected to ${this.url}`);
        })

        this.ws.on("message", (message) => { //Llega un mensaje del Strudel.
            try {
                const msg = JSON.parse(message); //Se parsea el mensaje, se espera que sea un JSON con una estructura específica.

                //Extraer datos importantes: El sonido y el delta (cambio en el sonido).
                const args = msg.args || [];

                const getArg = (key) => {
                    const i = args.indexOf(key);
                    return i >= 0 ? args[i + 1] : null;
                };

                const s = getArg("s");
                const delta = getArg("delta");

                //Normalizar evento, transforma el mensaje en un formato limpio para que el cliente pueda usarlo fácilmente.
                this.onData?.({ 
                    type: "strudel",
                    timestamp: msg.timestamp,
                    payload: {
                        s,
                        delta
                    }
                });
            } catch (e) { //Reporta errores de parseo o mensajes mal formados, si el mensaje no es un JSON válido o no tiene la estructura esperada, se captura el error y se muestra un mensaje de advertencia.
                if(this.verbose) console.log("Bad strudel message", message);
            }
        });
        this.ws.on("error", (err) => this._fail(err));
        this.ws.on("close", () => this._closed()); 
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


