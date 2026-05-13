//Maneja la conexión con el microbit y Strudel

//Definición de los eventos
const EVENTS = {
    CONNECT: "CONNECT",
    DISCONNECT: "DISCONNECT",
    DATA: "DATA",
    KEY_PRESSED: "KEY_PRESSED",
    KEY_RELEASED: "KEY_RELEASED",
};

// ========================================
// FSM
// ========================================

class PainterTask extends FSMTask {

    constructor() {

        super();

        // Variables visuales
        this.c = color(181, 157, 0);
        this.lineSize = 100;

        this.cameraShake = 0;

        // Estado microbit
        this.rxData = {
            x: 0,
            y: 0,
            btnA: false,
            btnB: false,
            prevA: false,
            prevB: false,
            ready: false,
        };

        // Strudel
        this.eventQueue = [];
        this.activeAnimations = [];
        this.LATENCY_CORRECTION = 0;

        // OSC
        this.oscControls = {
            rgb: [255, 0, 80],
            sizeMultiplier: 1,
            rainbowMode: false
        };

        this.transitionTo(this.estado_esperando);
    }

    estado_esperando = (ev) => {

        if (ev.type === "ENTRY") {

            cursor();
            console.log("Waiting for connection...");
        }

        else if (ev.type === EVENTS.CONNECT) {

            this.transitionTo(this.estado_corriendo);
        }
    };

    estado_corriendo = (ev) => {

        if (ev.type === "ENTRY") {

            noCursor();

            strokeWeight(0.75);

            background(0);

            console.log(
                "Sistema listo (microbit + strudel)"
            );
        }

        else if (ev.type === EVENTS.DISCONNECT) {

            this.transitionTo(this.estado_esperando);
        }

        else if (ev.type === EVENTS.DATA) {

            this.updateLogic(ev.payload);
        }

        else if (ev.type === "EXIT") {

            cursor();
        }
    };

