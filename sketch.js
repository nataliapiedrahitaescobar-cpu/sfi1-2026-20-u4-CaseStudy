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

        //Microbit data
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

        //Strudel data
        this.eventQueue = [];
        this.activeAnimations = [];
        this.LATENCY_CORRECTION = 0; //Tiempo en ms para corregir la latencia de la conexión, se puede ajustar según la calidad de la conexión.

        this.transitionTo(this.estado_esperando); //Estado inicial de la máquina de estados.
    }

    //Estado esperando conexión
    estado_esperando = (ev) => {
        if (ev.type === "ENTRY") {
            cursor();
            console.log("Waiting for connection...");

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

    //Strudel
    handleStrudel(ev) {
        if(!ev.payload || !ev.payload.args) return; //Valida que el evento tenga payload y args antes de procesarlo.

        let params = {}; //Objeto para almacenar los parámetros del evento.
        let args = ev.payload.args; 

        for(let i = 0; i < args.length; i += 2) { 
            params[args[i]] = args[i + 1];
        }

        this.eventQueue.push({
            timestamp: Date.now() + 50,
            sound: params.s,
            delta: params.delta || 0.25
        });

        this.eventQueue.sort((a, b) => a.timestamp - b.timestamp); 

    }

    processStrudel() {
        let now = Date.now() + this.LATENCY_CORRECTION;

        console.log("QUEUE:", this.eventQueue[0].length);

        while(
            this.eventQueue.length > 0 &&
            now >= this.eventQueue[0].timestamp
        ) {
            let ev = this.eventQueue.shift();

            this.activeAnimations.push({
                startTime: ev.timestamp,
                duration: ev.delta * 2000,
                type: ev.sound,
                x: random(width * 0.2, width * 0.8),
                y: random(height * 0.2, height * 0.8),
                color: getColorForSound(ev.sound) 
            });

            console.log("ANIMACIÓN CREADA:", ev.sound);
        }

        console.log("ACTIVE:", this,this.activeAnimations.length);
    }
}

//SKETCH
let painter;
let bridge;
let connectBtn; 
const renderer = new Map();

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
        painter.postEvent({ type:  EVENTS.DISCONNECT});
    });

    bridge.onStatus((s) => {
        console.log("BRIDGE STATUS:", s.state, s.detail ?? "");
    });

    bridge.onData((data) => {
        console.log("DATA RECIBIDA:", data);
        //Microbit
        if(data.type === "microbit") {
            painter.postEvent({
                type: EVENTS.DATA,
                payload: {
                    x: data.x,
                    y: data.y,
                    btnA: data.btnA,
                    btnB: data.btnB
                }
            });
        }

        //Strudel
        else if(data.type === "strudel"){
            painter.handleStrudel(data);
        }
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
 background(0);

 painter.processStrudel();

 let now = Date.now() + painter.LATENCY_CORRECTION;

 for(let i = painter.activeAnimations.length - 1; i >= 0; i--) {
    let anim = painter.activeAnimations[i];

    let elapsed = now - anim.startTime;
    let progress = elapsed / anim.duration;

    if(progress <= 1.0) {
        dibujarElemento(anim, progress);
    } else{
        painter.activeAnimations.splice(i, 1);
    }
 }
    
}

//Visuales Strudel
const visualMap = {
    'tr909bd': dibujarBombo,
    'tr909sd': dibujarCaja,
    'tr909hh': dibujarHat,
    'tr909oh': dibujarHat
};

function dibujarElemento(anim, p){
    push();
    let fn = visualMap[anim.type] || dibujarDefault;
    fn(anim, p, anim.color);
    pop();
}

function dibujarBombo(anim, p, c) {
    let d = lerp(100, 600, p);
    let alpha = lerp(255, 0, p);
    fill(c[0], c[1], c[2], alpha);
    circle(width / 2, height / 2, 50);
}

function dibujarCaja(anim, p, c) {
    let w = lerp(width, 0, p);
    let alpha = lerp(255, 0, p);
    fill(c[0], c[1], c[2], alpha);
    rect(width / 2, height / 2, w, 50);
}

function dibujarHat(anim, p , c){
    let sz = lerp(40, 0, p);
    fill(c[0], c[1], c[2]);
    rect(anim.x, anim.y, sz, sz);
}

function dibujarDefault(anim, p, c) {
    let size = lerp(100, 0, p);
    let angle = p * TWO_PI;

    translate(anim.x, anim.y)
    rotate(angle);

    stroke(c[0], c[1], c[2]);
    strokeWeight(2);
    noFill();

    rect(0, 0, size, size);
    line(-size, 0, size, 0);
    line(0, -size, 0, size);
}

function getColorForSound(s) {
    const colors = {
        'tr909bd': [255, 0, 80],
        'tr909sd': [0, 200, 255],
        'tr909hh': [255, 255, 0],
        'tr909oh': [255, 150, 0]
    };

    if (colors[s]) return colors[s];

    let charCode = s.charCodeAt(0) || 0;
    return [
        (charCode * 123) % 255,
        (charCode * 456) % 255,
        (charCode * 789) % 255
    ];
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}




