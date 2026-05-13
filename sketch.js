// ============================================
// EVENTOS
// ============================================

const EVENTS = {
    CONNECT: "CONNECT",
    DISCONNECT: "DISCONNECT",
    DATA: "DATA",
    KEY_PRESSED: "KEY_PRESSED",
    KEY_RELEASED: "KEY_RELEASED",
};

// ============================================
// PAINTER TASK
// ============================================

class PainterTask extends FSMTask {

    constructor() {

        super();

        this.c = color(181, 157, 0);

        this.lineSize = 100;

        this.cameraShake = 0;

        this.rxData = {

            x: 0,
            y: 0,

            btnA: false,
            btnB: false,

            prevA: false,
            prevB: false,

            ready: false,
        };

        // STRUDEL

        this.eventQueue = [];

        this.activeAnimations = [];

        this.LATENCY_CORRECTION = 0;

        // OSC

        this.oscControls = {

            rgb: [255, 0, 80],

            sizeMultiplier: 1,

            rainbowMode: false
        };

        this.transitionTo(
            this.estado_esperando
        );
    }

    // ============================================
    // ESTADO ESPERANDO
    // ============================================

    estado_esperando = (ev) => {

        if (ev.type === "ENTRY") {

            cursor();

            console.log(
                "Waiting for connection..."
            );
        }

        else if (
            ev.type === EVENTS.CONNECT
        ) {

            this.transitionTo(
                this.estado_corriendo
            );
        }
    };

    // ============================================
    // ESTADO CORRIENDO
    // ============================================

    estado_corriendo = (ev) => {

        if (ev.type === "ENTRY") {

            noCursor();

            background(0);

            console.log(
                "Sistema listo"
            );
        }

        else if (
            ev.type === EVENTS.DISCONNECT
        ) {

            this.transitionTo(
                this.estado_esperando
            );
        }

        else if (
            ev.type === EVENTS.DATA
        ) {

            this.updateLogic(
                ev.payload
            );
        }

        else if (
            ev.type === "EXIT"
        ) {

            cursor();
        }
    };

    // ============================================
    // MICROBIT
    // ============================================

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

            this.lineSize =
                random(50, 160);

            this.c = color(
                random(255),
                random(255),
                random(80, 100)
            );
        }

        this.rxData.prevA =
            this.rxData.btnA;

        this.rxData.prevB =
            this.rxData.btnB;
    }

    // ============================================
    // STRUDEL
    // ============================================

    handleStrudel(data) {

        if (!data.payload) return;

        let params = data.payload;

        if (!this.synced) {

            this.timeOffset =
                Date.now() - data.timestamp;

            this.synced = true;

            console.log("SYNC OK");
        }

        this.eventQueue.push({

            timestamp:
                data.timestamp +
                this.timeOffset,

            sound: params.s,

            delta:
                params.delta || 0.25
        });

        this.eventQueue.sort(
            (a, b) =>
                a.timestamp - b.timestamp
        );
    }

    // ============================================
    // OSC
    // ============================================

    handleOSC(data) {

        if (!data.payload) return;

        const address =
            data.payload.address;

        const args =
            data.payload.args || [];

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

    // ============================================
    // PROCESS STRUDEL
    // ============================================

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

            let ev =
                this.eventQueue.shift();

            if (!ev.sound) continue;

            this.activeAnimations.push({

                startTime: now,

                duration:
                    ev.delta * 1200,

                type: ev.sound,

                x: random(
                    width * 0.2,
                    width * 0.8
                ),

                y: random(
                    height * 0.2,
                    height * 0.8
                ),

                color:
                    getColorForSound(
                        ev.sound
                    )
            });

            // KICK SHAKE

            if (
                ev.sound === "tr909bd"
            ) {

                this.cameraShake = 15;
            }

            // EXPLOSION MODE

            if (

                ev.sound === "tr909bd" &&
                this.rxData.btnA &&
                this.oscControls.rainbowMode

            ) {

                for (
                    let i = 0;
                    i < 30;
                    i++
                ) {

                    this.activeAnimations.push({

                        startTime: now,

                        duration:
                            random(300, 900),

                        type: "explosion",

                        x: random(width),

                        y: random(height),

                        color: [

                            random(255),

                            random(255),

                            random(255)
                        ]
                    });
                }
            }
        }
    }
}

// ============================================
// VARIABLES
// ============================================

let painter;

let bridge;

let connectBtn;

const renderer = new Map();

let particles = [];

// ============================================
// SETUP
// ============================================

