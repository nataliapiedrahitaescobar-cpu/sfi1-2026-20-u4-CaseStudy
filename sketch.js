//Maneja la conexión con el microbit y Strudel

//Definición de los eventos, se definen los tipos de mensajes que el sistema entiende
const EVENTS = {
CONNECT: "CONNECT", //  Cuando se conecta
DISCONNECT: "DISCONNECT", // Cuando se desconecta
DATA: "DATA", // Cuando llega la información
KEY_PRESSED: "KEY_PRESSED",
KEY_RELEASED: "KEY_RELEASED",
};

//Se crea una máquina de estados, o sea que el programa tiene estados y cambia entre ellos
class PainterTask extends FSMTask {
    constructor() { //Llama al constructor de la clase padre FSMTask
        super();

        //Variables para dibujar con microbit
        this.c = color(181, 157, 0);
        this.lineSize = 100;
        this.angle = 0;
        this.clickPosX = 0;
        this.clickPosY = 0;
        //Estados de datos del microbit, guarda posición, botones y el estados anterior para detectar los cambios
        this.rxData  = {
            x: 0,
            y: 0,
            btnA: false,
            btnB: false,
            prevA: false,
            prevB: false,
            ready: false,
        };

        //Variables de Strudel
        this.eventQueue = []; //Eventos que llegan a la cola
        this.activeAnimations = []; //Animaciones que ese están mostrando
        this.LATENCY_CORRECTION = 0; //Ajuste de tiempo

        //Variable OSC
        this.oscControls = {
            rgb: [255,0,80],
            sizeMultiplier: 1,
            rainbowMode: false
        };

        this.transitionTo(this.estado_esperando);
    }

    estado_esperando = (ev) => { //Arranca en estado "esperando conexión"
        if (ev.type === "ENTRY") {
            cursor();
            console.log("Waiting for connection...");
        }
        else if (ev.type === EVENTS.CONNECT) { //Se cambia al estado principal
            this.transitionTo(this.estado_corriendo);
        }
    };

    estado_corriendo = (ev) => { //Oculta el cursor y limpia pantalla
        if (ev.type === "ENTRY") {
           noCursor();
           strokeWeight(0.75);
           background(255);
           console.log("Sistema listo (microbit + strudel)");
        }

        else if(ev.type === EVENTS.DISCONNECT) { //Si se desconecta
            this.transitionTo(this.estado_esperando);
        }
        else if(ev.type === EVENTS.DATA) { //Si llega data (Solo para microbit)
            this.updateLogic(ev.payload);
        }
        else if(ev.type === "EXIT") {
            cursor();
        }
    };

    updateLogic(data) { //Aquí se actualizan posiciones y botones 
        this.rxData.ready = true;

        this.rxData.x = map(data.x, -2048, 2047, 0, width);
        this.rxData.y = map(data.y, -2048, 2047, 0, height);

        if(this.rxData.btnA && !this.rxData.prevA) {
            this.lineSize = random(50, 160);
            this.clickPosX = this.rxData.x;
            this.clickPosY = this.rxData.y;
        }

        if(!this.rxData.btnB && this.rxData.prevB) {
            this.c = color(random(255), random(255), random(80, 100));
        }

        this.rxData.prevA = this.rxData.btnA;
        this.rxData.prevB = this.rxData.btnB;
    }

    handleStrudel(data) { //Es donde se reciben los eventos musicales
        if(!data.payload) return; //Si no hay datos, no hace nada.

        let params = data.payload; //Guarda parámetros como el sonido y la duración

        //Sincronización del tiempo
        if(!this.synced){//Sincronización del tiempo, ajusta Strudel al reloj del navegador 
            this.timeOffset = Date.now() - data.timestamp;
            this.synced = true;
            console.log("SYNC OK", this.timeOffset);
        }

        this.eventQueue.push({ //Se meten los eventos en cola
            timestamp: data.timestamp + this.timeOffset,
            sound: params.s,
            delta: params.delta || 0.25
        });

        console.log("Evento agregado:", params.s);

        this.eventQueue.sort((a, b) => a.timestamp - b.timestamp);
    }

    handleOSC(data){
        if(!data.payload) return;

        const address = data.payload.address
        const args = data.payload.args || [];

        console.log("OSC:", address, args);

        // RGB Control
        if(address === "/rgb_1"){
            this.oscControls.rgb = [
                Number(args[0] || 0),
                Number(args[1] || 0),
                Number(args[2] || 0),
            ];
        }

        //Size Control
        if(address === "/size") {
            this.oscControls.sizeMultiplier =
            Number(args[0] || 1);
        }

        //Mode Control
        if(address === "/rainbow") {
            this.oscControls.rainbowMode =
            Boolean(args[0]);
        }
    }

