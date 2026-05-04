//Importaciones
const BaseAdapter = require("./BaseAdapter"); //Clase vase obligatoria del sistema
const osc = require("osc"); //Librería que abre un puerto UDP para recibir los mensajes de OSC

//No hay conexión todavía, solo configuración
class OSCAdapter extends BaseAdapter {
    constructor(port = 9000) { //Es el puerto donde OpenStageControl enviará los datos
        super();//Activa la herencia del BaseAdapter

        this.port = port;
        this.udpPort = null; //Donde se guarda la la conexión OSC cuando se abre
    }

    async connect() { //Se abre el puerto OSC, se empieza a escuhar la red
        try {
            //Crear el servidor UDP
            this.udpPort = new osc.UDPPort({
                localAddress: "0.0.0.0", //Escucha cualquier dispositivo en red
                localPort: this.port //El puerto 9000
            });

            this.udpPort.on("ready", () => { //Cuando el puerto ya está abierto
                this.connected = true; //Se marca el adapter como conectado
                console.log("OSC Adapter conectado en puerto", this.port);

                if (this.onConnected) this.onConnected(); //Notifica al sistema bridge/UI
            });

            this.udpPort.on("message", (msg) => { //Donde llegan todos los mensajes del OSC
                try {
                 const normalized = { //Normalización del sistema, convierte los mensajes crudos en un formato estandar
                    type: "osc", //Identifica el origen
                    payload: {
                        address: msg.address, //Especifica qué control fue usado
                        args: msg.args || [] //Valores del control
                    }
                 };

                 //Enviar al sistema 
                 if (this.onData) this.onData(normalized); //El adapter entrega un mensaje al bridge
                } catch (err) { //Si algo falla se imprime un error y se notifica en el sistema
                    if (this.onError) this.onError(err);
                }
            });

            this.udpPort.on("error", (err) => {
                console.error("OSC error:", err);
                if (this.onError) this.onError(err);
            });

            this.udpPort.open(); //Activa todo el listener OSC
        }catch (err) {
            if (this.onError) this.onError
        }
    }

    async disconnect() {
        if(this.udpPort) {
            this.udpPort.close();
            this.udpPort = null;
        }

        this.connected = false; //Cierra conexión OSC, se marca desconectado

        if(this.onDisconnected) this.onDisconnected(); //Se notifica al sistema
    }

    getConnectionDetail() {
        //Devuelve información del estado como el tipo de conexión, el puerto usado y si está conectado o no.
        return {
            type: "osc",
            port: this.port,
            connected: this.connected
        };
    }
}

module.exports = OSCAdapter;
  
