//Maneja la conexión con el microbit, Recibe los datos del microbit y dibuja en pantalla con esos datos. 
//Utiliza una máquina de estados para manejar la lógica de la aplicación.

const EVENTS = { //Definición de los eventos
CONNECT: "CONNECT",
DISCONNECT: "DISCONNECT",
DATA: "DATA",
KEY_PRESSED: "KEY_PRESSED",
KEY_RELEASED: "KEY_RELEASED",
};

class PainterTask extends FSMTask {
    constructor() {
        super();
        this.c = color(181, 157, 0); //Color inicial del dibujo. se actualiza al soltar el botón B del microbit, con un color aleatorio.
        this.lineSize = 100;
        this.angle = 0;
        this.clickPosX = 0;
        this.clickPosY = 0;


        this.rxData  = {
            x: 0,
            y: 0,
            btnA: false,
            btnB: false,
            prevA: false,
            prevB: false,
            ready: false,
        };

        this.transitionTo(this.estado_esperando); //Estado inicial de la máquina de estados.
    }

    //Estado esperando conexión
    estado_esperando = (ev) => {
        if (ev.type === "Entry") {
            cursor();
            console.log("Esperando conexión...");

        }
        else if (ev.type === EVENTS.CONNECT) {
            this.transitionTo(this.estado_corriendo); //Transición al estado corriendo cuando se conecta el microbit.
        }
    };

    //Estado corriendo, es el estado principal de la aplicación, donde se reciben los datos del microbit y se dibuja en pantalla.
    estado_corriendo = (ev) => {
        if (ev.type === "ENTRY") {
           noCursor();
           strokeWeight(0.75);
           background(255);
           console.log("Microbit conectado, listo para dibujar");

           this.rxData = {
            x: 0,
            y: 0,
            btnA: false,
            btnB: false,
            prevA: false,
            prevB: false,
            ready: false,
           };
        }

        else if(ev.type === EVENTS.DISCONNECT) {
            this.transitionTo(this.estado_esperando); //Trasición al estado esperando cuando se desconecta el microbit.
        }
        else if(ev.type === EVENTS.DATA) {
            this.updateLogic(ev.payload); //Actualiza la lógica de dibujo con los datos recibidos del microbit.
        }
        else if(ev.type === EVENTS.KEY_PRESSED) {
            this.handleKeys(ev.keyCode, ev.key); //Maneja los eventos de teclas presionadas, en este caso, el botón A y B del microbit.
        }
        else if(ev.type === EVENTS.KEY_RELEASED) {
            this.handleKeyRelease(ev.keyCode, ev.key); //Maneja los eventos de teclas soltadas.
        }
        else if(ev.type === "EXIT") {
            cursor();
        }
    };

    //Lógica del microbit
    updateLogic(data) {
        this.rxData.ready = true;

        console.log("A:", data.btnA, "B:", data.btnB);

        this.rxData.x = map(data.x, -2048, 2047, 0, width);
        this.rxData.y = map(data.y, -2048, 2047, 0, height);

        if(this.rxData.btnA && !this.rxData.prevA) {
            this.lineSize = random(50, 160);
            this.clickPosX = this.rxData.x;
            this.clickPosY = this.rxData.y;
            console.log("Botón A presionado"); 
        }

        if(!this.rxData.btnB && this.rxData.prevB) {
            this.c = color(random(255), random(255), random(80, 100));
            console.log("Botón B soltado, color cambiado");
        }

        this.rxData.prevA = this.rxData.btnA;
        this.rxData.prevB = this.rxData.btnB;
    }
}

//SKETCH
let painter;
let bridge;
let connectBtn; 
const renderer = new Renderer();

function setup() {
    createCanvas(windowWidth, windowHeight);
    background(255);

    painter = new PainterTask();
    bridge = new BridgeClient();

    bridge.onConnect(() => {
        connectBtn.html("Desconectar");
        painter.postEvent({ type: EVENTS.CONNECT});
    });

    bridge.onDisconnect(() =>  {
        connectBtn.html("Conectar");
        painter.postEvent({ type:  EVENTS,DISCONNECT});
    });

    bridge.onStatus((s) => {
        console.log("BRIDGE STATUS:", s.state, s.detail ?? "");
    });

    bridge.onData((data) => {
        painter.postEvent({
            type: EVENTS.DATA,
            payload: {
                x: data.x,
                y: data.y,
                btnA: data.btnA,
                btnB: data.btnB,
            }
        });
    });

    connectBtn = createButton("Conectar");
    connectBtn.position(10, 10);
    connectBtn.mousePressed(() =>  {
        if(bridge.isOpen) bridge.close();
        else bridge.open();
    });

    renderer.set(painter.estado_corriendo, drawRunning);
}

function draw() {
    painter.update();
    renderer.get(painter.state)?.();
}

function drawRunning() {
let.mb = painter.rxData;

if(!mb || !mb.ready) return;

if(mb.btnB) {
    fill(painter.c);
} else {
    noFill();
}

if(mb.btnA) {
    push();
    translate(width / 2, height / 2);

    let circleResolution = int(map(mb.y, 0, height, 2, 10));
    let radius = map(mb.x, 0, width, 10, width / 2);
    let angle = TAU / circleResolution;

    beginShape();
    for(let i = 0; i <= circleResolution; i++) {
        let x = cos(angle * i) * radius;
        let y = sin(angle * i) * radius;
        vertex(x, y);
    }
    endShape();

    pop();
}
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}




