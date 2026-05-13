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

      this.rxData.btnA = data.btnA;
      this.rxData.btnB = data.btnB;

      if(!this.rxData.btnA && !this.rxData.prevA) {

        this.lineSize = random(50, 160);

        this.c = color(
            random(255),
            random(255),
            random(80, 100)
        );
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

    processStrudel() {
        //Donde se ejecuta cada frame
        if(!this.eventQueue || this.eventQueue.length === 0) return; //Si no hay eventos, sale rápido

        let now = Date.now() + this.LATENCY_CORRECTION; //Tiempo actual

        while(
            this.eventQueue.length > 0 &&
            now >= this.eventQueue[0].timestamp
        ) {
            let ev = this.eventQueue.shift(); //Sacar eventos
            if(!ev.sound) continue;

            //Crear animaciones, esto es lo que luego se dibuja
            this.activeAnimations.push({
                startTime: now,
                duration: ev.delta * 2000,
                type: ev.sound,
                x: random(width * 0.2, width * 0.8),
                y: random(height * 0.2, height * 0.8),
                color: getColorForSound(ev.sound)
            });

            if(
                ev.sound === "tr909bd" &&
                this.rxData.btnA &&
                this.oscControls.rainbowMode
            ){
                for(let i = 0; i < 80; i++){

                    this.activeAnimations.push({
                        startTime: now,
                        duration: random(400, 1200),
                        type: "explosion",
                        x: random(width),
                        y: random(height),
                        color: [
                            random(255),
                            random(255),
                            random(255),
                        ]
                    });
                }
            }

        }
     
    }
}
                

            

// SKETCH
let painter;
let bridge; //Strudel, microbit y OSC.
let connectBtn; 
const renderer = new Map();

let particles = [];

function setup() {
    createCanvas(windowWidth, windowHeight);
    background(255);

    rectMode(CENTER);

    background(0);

    for(let i = 0; i < 1000; i++) {
        particles.push(new Particle());
    }

    painter = new PainterTask();

    // Bridge principal
    bridge = new BridgeClient("ws://127.0.0.1:8081");

    // BOTÓN
    connectBtn = createButton("Conectar");
    connectBtn.position(10, 10);

    // EVENTOS DE CONEXIÓN
    bridge.onConnect(() => {
        console.log("Bridge conectado");

        connectBtn.html("Desconectar");

        painter.postEvent({
            type: EVENTS.CONNECT
        });
    });

    bridge.onDisconnect(() => {
        console.log("Bridge desconectado");

        connectBtn.html("Conectar");

        painter.postEvent({
            type: EVENTS.DISCONNECT
        });
    });

    // DATOS RECIBIDOS
    bridge.onData((data) => {

        console.log("DATA RECIBIDA:", data);

        // STRUDEL
        if (data.type === "strudel") {
            painter.handleStrudel(data);
        }

        // OSC
        else if (data.type === "osc") {
            painter.handleOSC(data);
        }

        // MICROBIT
        else if (data.type === "microbit") {

            painter.postEvent({
                type: EVENTS.DATA,
                payload: data
            });
        }
    });

    // BOTÓN CONECTAR / DESCONECTAR
    connectBtn.mousePressed(() => {

        if (bridge.isOpen) {

            console.log("Cerrando bridge...");
            bridge.close();

        } else {

            console.log("Abriendo bridge...");
            bridge.open();
        }
    });

    // RENDER
    renderer.set(
        painter.estado_corriendo,
        drawRunning
    );
}

function draw() { //Actualiza el estado y dibuja en cada estado
    painter.update();
    renderer.get(painter.state)?.();
}

function drawRunning() {
    background(0, 18); //Fondo semistransparente 

    painter.processStrudel(); //Procesar eventos

    //OSC rainbow mode
    if(painter.oscControls.rainbowMode) {

        colorMode(HSB);

        let hue = (frameCount * 2) % 255;

        background(hue, 120, 30, 0.05);

        colorMode(RGB);
    }

    //Partículas
    for(let p of particles){

        p.update();
        p.draw();
    }

    //Visuales de Strudel
    let now = Date.now();

    for(let i = painter.activeAnimations.length - 1; i >= 0; i--) {

        let anim = painter.activeAnimations[i];

        let elapsed = now - anim.startTime;

        let progress = elapsed / anim.duration;

        if(progress <= 1.0) {

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
    'tr909oh': dibujarHat,
    'explosion': dibujarExplosion
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

function dibujarExplosion(anim, p, c){

    let size = lerp(10, 200, p);
    let alpha = lerp(255, 0, p);

    noFill();

    stroke(c[0], c[1], c[2], alpha);

    strokeWeight(2);

    circle(anim.x, anim.y, size);

    line(
        anim.x - size * 0.5,
        anim.y,
        anim.x + size * 0.5,
        anim.y
    );

    line(
        anim.x,
        anim.y - size * 0.5,
        anim.x,
        anim.y + size * 0.5
    );
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

class Particle {

    constructor(){
        this.pos = createVector(
            random(width),
            random(height)
        );

        this.prev = this.pos.copy();

        this.vel = createVector();

        this.speed = random(1, 4);

        this.alpha = random(20, 80);
    }

    update(){
        this.prev = this.pos.copy();

        //Microbit controla el flow field
        let noiseScale = map(
            painter.rxData.x, 
            0,
            width,
            0.001,
            0.1
        );

        let angleOffset = map(
            painter.rxData.y,
            0,
            height,
            -PI,
            PI
        );

        let angle = noise(
            this.pos.x * noiseScale,
            this.pos.y * noiseScale,
            frameCount * 0.003
        ) * TWO_PI * 6;

        angle += angleOffset;

        this.vel.x = cos(angle);
        this.vel.y = sin(angle);

        this.pos.add(
            this.vel.copy().mult(this.speed)
        );

      //Wrap screen
      if(this.pos.x > width) {
        this.pos.x = 0;
        this.prev = this.pos.copy();
      }

      if(this.pos.x < 0) {
        this.pos.x = width;
        this.prev = this.pos.copy();        
      }

      if(this.pos.y > height) {
        this.pos.y = 0;
        this.prev = this.pos.copy();
      }

      if(this.pos.y < 0) {
        this.pos.y = height;
        this.prev = this.pos.copy();
      }

      //Botón A: Explosión
      if(painter.rxData.btnA) {

        this.pos.add(
            p5.Vector.random2D().mult(10)
        );
      }
    }

    draw() {
         let c= painter.oscControls.rgb;

         stroke(
            c[0],
            c[1],
            c[2],
            this.alpha
         );

      strokeWeight(
        painter.oscControls.sizeMultiplier
      );

      line(
        this.prev.x,
        this.prev.y,
        this.pos.x,
        this.pos.y
      );
    }
}