    processStrudel() {//Donde se ejecuta cada frame
        if(!this.eventQueue || this.eventQueue.length === 0) return; //Si no hay eventos, sale rápido

        let now = Date.now() + this.LATENCY_CORRECTION; //Tiempo actual

        while(
            this.eventQueue.length > 0 &&
            now >= this.eventQueue[0].timestamp
        ) {
            let ev = this.eventQueue.shift(); //Sacar eventos

            //Crear animaciones, esto es lo que luego se dibuja
            this.activeAnimations.push({
                startTime: now,
                duration: ev.delta * 2000, 
                type: ev.sound,
                x: random(width * 0.2, width * 0.8),
                y: random(height * 0.2, height * 0.8),
                color: getColorForSound(ev.sound)
            });

            console.log("Animación creada:", this.activeAnimations.length);
        }
    }
}

// SKETCH
let painter;
let bridge; //Strudel, microbit y OSC.
let connectBtn; 
const renderer = new Map();


function setup() {
    createCanvas(windowWidth, windowHeight);
    background(255);

    rectMode(CENTER); 
    painter = new PainterTask();
    bridge = new BridgeClient("ws://127.0.0.1:8081"); //Strudel
    

    bridge.onConnect(() => {
        connectBtn.html("Desconectar");
        painter.postEvent({ type: EVENTS.CONNECT});
    });

    bridge.onDisconnect(() =>  {
        connectBtn.html("Conectar");
        painter.postEvent({ type: EVENTS.DISCONNECT});
    });

    bridge.onData((data) => { //Es cuando llega la data y empieza el flujo de Strudel

        console.log("DATA RECIBIDA:", data);

        if(data.type === "strudel"){
            painter.handleStrudel(data);
        }

        if(data.type === "osc") {
            painter.handleOSC(data);
        }
    });

    oscBridge.onData((data) => {
        console.log("OSC RECIBIDO:", data);

        if(data.type === "osc") {
            painter.handleOSC(data);
        }
    });

    connectBtn = createButton("Conectar");
    connectBtn.position(10, 10);
    connectBtn.mousePressed(() =>  {
        if(bridge.isOpen) {
            bridge.close();
            oscBridge.close();
        }
        else {
            bridge.open();
            oscBridge.open();
        }
    });

    renderer.set(painter.estado_corriendo, drawRunning); //Define que función se dibuja en el estado
}

function draw() { //Actualiza el estado y dibuja en cada estado
    painter.update();
    renderer.get(painter.state)?.();
}

function drawRunning() {
    background(0, 30); //Fondo semistransparente 

    painter.processStrudel(); //Procesar eventos

    let now = Date.now();

    if(painter.oscControls.rainbowMode){
        colorMode(HSB);

        let hue = (frameCount * 2) % 255;

        background(hue, 150, 80, 0.1);

        colorMode(RGB);
    }

    for(let i = painter.activeAnimations.length - 1; i >= 0; i--) { //Loop de animaciones
        let anim = painter.activeAnimations[i];

        let elapsed = now - anim.startTime;
        let progress = elapsed / anim.duration;

        if(progress <= 1.0) { //Dibujar o eliminar animación 
            dibujarElemento(anim, progress);
        } else {
            painter.activeAnimations.splice(i, 1);
        }
    }
}

// VISUALES
const visualMap = {//Se asocian sonidos a funciones
    'tr909bd': dibujarBombo,
    'tr909sd': dibujarCaja,
    'tr909hh': dibujarHat,
    'tr909oh': dibujarHat
};

function dibujarElemento(anim, p){
    push();
    let fn = visualMap[anim.type] || dibujarDefault; //Dibujar elementos
    fn(anim, p, anim.color);
    pop();
}

//Funciones de dibujo
function dibujarBombo(anim, p, c) {
    let d = lerp(100,600* painter.oscControls.sizeMultiplier,p);
    let alpha = lerp(255, 0, p);
    fill(c[0], c[1], c[2], alpha);
    noStroke();
    circle(width / 2, height / 2, d);
}

function dibujarCaja(anim, p, c) {
    let w = lerp(width, 0, p);
    fill(c[0], c[1], c[2]);
    noStroke();
    rect(width / 2, height / 2, w, 50);
}

function dibujarHat(anim, p , c){
    let sz = lerp(40, 0, p);
    fill(c[0], c[1], c[2]);
    noStroke();
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
        'tr909bd': painter.oscControls.rgb,
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