function setup() {

    createCanvas(
        windowWidth,
        windowHeight
    );

    rectMode(CENTER);

    background(0);

    // PARTICLES

    for (
        let i = 0;
        i < 800;
        i++
    ) {

        particles.push(
            new Particle()
        );
    }

    painter = new PainterTask();

    // ============================================
    // BRIDGE
    // ============================================

    bridge = new BridgeClient(
        "ws://127.0.0.1:8081"
    );

    connectBtn =
        createButton("Conectar");

    connectBtn.position(10, 10);

    // CONNECT

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

    // DISCONNECT

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

    // DATA

    bridge.onData((data) => {

        // STRUDEL

        if (
            data.type === "strudel"
        ) {

            painter.handleStrudel(
                data
            );
        }

        // OSC

        else if (
            data.type === "osc"
        ) {

            painter.handleOSC(data);
        }

        // MICROBIT

        else if (
            data.type === "microbit"
        ) {

            painter.postEvent({

                type: EVENTS.DATA,

                payload: data
            });
        }
    });

    // BOTÓN

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

// ============================================
// DRAW
// ============================================

function draw() {

    painter.update();

    renderer.get(
        painter.state
    )?.();
}

// ============================================
// DRAW RUNNING
// ============================================

function drawRunning() {

    push();

    // CAMERA SHAKE

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

    // BACKGROUND FADE

    background(0, 25);

    // ============================================
    // PROCESS STRUDEL
    // ============================================

    painter.processStrudel();

    // ============================================
    // OSC RAINBOW MODE
    // ============================================

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
            0.04
        );

        colorMode(RGB);
    }

    // ============================================
    // PARTICLES
    // ============================================

    for (let p of particles) {

        p.update();

        p.draw();
    }

    // ============================================
    // ANIMATIONS
    // ============================================

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

// ============================================
// VISUAL MAP
// ============================================

const visualMap = {

    "tr909bd": dibujarBombo,

    "tr909sd": dibujarCaja,

    "tr909hh": dibujarHiHat,

    "tr909oh": dibujarOpenHat,

    "explosion": dibujarExplosion
};

// ============================================
// DRAW ELEMENT
// ============================================

function dibujarElemento(anim, p) {

    push();

    let fn =
        visualMap[anim.type] ||
        dibujarDefault;

    fn(anim, p, anim.color);

    pop();
}

// ============================================
// BOMBO
// ============================================

function dibujarBombo(anim, p, c) {

    let d =
        lerp(100, 700, p);

    let alpha =
        lerp(255, 0, p);

    noStroke();

    // GLOW

    for (
        let i = 0;
        i < 6;
        i++
    ) {

        fill(
            c[0],
            c[1],
            c[2],
            alpha * 0.1
        );

        circle(

            width / 2,

            height / 2,

            d + i * 40
        );
    }

    // CORE

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

// ============================================
// SNARE
// ============================================

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

// ============================================
// HIHAT
// ============================================

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

    for (
        let i = 0;
        i < 5;
        i++
    ) {

        circle(
            anim.x,
            anim.y,
            size + i * 10
        );
    }
}

// ============================================
// OPEN HAT
// ============================================

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

        line(
            0,
            0,
            x,
            y
        );
    }

    pop();
}

// ============================================
// DEFAULT
// ============================================

function dibujarDefault(anim, p, c) {

    let size =
        lerp(100, 0, p);

    let angle =
        p * TWO_PI;

    translate(
        anim.x,
        anim.y
    );

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
}

// ============================================
// EXPLOSION
// ============================================

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

    circle(
        anim.x,
        anim.y,
        size
    );

    for (
        let i = 0;
        i < rays;
        i++
    ) {

        let angle = map(
            i,
            0,
            rays,
            0,
            TWO_PI
        );

        let x1 =
            anim.x +
            cos(angle) *
            size * 0.2;

        let y1 =
            anim.y +
            sin(angle) *
            size * 0.2;

        let x2 =
            anim.x +
            cos(angle) *
            size;

        let y2 =
            anim.y +
            sin(angle) *
            size;

        line(
            x1,
            y1,
            x2,
            y2
        );
    }
}

// ============================================
// COLORS
// ============================================

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

// ============================================
// RESIZE
// ============================================

function windowResized() {

    resizeCanvas(
        windowWidth,
        windowHeight
    );
}

// ============================================
// PARTICLES
// ============================================

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

        let angle = noise(

            this.pos.x * noiseScale,

            this.pos.y * noiseScale,

            frameCount * 0.003

        ) * TWO_PI * 6;

        angle += angleOffset;

        this.vel.x = cos(angle);

        this.vel.y = sin(angle);

        this.pos.add(

            this.vel
                .copy()
                .mult(this.speed)
        );

        // WRAP

        if (this.pos.x > width) {

            this.pos.x = 0;

            this.prev =
                this.pos.copy();
        }

        if (this.pos.x < 0) {

            this.pos.x = width;

            this.prev =
                this.pos.copy();
        }

        if (this.pos.y > height) {

            this.pos.y = 0;

            this.prev =
                this.pos.copy();
        }

        if (this.pos.y < 0) {

            this.pos.y = height;

            this.prev =
                this.pos.copy();
        }

        // BOTÓN A

        if (
            painter.rxData.btnA
        ) {

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