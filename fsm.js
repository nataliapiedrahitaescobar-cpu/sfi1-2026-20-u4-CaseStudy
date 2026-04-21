const ENTRY = Object.freeze({ type: "ENTRY" });
const EXIT = Object.freeze({ type: "EXIT" });

const EVENTS = {
  CONNECT: "CONNECT",
  DISCONNECT: "DISCONNECT",
  DATA: "DATA", //microbit data
  STRUDEL: "STRUDEL", //strudel data


}
class Timer {
  constructor(owner, eventToPost, duration) {
    this.owner = owner;
    this.event = eventToPost;
    this.duration = duration;
    this.startTime = 0;
    this.active = false;
  }

  start(newDuration = null) {
    if (newDuration !== null) this.duration = newDuration;
    this.startTime = millis();
    this.active = true;
  }

  stop() {
    this.active = false;
  }

  update() {
    if (this.active && millis() - this.startTime >= this.duration) {
      this.active = false;
      this.owner.postEvent(this.event);
    }
  }
}

class FSMTask { //No se modifica esta clase porque es la base para crear las máquinas de estados.
  constructor() {
    this.queue = [];
    this.timers = [];
    this.state = null;
  }

  postEvent(ev) {
    this.queue.push(ev);
  }

  addTimer(event, duration) {
    let t = new Timer(this, event, duration);
    this.timers.push(t);
    return t;
  }

  transitionTo(newState) {
    if (this.state) this.state(EXIT);
    this.state = newState;
    this.state(ENTRY);
  }

  update() {
    for (let t of this.timers) {
      t.update();
    }
    while (this.queue.length > 0) {
      let ev = this.queue.shift();
      if (this.state) this.state(ev);
    }
  }
}

class PainterTask extends FSMTask {
  constructor() {
    super();

    this.eventQueue = []; //Cola de eventos musicales.

    this.activeAnimations = []; //Animaciones activas, cada una con su propio estado interno.

    this.transitionTo(this.estado_esperando); 
  }

  //Estado esperando.
  estado_esperando = (ev) => {
    if (ev.type === "ENTRY") {
      console.log("Esperando conexión...");
    }

    else if (ev.type === EVENTS.CONNECT) {
      this.transitionTo(this.estado_corriendo); 
    }
  };

  //Estado corriendo.
  estado_corriendo = (ev) => {
    if (ev.type === ENTRY) {
      console.log("Sistema listo");

      this.eventQueue = [];
      this.activeAnimations = [];
    }

    else if(ev.type === EVENTS.DISCONNECT) {
      this.transitionTo(this.estado_esperando);
    }

    //Eventos de Strudel
    else if (ev.type === EVENTS.STRUDEL) {
      this.updateLogic(ev);
    }
  };

  //Guardar eventos de Strudel sin dibujar
updateLogic(ev) {

if (!ev.payload || !ev.payload.args) return; // Si el evento no tiene la estructura esperada, ignorarlo.

  let args = ev.payload.args;

  let sound = null;
  let delta = 0.25;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "s") {
      sound = args[i + 1];
    }
    if (args[i] === "delta") {
      delta = args[i + 1];
    }
  }

  if (!sound) return; // si no hay sonido, no hacer nada

  this.eventQueue.push({
    timestamp: Date.now(),
    s: sound,
    delta: delta
  });

  //Ordenar por tiempo
  this.eventQueue.sort((a, b) => a.timestamp - b.timestamp);
}

  //Ejecutar eventos en su tiempo
  processEvents() {
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
