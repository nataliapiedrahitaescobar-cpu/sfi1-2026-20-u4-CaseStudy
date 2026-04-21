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
bridge.onData((data) => {
  console.log("LLEGA:", data);

  //  MICROBIT
  if (data.type === "microbit") {
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
      type: "STRUDEL",
      timestamp: data.timestamp,
      payload: data.payload
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
 //Activar eventos en el tiempo correcto
    painter.processEvents();

    let mb = painter.rxData;
    if (!mb || !mb.ready) return;

    let now = Date.now();

    //Dibujo de Strudel
    for (let i = painter.activeAnimations.length -1;  i >= 0; i--) {
 
        let anim = painter.activeAnimations[i];
        let progress = (now - anim.startTime) / anim.duration; //Progeso de la animación.
        
    //Eliminar animaciones que han terminado
        if (progress > 1) {
            
            painter.activeAnimations.splice(i, 1); //Eliminar la animación de la lista de animaciones activas.
            continue; // Saltar a la siguiente animación.
        }
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
       

            



