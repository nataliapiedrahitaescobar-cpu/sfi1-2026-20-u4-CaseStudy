// Maneja la conexión con el microbit, Recibe los datos del microbit y dibuja en pantalla con estos datos. Utiliza una máquina de estados para manejar la lógica de la aplicación.


class PainterTask extends FSMTask {
    constructor() {
        super();

        this.c = color(181, 157, 0); //Color inicial del dibujo. se actualiza al soltar el botón B del microbit, con un color aleatorio.
        this.lineSize = 100;
        this.angle = 0;
        this.clickPosX = 0;
        this.clickPosY = 0;

        this.rxData = { //Objeto donde se guardan los datos del microbit, se actualizan en la función updateLogic.
            x: 0,
            y: 0,
            btnA: false,
            btnB: false,
            prevA: false,
            prevB: false,
            ready: false
        };

        //Strudel
        this.eventQueue = [];
        this.activeAnimations = [];
        //Es donde se guardan los datos recibidos del microbit, se actualizan en la función updateLogic.
        this.transitionTo(this.estado_esperando);
    }
  
    //Estado donde todavía no hay conexión con el microbit.
    estado_esperando = (ev) => {
        if (ev.type === "ENTRY") {
            cursor();
            console.log("Waiting for connection...");
        } else if (ev.type === EVENTS.CONNECT) {
            this.transitionTo(this.estado_corriendo);
        }
    };

    //El microbit ya está conectado, se reciben los datos y se dibuja en pantalla.
    estado_corriendo = (ev) => {
        if (ev.type === "ENTRY") {
            noCursor();
            strokeWeight(0.75);
            background(255);
            console.log("Microbit ready to draw");
            this.rxData = {
                x: 0,
                y: 0,
                btnA: false,
                btnB: false,
                prevA: false,
                prevB: false,
                ready: false
            };
        }

        else if (ev.type === EVENTS.DISCONNECT) { //Cuando el bridge recibe los datos de desconexión, se vuelve al estado de espera.
            this.transitionTo(this.estado_esperando);
        }

        else if (ev.type === EVENTS.DATA) {
            this.updateLogic(ev.payload); //Se procesan los datos del microbit.
        }

        else if (ev.type === EVENTS.STRUDEL) {
          this.updateStrudel(ev); //Se procesan los datos del strudel, aunque en este caso no se hace nada con ellos.
        }

        else if (ev.type === EVENTS.KEY_PRESSED) {
            this.handleKeys(ev.keyCode, ev.key);
        }

        else if (ev.type === EVENTS.KEY_RELEASED) {
            this.handleKeyRelease(ev.keyCode, ev.key);
        }

        else if (ev.type === "EXIT") {
            cursor();
        }
    };
    //Convierte los valores del acelerómetro a coordenadas de la pantalla y maneja la lógica de los botones.
    //Lógico del microbit.
    updateLogic(data) {
        this.rxData.ready = true;
        console.log("A:", data.btnA, "B:", data.btnB)
        this.rxData.x = map(data.x,-2048,2047,0,width);
        this.rxData.y = map(data.y,-2048,2047,0,height);
        this.rxData.btnA = data.btnA == 1 || data.btnA === true;
        this.rxData.btnB = data.btnB == 1 || data.btnB === true;

        if (this.rxData.btnA && !this.rxData.prevA) {
            this.lineSize = random(50, 160);
            this.clickPosX = this.rxData.x;
            this.clickPosY = this.rxData.y;
            console.log("A pressed");
        }

        if (!this.rxData.btnB && this.rxData.prevB) {
            this.c = color(random(255), random(255), random(255), random(80, 100));
            console.log("B released");
        }

        this.rxData.prevA = this.rxData.btnA;
        this.rxData.prevB = this.rxData.btnB;
    }

    //Lógica del Strudel.
    updateStrudel(ev) {
        this.eventQueue.push({
            timestamp: ev.timestamp,
            s: ev.payload.s,
            delta: ev.payload.delta || 0.25
        });

        this.eventQueue.sort((a,b)  => a.timestamp - b.timestamp);
    }

