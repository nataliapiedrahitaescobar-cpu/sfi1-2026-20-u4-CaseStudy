// Maneja la conexión con el microbit, Recibe los datos del microbit y dibuja en pantalla con estos datos. Utiliza una máquina de estados para manejar la lógica de la aplicación.

const EVENTS = {
    //Definición de los eventos.
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

        this.rxData = { //Objeto donde se guardan los datos del microbit, se actualizan en la función updateLogic.
            x: 0,
            y: 0,
            btnA: false,
            btnB: false,
            prevA: false,
            prevB: false,
            ready: false
        };
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
    updateLogic(data) {
        this.rxData.ready = true;
        this.rxData.x = map(data.x,-2048,2047,0,width);
        this.rxData.y = map(data.y,-2048,2047,0,height);
        this.rxData.btnA = data.btnA;
        this.rxData.btnB = data.btnB;

        if (this.rxData.btnA && !this.prevA) {
            this.lineSize = random(50, 160);
            this.clickPosX = this.rxData.x;
            this.clickPosY = this.rxData.y;
            console.log("A pressed");
        }

        if (!this.rxData.btnB && this.prevB) {
            this.c = color(random(255), random(255), random(255), random(80, 100));
            console.log("B released");
        }

        this.prevA = this.rxData.btnA;
        this.prevB = this.rxData.btnB;
    }
}

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

    bridge.onData((data) => {
        painter.postEvent({
            type: EVENTS.DATA, payload: {
                x: data.x,
                y: data.y,
                btnA: data.btnA,
                btnB: data.btnB
            }
        });
    });

    connectBtn = createButton("Connect");
    connectBtn.position(10, 10);
    connectBtn.mousePressed(() => {
        if (bridge.isOpen) bridge.close();
        else bridge.open();
    });

    renderer.set(painter.estado_corriendo, drawRunning);
}

function draw() {
    painter.update();
    renderer.get(painter.state)?.();
}

function drawRunning() {
   // Copy from P_2_0_02
//
// Generative Gestaltung – Creative Coding im Web
// ISBN: 978-3-87439-902-9, First Edition, Hermann Schmidt, Mainz, 2018
// Benedikt Groß, Hartmut Bohnacker, Julia Laub, Claudius Lazzeroni
// with contributions by Joey Lee and Niels Poldervaart
// Copyright 2018
//
// http://www.generative-gestaltung.de
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

function setup() {
    createCanvas(720, 720);
    noFill();
    background(255);
    strokeWeight(2);
    stroke(0, 25);
}

function draw() {
    if (mb.btnA) {
        push();
        translate(width / 2, height / 2);

        // Debe mapearse al eje Y del acelerómetro.
        let circleResolution = int(map(mb.y,-2048, 2047,2, 10));

        // Debe mapearse al eje X del acelerómetro.
        let radius = map(mb.x,-2048, 2047,-width/2, width/2);
        let angle = TAU / circleResolution;

        // Debe ser activado por el botón B del dispositivo.
        if(mb.btnB) {
        fill(34, 45, 122, 50);
        } else {
        noFill();
        }

        beginShape();
        for (let i = 0; i <= circleResolution; i++) {
        let x = cos(angle * i) * radius;
        let y = sin(angle * i) * radius;
        vertex(x, y);
        }
        endShape();

        pop();
    }
}
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}