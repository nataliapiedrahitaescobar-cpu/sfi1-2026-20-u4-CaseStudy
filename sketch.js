let painter;
let bridge;
let connectBtn;
let renderer = new Map();

function setup() {
    createCanvas(windowWidth, windowHeight);
    background(0);

    painter = new PainterTask(); //Crea una nueva tarea de pintura, que es la máquina de estados que controla la pintura en el canvas.
    bridge = new BridgeClient(); //Crea una nueva instancia del cliente del puente, que se conecta al servidor del puente para recibir los datos del microbit y el strudel.

    //Conexión con el bridge.
    bridge.onConnect(() => {
        connectBtn.html("Disconnect");
        painter.postEvent({ type: "CONNECT"});
    });

    bridge.onDisconnect(() => {
        connectBtn.html("Connect");
        painter.postEvent({ type: "DISCONNECT"});
    });

    bridge.onStatus((s) => {
        console.log("BRIDEGE STATUS:", s.state, s.detail ?? "");
    });

    //Aquí llegan todos los datos del microbit y el strudel.
    bridge.onData((data)=> {
         //Strudel
         if (data.type === "strudel") {
            painter.postEvent({
                type: "Strudel",
                timestamp: data.timestamp,
                payload: data.payload
            });
         }

         //Microbit
         else if (data.type === "microbit") {
            painter.postEvent({
                type: "DATA",
                payload: data
            });
         }
    });

    //Botón 
    connectBtn = createButton("Connect");
    connectBtn.position(10,10);
    connectBtn.mousePressed(() => {
        if (bridge.isOpen) bridge.close();
        else bridge.open();
    });

    renderer.set(painter.estado_corriendo, drawRunning);
}

function draw() {
    painter.update();
    renderer.get(painter.state)?.(); //Llama a la función de renderizado correspondiente al estado actual de la máquina de estados.
}

function drawRunning() {
    background(0, 40);

    //Activar eventos en el tiempo correcto
    painter.processEvents();

    //Dibujo de Strudel
    for (let anim of painter.ActiveAnimations) {

        let now = Date.now(); //Tiempo actual para calcular la animación.
        let progress = (now - anim.startTime) / anim.duration; //Progeso de la animación.

        if (progress > 1) continue; //Si la animación ha terminado, saltar a la siguiente.

        switch (anim.type) {
            
            case "tr909bd": //Bombo
            fill (255, 0, 80);
            noStroke();
            circle(width / 2, height / 2, lerp(50, 300, progress)); //Dibuja un círculo que crece con el tiempo.
            break;

            case "tr909sd": //Caja
            fill (0, 200, 255);
            rectMode(CENTER); 
            rect(width / 2, height / 2, lerp(width, 0, progress), 50); //Dibuja un rectángulo que se encoge con el tiempo.
            break; 

            case "tr909hh":
            case "tr909oh": //Hi-hat abierto y cerrado
            fill (255, 255, 0);
            rect(anim.x, anim.y, lerp(40, 0, progress), lerp(40, 0, progress)); //Dibuja un rectángulo que se encoge con el tiempo en la posición del hi-hat.
            break;

            default:
                fill(255);
                noFill();
                rect(anim.x, anim.y, lerp(100, 0, progress), lerp(100, 0, progress)); //Dibuja un rectángulo genérico para otros tipos de animaciones.
                break;
        }
    }

}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
} 