    processStrudel() {
        let now = Date.now();

        while(
            this.eventQueue.length > 0 &&
            now >= this.eventQueue[0].timestamp
        ) {
            let ev = this.eventQueue.shift();

            this.activeAnimations.push({
                startTime: ev.timestamp,
                duration: ev.delta * 1000,
                type: ev.s,
                x: random(width),
                y: random(height)
            });
        }
    }
}


let painter;
let bridge;
let connectBtn;
const renderer = new Map();

function setup() { //Crea el canvas, usa todo el tamaño de la ventana y pinta el fondo de blanco (255).
    createCanvas(windowWidth, windowHeight);
    background(255);
    painter = new PainterTask(); //Es el objeto principal de la aplicación.
    bridge = new BridgeClient(); //Puente de comunicación con el microbit.

    bridge.onConnect(() => {
        connectBtn.html("Disconnect");
        painter.postEvent({ type: EVENTS.CONNECT });
    });

    bridge.onDisconnect(() => {
        connectBtn.html("Connect");
        painter.postEvent({ type: EVENTS.DISCONNECT });
    });

    bridge.onStatus((s) => {
        console.log("BRIDGE STATUS:", s.state, s.detail ?? "");
    });

    //Se diferencian microbit data del strudel data.
  bridge.onData((data) => {

        // MICROBIT
        if (data.type === "microbit" || data.x !== undefined) {
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

        // STRUDEL
        else if (data.type === "strudel") {
            painter.postEvent({
                type: EVENTS.STRUDEL,
                timestamp: data.timestamp,
                payload: data.payload
            });
        }
    });

    // BOTÓN (NO SE TOCA)
    connectBtn = createButton("Connect");
    connectBtn.position(10, 10);
    connectBtn.mousePressed(() => {
        if (bridge.isOpen) bridge.close();
        else bridge.open();
    });

    renderer.set(painter.estado_corriendo, drawRunning);
}

function draw() {//Se ejecuta 60 veces por segundo.
    painter.update(); //Actualiza la máquina de estados.
    //Ejecutar eventos temporizados del strudel
    painter.processStrudel();

    renderer.get(painter.state)?.();
}

function drawRunning() { //Ejecuta cada frame mientras la máquina de estados esté en estado_corriendo.
   let mb = painter.rxData;//Busca que función dibuja el estado actual, se obtiene  los datos que llegaron del microbit.
   
   if(!mb || !mb.ready) return; //Verifica si llegaron los datos del microbit, si no llegaron, no hace nada.

   if (mb.btnB){
    fill(painter.c);
   }else{
    noFill();
   }

   if(mb.btnA) {
    push();
    translate(width / 2, height / 2);
    
    let circleResolution = int(map(mb.y, 0, height, 2, 10));
    let radius = map(mb.x, 0, width, 10, width / 2);
    let angle = TAU / circleResolution;

    beginShape();
    for(let i = 0; i <= circleResolution; i++){
        let x = cos(angle * i) * radius;
        let y = sin(angle * i) * radius;
        vertex(x,y);
    }
    endShape();
    pop();
   }
}
//Strudel
let now = Date.now();

    for (let i = painter.activeAnimations.length - 1; i >= 0; i--) {
        let anim = painter.activeAnimations[i];

        let progress = (now - anim.startTime) / anim.duration;

        if (progress <= 1) {
            drawStrudel(anim, progress);
        } else {
            painter.activeAnimations.splice(i, 1);
        }
    }

//Dibujar strudel
function drawStrudel(anim, p) {

    switch (anim.type) {

        case "tr909bd":
            fill(255, 0, 80);
            circle(width / 2, height / 2, lerp(50, 400, p));
            break;
        
        case "tr909sd":
            fill(0, 200, 255);
            rect(width / 2, height / 2, lerp(width, 0, p), 50);
            break;
        
        case "tr909hh":
        case "tr909oh":
            fill(255, 255, 0);
            rect(anim.x, anim.y, lerp(40, 0, p), lerp(40, 0, p));
            break;

        default:
            fill(200);
            circle(anim.x, anim.y, lerp(20, 100, p));
            break;
        }
    }
    
function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}