    updateLogic(data) {

        this.rxData.ready = true;

        this.rxData.x = map(
            data.x,
            -2048,
            2047,
            0,
            width
        );

        this.rxData.y = map(
            data.y,
            -2048,
            2047,
            0,
            height
        );

        this.rxData.btnA = data.btnA;
        this.rxData.btnB = data.btnB;

        if (
            !this.rxData.btnA &&
            !this.rxData.prevA
        ) {

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

    handleStrudel(data) {

        if (!data.payload) return;

        let params = data.payload;

        // Sincronización
        if (!this.synced) {

            this.timeOffset =
                Date.now() - data.timestamp;

            this.synced = true;

            console.log(
                "SYNC OK",
                this.timeOffset
            );
        }

        this.eventQueue.push({

            timestamp:
                data.timestamp + this.timeOffset,

            sound: params.s,

            delta: params.delta || 0.25
        });

        this.eventQueue.sort(
            (a, b) => a.timestamp - b.timestamp
        );
    }

    handleOSC(data) {

        if (!data.payload) return;

        const address = data.payload.address;

        const args = data.payload.args || [];

        console.log("OSC:", address, args);

        // RGB
        if (address === "/rgb_1") {

            this.oscControls.rgb = [

                Number(args[0] || 0),
                Number(args[1] || 0),
                Number(args[2] || 0),
            ];
        }

        // SIZE
        if (address === "/size") {

            this.oscControls.sizeMultiplier =
                Number(args[0] || 1);
        }

        // RAINBOW
        if (address === "/rainbow") {

            this.oscControls.rainbowMode =
                Boolean(args[0]);
        }
    }

    processStrudel() {

        if (
            !this.eventQueue ||
            this.eventQueue.length === 0
        ) return;

        let now =
            Date.now() +
            this.LATENCY_CORRECTION;

        while (

            this.eventQueue.length > 0 &&
            now >= this.eventQueue[0].timestamp

        ) {

            let ev = this.eventQueue.shift();

            if (!ev.sound) continue;

            this.activeAnimations.push({

                startTime: now,

                duration: ev.delta * 2000,

                type: ev.sound,

                x: random(
                    width * 0.2,
                    width * 0.8
                ),

                y: random(
                    height * 0.2,
                    height * 0.8
                ),

                color: getColorForSound(ev.sound)
            });

            // Camera shake
            if (ev.sound === "tr909bd") {

                this.cameraShake = 20;
            }

            // Explosiones
            if (

                ev.sound === "tr909bd" &&
                this.rxData.btnA &&
                this.oscControls.rainbowMode

            ) {

                for (let i = 0; i < 30; i++) {

                    this.activeAnimations.push({

                        startTime: now,

                        duration: random(
                            400,
                            1200
                        ),

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

// ========================================
// SKETCH
// ========================================

let painter;
let bridge;
let connectBtn;

let shaderLayer;
let glowShader;

const renderer = new Map();

let particles = [];

// ========================================
// SHADERS
// ========================================

const vertexShader = `

attribute vec3 aPosition;

void main() {

    gl_Position = vec4(
        aPosition,
        1.0
    );
}
`;

const fragShader = `

precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;

void main() {

    vec2 st =
        gl_FragCoord.xy /
        u_resolution;

    float wave =

        sin(
            st.x * 10.0 +
            u_time * 2.0
        )

        *

        cos(
            st.y * 10.0 +
            u_time * 2.0
        );

    float glow = abs(wave);

    vec3 color = vec3(

        0.1 + glow * 0.8,

        0.2 + glow * 0.3,

        0.5 + glow
    );

    gl_FragColor =
        vec4(color * 0.25, 0.015);
}
`;

// ========================================
// SETUP
// ========================================

function setup() {

    createCanvas(
        windowWidth,
        windowHeight
    );

    shaderLayer = createGraphics(
        windowWidth,
        windowHeight,
        WEBGL
    );

    glowShader =
        shaderLayer.createShader(
            vertexShader,
            fragShader
        );

    background(0);

    rectMode(CENTER);

    // Partículas
    for (let i = 0; i < 1000; i++) {

        particles.push(
            new Particle()
        );
    }

    painter = new PainterTask();

    // Bridge
    bridge = new BridgeClient(
        "ws://127.0.0.1:8081"
    );

    // Botón
    connectBtn = createButton(
        "Conectar"
    );

    connectBtn.position(10, 10);

    // Eventos
    bridge.onConnect(() => {

        console.log(
            "Bridge conectado"
        );

        connectBtn.html(
            "Desconectar"
        );

        painter.postEvent({
            type: EVENTS.CONNECT
        });
    });

    bridge.onDisconnect(() => {

        console.log(
            "Bridge desconectado"
        );

        connectBtn.html(
            "Conectar"
        );

        painter.postEvent({
            type: EVENTS.DISCONNECT
        });
    });

    // Datos
    bridge.onData((data) => {

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

    // Botón connect
    connectBtn.mousePressed(() => {

        if (bridge.isOpen) {

            bridge.close();

        } else {

            bridge.open();
        }
    });

    renderer.set(
        painter.estado_corriendo,
        drawRunning
    );
}

// ========================================
// DRAW
// ========================================

function draw() {

    painter.update();

    renderer
        .get(painter.state)
        ?.();
}

function drawRunning() {

    push();

    // Camera shake
    translate(

        random(
            -painter.cameraShake,
            painter.cameraShake
        ),

        random(
            -painter.cameraShake,
            painter.cameraShake
        )
    );

    painter.cameraShake *= 0.9;

    // Fondo fade
    background(0, 25);

    // ========================================
    // SHADER
    // ========================================

    shaderLayer.clear();

    shaderLayer.shader(glowShader);

    glowShader.setUniform(
        "u_resolution",
        [width, height]
    );

    glowShader.setUniform(
        "u_time",
        millis() * 0.001
    );

    shaderLayer.noStroke();

    shaderLayer.push();

    shaderLayer.translate(
        -width / 2,
        -height / 2
    );

    shaderLayer.rect(
        0,
        0,
        width,
        height
    );

    shaderLayer.pop();

    image(shaderLayer, 0, 0);

    // ========================================
    // STRUDEL
    // ========================================

    painter.processStrudel();

    // ========================================
    // RAINBOW MODE
    // ========================================

    if (
        painter.oscControls.rainbowMode
    ) {

        colorMode(HSB);

        let hue =
            (frameCount * 2) % 255;

        background(
            hue,
            120,
            30,
            0.05
        );

        colorMode(RGB);
    }

    // ========================================
    // PARTICLES
    // ========================================

    for (let p of particles) {

        p.update();
        p.draw();
    }

    // Limitar exceso
    if (
        painter.activeAnimations.length > 120
    ) {

        painter.activeAnimations.splice(
            0,
            painter.activeAnimations.length - 120
        );
    }

    // ========================================
    // ANIMATIONS
    // ========================================

    let now = Date.now();

    for (

        let i =
            painter.activeAnimations.length - 1;

        i >= 0;

        i--

    ) {

        let anim =
            painter.activeAnimations[i];

        let elapsed =
            now - anim.startTime;

        let progress =
            elapsed / anim.duration;

        if (progress <= 1.0) {

            dibujarElemento(
                anim,
                progress
            );

        } else {

            painter.activeAnimations.splice(
                i,
                1
            );
        }
    }

    pop();
}

// ========================================
// VISUALES
// ========================================

const visualMap = {

    "tr909bd": dibujarBombo,

    "tr909sd": dibujarCaja,

    "tr909hh": dibujarHiHat,

    "tr909oh": dibujarOpenHat,

    "explosion": dibujarExplosion
};

function dibujarElemento(anim, p) {

    push();

    let fn =
        visualMap[anim.type] ||
        dibujarDefault;

    fn(anim, p, anim.color);

    pop();
}

// ========================================
// DIBUJOS
// ========================================

function dibujarBombo(anim, p, c) {

    let d =
        lerp(100, 700, p);

    let alpha =
        lerp(255, 0, p);

    noStroke();

    // Glow
    for (let i = 0; i < 6; i++) {

        fill(
            c[0],
            c[1],
            c[2],
            alpha * 0.15
        );

        circle(
            width / 2,
            height / 2,
            d + i * 40
        );
    }

    // Core
    fill(
        c[0],
        c[1],
        c[2],
        alpha
    );

    circle(
        width / 2,
        height / 2,
        d
    );
}

function dibujarCaja(anim, p, c) {

    let w =
        lerp(width, 0, p);

    let alpha =
        lerp(255, 0, p);

    noFill();

    stroke(
        c[0],
        c[1],
        c[2],
        alpha
    );

    strokeWeight(4);

    rect(
        width / 2,
        height / 2,
        w,
        100
    );

    rect(
        width / 2,
        height / 2,
        w * 0.5,
        50
    );
}

function dibujarHiHat(anim, p, c) {

    let size =
        lerp(5, 80, p);

    let alpha =
        lerp(255, 0, p);

    noFill();

    stroke(
        c[0],
        c[1],
        c[2],
        alpha
    );

    strokeWeight(1);

    for (let i = 0; i < 5; i++) {

        circle(
            anim.x,
            anim.y,
            size + i * 10
        );
    }
}

function dibujarOpenHat(anim, p, c) {

    let len =
        lerp(200, 0, p);

    let alpha =
        lerp(255, 0, p);

    stroke(
        c[0],
        c[1],
        c[2],
        alpha
    );

    strokeWeight(2);

    push();

    translate(
        anim.x,
        anim.y
    );

    rotate(p * TWO_PI);

    for (
        let a = 0;
        a < TWO_PI;
        a += PI / 6
    ) {

        let x =
            cos(a) * len;

        let y =
            sin(a) * len;

        line(0, 0, x, y);
    }

    pop();
}

function dibujarDefault(anim, p, c) {

    let size =
        lerp(100, 0, p);

    let angle =
        p * TWO_PI;

    translate(anim.x, anim.y);

    rotate(angle);

    stroke(
        c[0],
        c[1],
        c[2]
    );

    strokeWeight(2);

    noFill();

    rect(
        0,
        0,
        size,
        size
    );

    line(
        -size,
        0,
        size,
        0
    );

    line(
        0,
        -size,
        0,
        size
    );
}

function dibujarExplosion(anim, p, c) {

    let size =
        lerp(10, 300, p);

    let alpha =
        lerp(255, 0, p);

    let rays = 12;

    noFill();

    stroke(
        c[0],
        c[1],
        c[2],
        alpha
    );

    strokeWeight(2);

    // Círculo
    circle(
        anim.x,
        anim.y,
        size
    );

    // Rayos
    for (let i = 0; i < rays; i++) {

        let angle =
            map(
                i,
                0,
                rays,
                0,
                TWO_PI
            );

        let x1 =
            anim.x +
            cos(angle) *
            size *
            0.2;

        let y1 =
            anim.y +
            sin(angle) *
            size *
            0.2;

        let x2 =
            anim.x +
            cos(angle) *
            size;

        let y2 =
            anim.y +
            sin(angle) *
            size;

        line(x1, y1, x2, y2);
    }
}

// ========================================
// COLORS
// ========================================

function getColorForSound(s) {

    const colors = {

        "tr909bd":
            painter.oscControls.rgb,

        "tr909sd":
            [0, 200, 255],

        "tr909hh":
            [255, 255, 0],

        "tr909oh":
            [255, 150, 0]
    };

    if (colors[s]) {

        return colors[s];
    }

    let charCode =
        s.charCodeAt(0) || 0;

    return [

        (charCode * 123) % 255,

        (charCode * 456) % 255,

        (charCode * 789) % 255
    ];
}

// ========================================
// RESIZE
// ========================================

function windowResized() {

    resizeCanvas(
        windowWidth,
        windowHeight
    );

    shaderLayer = createGraphics(
        windowWidth,
        windowHeight,
        WEBGL
    );

    glowShader =
        shaderLayer.createShader(
            vertexShader,
            fragShader
        );
}

// ========================================
// PARTICLES
// ========================================

class Particle {

    constructor() {

        this.pos = createVector(
            random(width),
            random(height)
        );

        this.prev =
            this.pos.copy();

        this.vel =
            createVector();

        this.speed =
            random(1, 4);

        this.alpha =
            random(20, 80);
    }

    update() {

        this.prev =
            this.pos.copy();

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

        let angle =

            noise(

                this.pos.x * noiseScale,

                this.pos.y * noiseScale,

                frameCount * 0.003
            )

            *

            TWO_PI * 6;

        angle += angleOffset;

        this.vel.x = cos(angle);

        this.vel.y = sin(angle);

        this.pos.add(
            this.vel
                .copy()
                .mult(this.speed)
        );

        // Wrap
        if (this.pos.x > width) {

            this.pos.x = 0;
            this.prev = this.pos.copy();
        }

        if (this.pos.x < 0) {

            this.pos.x = width;
            this.prev = this.pos.copy();
        }

        if (this.pos.y > height) {

            this.pos.y = 0;
            this.prev = this.pos.copy();
        }

        if (this.pos.y < 0) {

            this.pos.y = height;
            this.prev = this.pos.copy();
        }

        // Explosión
        if (painter.rxData.btnA) {

            this.pos.add(

                p5.Vector
                    .random2D()
                    .mult(10)
            );
        }
    }

    draw() {

        let c =
            painter.oscControls.rgb;

        stroke(

            c[0],
            c[1],
            c[2],
            this.alpha
        );

        strokeWeight(

            painter.oscControls
                .sizeMultiplier
        );

        line(

            this.prev.x,
            this.prev.y,

            this.pos.x,
            this.pos.y
        );
    }
}