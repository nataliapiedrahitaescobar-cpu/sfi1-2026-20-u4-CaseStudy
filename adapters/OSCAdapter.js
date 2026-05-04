const BaseAdapter = require("./BaseAdapter");
const osc = require("osc");


class OpenStageControlAdapter extends BaseAdapter {
  constructor(port = 9000) {
   super();
   
   this.port = port;
   this.udpPort = null;
  }

  async connect() {//Abre el puerto UDP (9000) y empieza a escuchar los mensajes del OSC
    try{
        this.udpPort = new osc.UDPPort({
            localAdress:  "0.0.0.0",
            localPort: this.port
        });

        this.udpPort.on("ready", () => {
            this.connected = true;
            console.log("OSC Adapter conectado en puerto", this.port);

            if(this.onConnected) this.onConnected();
        });

        this.udpPort.on("message", (msg) => {//Cuando llega el mensaje del OSC lo convierte
            try{
                //Normalización
                const normalized = {
                    type: "osc",
                    payload: {
                        adress: msg.adress,
                        args: (msg.args || []).map(a => a.value)
                    }
                };

                //Enviar al sistema
                if(this.onData) this.onData(normalized); //Manada el mensaje al bridgeServer
            } catch (err){
                if(this.onError) this.onError(err);
            }
        });

        this.udpPort.on("error", (err) => {
            console.error("OSC error:", err);
            if(this.onError) this.onError(err);
        });

        this.udpPort.open();
    }catch (err) {
        if(this.onError) this.onError(err);
    }
  }

  async disconnect() {
   if(this.udpPort) {
    this.udpPort.close();
    this.udpPort = null;
   }

   this.connect = false;

   if(this.onDisconnected) this.onDisconnected();
  }

  getConnectionDetail() {
    return `OSC UDP port ${this.port}`;
  }  
}
module.exports = BaseAdapter;

  
