// Sebastian Uriarte Ramos | 11 de noviembre de 2026
// Simulador de vuelo, sonido y cielo nocturno para Blue Launch.
'use strict';

const byId = (id) => document.getElementById(id);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const number = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

let audioContext;
let soundOn = false;
let soundChoice = false;

function setSound(enabled) {
  if (enabled) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    audioContext ||= new Context();
    audioContext.resume().catch(() => {});
  }
  soundOn = enabled;
  byId('audio').setAttribute('aria-pressed', String(enabled));
  byId('audio-label').textContent = enabled ? 'Silenciar sonido' : 'Activar sonido';
}

function tone(from, to, duration, volume, delay = 0, type = 'sine') {
  if (!soundOn || !audioContext) return;
  const start = audioContext.currentTime + delay;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + duration);
  gain.gain.setValueAtTime(.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + .02);
  gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
  osc.connect(gain).connect(audioContext.destination);
  osc.start(start);
  osc.stop(start + duration);
}

byId('audio').addEventListener('click', () => {
  soundChoice = true;
  setSound(!soundOn);
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('#lanzar')) {
    tone(320, 760, .21, .045);
    tone(910, 460, .18, .027, .07);
  }
});

document.querySelectorAll('.fact button').forEach((button) => {
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!open));
  });
});

const sliders = {
  masa: (value) => value + ' g',
  empuje: (value) => number.format(value) + ' N',
  motor: (value) => number.format(value) + ' s',
  angulo: (value) => value + '°',
};
const form = byId('controles');
const parameters = [...form.querySelectorAll('input')];
for (const [id, format] of Object.entries(sliders)) {
  const field = byId(id);
  const output = byId(id + '-val');
  const update = () => { output.value = format(Number(field.value)); };
  field.addEventListener('input', update);
  update();
}

const phases = ['En plataforma', 'Ascenso con motor', 'Ascenso por inercia', 'Descenso con paracaídas', 'Descenso sin paracaídas', 'En tierra'];
const startPoint = { t: 0, x: 0, y: 0, vx: 0, vy: 0, phase: 0 };

function calculateFlight() {
  const mass = Number(byId('masa').value) / 1000;
  const thrust = Number(byId('empuje').value);
  const burn = Number(byId('motor').value);
  const angle = Number(byId('angulo').value) * Math.PI / 180;
  const parachute = byId('paracaidas').checked;
  const dt = .005;
  const burnSteps = Math.round(burn / dt);
  const gravity = 9.81;
  const bodyDrag = .0007;
  const canopyDrag = .065;
  let { x, y, vx, vy } = startPoint;
  let peak = startPoint;
  let pastPeak = false;
  const points = [startPoint];

  for (let i = 1; i <= 24000; i += 1) {
    const time = i * dt;
    const powered = i <= burnSteps;
    const priorVx = vx;
    const priorVy = vy;
    const speed = Math.hypot(vx, vy);
    const drag = pastPeak && parachute ? canopyDrag : bodyDrag;
    const power = powered ? thrust : 0;
    vx += (power * Math.sin(angle) - drag * speed * vx) / mass * dt;
    vy += ((power * Math.cos(angle) - drag * speed * vy) / mass - gravity) * dt;
    const nextX = x + vx * dt;
    const nextY = y + vy * dt;
    if (nextY <= 0) {
      const fraction = y / (y - nextY);
      points.push({
        t: time - dt * (1 - fraction),
        x: x + (nextX - x) * fraction,
        y: 0,
        vx: priorVx + (vx - priorVx) * fraction,
        vy: priorVy + (vy - priorVy) * fraction,
        phase: 5,
      });
      break;
    }
    x = nextX;
    y = nextY;
    pastPeak ||= vy <= 0;
    const phase = powered ? 1 : !pastPeak ? 2 : parachute ? 3 : 4;
    const point = { t: time, x, y, vx, vy, phase };
    if (point.y > peak.y) peak = point;
    points.push(point);
  }
  return { points, peak, end: points.at(-1) };
}

const plot = byId('trayectoria');
const ctx = plot.getContext('2d');
const countdown = byId('cuenta');
const launch = byId('lanzar');
let flight;
let frame;
let timer;
let currentIndex = 0;
let currentPhase = '';
const palette = ['#6884ae', '#f8bc65', '#8dbbff', '#96e3d7', '#f2a28d', '#c7d8f1'];

function sizeCanvas(canvas, context) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return [0, 0];
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return [width, height];
}

function scaleLimit(value) {
  const unit = Math.pow(10, Math.floor(Math.log10(Math.max(4, value) / 4)));
  return 4 * Math.ceil(Math.max(4, value) / (4 * unit)) * unit;
}

function drawRocket(context, x, y, angle, firing) {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  if (firing) {
    context.fillStyle = '#f6bb61';
    context.beginPath();
    context.moveTo(-2.5, 5); context.lineTo(0, 15); context.lineTo(2.5, 5); context.fill();
  }
  context.fillStyle = '#e7effb';
  context.beginPath();
  context.moveTo(0, -12); context.quadraticCurveTo(5, -6, 4, 3);
  context.lineTo(7, 7); context.lineTo(0, 5); context.lineTo(-7, 7);
  context.lineTo(-4, 3); context.quadraticCurveTo(-5, -6, 0, -12); context.fill();
  context.fillStyle = '#263e64';
  context.fillRect(-3.5, -.5, 7, 2.5);
  context.restore();
}

function drawPlot() {
  if (!ctx) return;
  const [w, h] = sizeCanvas(plot, ctx);
  if (!w || !h) return;
  ctx.clearRect(0, 0, w, h);
  const left = 45, top = 33, right = w - 23, bottom = h - 48;
  const maxHeight = scaleLimit(flight ? flight.peak.y * 1.08 : 40);
  const maxX = scaleLimit(flight ? flight.end.x * 1.08 : 20);
  const px = (x) => left + x / maxX * (right - left);
  const py = (y) => bottom - y / maxHeight * (bottom - top);

  ctx.font = '11px ui-monospace, monospace';
  for (let i = 0; i <= 4; i += 1) {
    const y = py(maxHeight * i / 4);
    const x = px(maxX * i / 4);
    ctx.strokeStyle = i ? '#223450' : '#587198';
    ctx.beginPath();
    ctx.moveTo(left, y); ctx.lineTo(right, y);
    ctx.moveTo(x, top); ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.fillStyle = '#9fb1cf';
    ctx.textAlign = 'right';
    ctx.fillText(String(maxHeight * i / 4), left - 8, y + 4);
    ctx.textAlign = 'center';
    ctx.fillText(String(maxX * i / 4), x, bottom + 16);
  }
  ctx.textAlign = 'left';
  ctx.fillText('Altura (m)', left, 17);
  ctx.textAlign = 'center';
  ctx.fillText('Distancia horizontal (m)', (left + right) / 2, bottom + 35);

  const point = flight?.points[currentIndex] || startPoint;
  if (flight && currentIndex > 0) {
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    let lastPhase = -1;
    flight.points.slice(1, currentIndex + 1).forEach((sample, index) => {
      if (sample.phase !== lastPhase) {
        if (lastPhase !== -1) ctx.stroke();
        ctx.beginPath();
        const prior = flight.points[index];
        ctx.moveTo(px(prior.x), py(prior.y));
        ctx.strokeStyle = palette[sample.phase];
        lastPhase = sample.phase;
      }
      ctx.lineTo(px(sample.x), py(sample.y));
    });
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  const x = px(point.x);
  const y = py(point.y);
  if (point.phase === 3) {
    ctx.strokeStyle = '#96e3d7';
    ctx.beginPath();
    ctx.arc(x, y - 12, 9, Math.PI, 0);
    ctx.lineTo(x, y - 2); ctx.lineTo(x - 9, y - 12);
    ctx.stroke();
    ctx.fillStyle = '#e7effb';
    ctx.fillRect(x - 2, y - 2, 4, 7);
  } else {
    const angle = point.phase === 4 ? Math.PI - Math.atan2(point.vx, -point.vy) : Math.atan2(point.vx, Math.max(.001, point.vy));
    drawRocket(ctx, x, y - (point.y === 0 ? 8 : 0), angle, point.phase === 1);
  }
}

function report(point, status = phases[point.phase]) {
  if (status !== currentPhase) {
    byId('fase').textContent = status;
    currentPhase = status;
  }
  byId('altura').textContent = number.format(point.y) + ' m';
  byId('velocidad').textContent = number.format(Math.hypot(point.vx, point.vy)) + ' m/s';
  byId('apogeo').textContent = flight && point.t >= flight.peak.t ? number.format(flight.peak.y) + ' m' : '—';
  byId('tiempo').textContent = number.format(point.t) + ' s';
}

function lockControls(locked) {
  for (const input of parameters) input.disabled = locked;
  launch.disabled = locked;
}

function reset() {
  cancelAnimationFrame(frame);
  clearTimeout(timer);
  flight = undefined;
  currentIndex = 0;
  countdown.hidden = true;
  lockControls(false);
  report(startPoint);
  drawPlot();
}
byId('reiniciar').addEventListener('click', reset);
form.addEventListener('input', () => {
  const parachute = byId('paracaidas').checked;
  const legend = byId('descenso-leyenda');
  legend.textContent = parachute ? 'Con paracaídas' : 'Sin paracaídas';
  legend.classList.toggle('freefall', !parachute);
  if (flight && !launch.disabled) reset();
});

function playFlight() {
  countdown.hidden = true;
  const start = performance.now();
  const replaySpeed = Math.max(1, flight.end.t / 13);
  function animate(now) {
    const elapsed = reduced.matches ? flight.end.t : (now - start) * replaySpeed / 1000;
    while (currentIndex < flight.points.length - 1 && flight.points[currentIndex + 1].t <= elapsed) currentIndex += 1;
    report(flight.points[currentIndex]);
    drawPlot();
    if (currentIndex < flight.points.length - 1) {
      frame = requestAnimationFrame(animate);
    } else {
      lockControls(false);
    }
  }
  frame = requestAnimationFrame(animate);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (launch.disabled) return;
  if (!soundChoice && !soundOn) setSound(true);
  reset();
  flight = calculateFlight();
  lockControls(true);
  drawPlot();
  function step(remaining) {
    countdown.hidden = false;
    if (remaining > 0) {
      countdown.textContent = remaining;
      report(startPoint, 'Despegue en ' + remaining);
      tone(470 + (3 - remaining) * 100, 600 + (3 - remaining) * 100, .26, .105, 0, 'triangle');
      timer = setTimeout(() => step(remaining - 1), 1000);
      return;
    }
    countdown.textContent = '¡Despegue!';
    report(startPoint, '¡Despegue!');
    tone(240, 68, .55, .12, 0, 'triangle');
    tone(580, 1100, .45, .07, .03);
    timer = setTimeout(playFlight, 430);
  }
  step(3);
});
new ResizeObserver(drawPlot).observe(plot);
reset();

const sky = byId('cielo');
const skyCtx = sky.getContext('2d');
const stars = Array.from({ length: 56 }, () => ({
  x: Math.random(), y: Math.random(), size: .55 + Math.random() * .85, pulse: Math.random() * 6,
}));
let sparks = [];
let lastSpark = 0;
let skyFrame;
let skyStart = 0;

document.addEventListener('pointermove', (event) => {
  const now = performance.now();
  if (reduced.matches || event.pointerType === 'touch' || now - lastSpark < 27) return;
  lastSpark = now;
  sparks.push({ x: event.clientX, y: event.clientY, time: now, dx: (Math.random() - .5) * 24 });
});

function renderSky(now) {
  if (!skyCtx || reduced.matches) return;
  const [width, height] = sizeCanvas(sky, skyCtx);
  skyCtx.clearRect(0, 0, width, height);
  const time = (now - skyStart) / 1000;
  for (const star of stars) {
    skyCtx.fillStyle = 'rgba(176,207,255,' + (.15 + .2 * (.5 + .5 * Math.sin(time * 1.3 + star.pulse))) + ')';
    skyCtx.fillRect(star.x * width, star.y * height, star.size, star.size);
  }

  const meteor = (time + 4.8) % 9;
  if (meteor < 1.35) {
    const x = width * .77 - meteor * 240;
    const y = height * .13 + meteor * 130;
    const trail = skyCtx.createLinearGradient(x, y, x + 100, y - 55);
    trail.addColorStop(0, '#e1ecffdf');
    trail.addColorStop(1, '#80aaf800');
    skyCtx.strokeStyle = trail;
    skyCtx.globalAlpha = Math.sin(meteor / 1.35 * Math.PI);
    skyCtx.beginPath();
    skyCtx.moveTo(x, y); skyCtx.lineTo(x + 100, y - 55); skyCtx.stroke();
  }

  const crossing = (time + 7.5) % 15;
  if (crossing < 3.4) {
    const cycle = Math.floor((time + 7.5) / 15);
    const side = cycle % 2 ? .87 : .56;
    skyCtx.globalAlpha = .66 * Math.sin(crossing / 3.4 * Math.PI);
    drawRocket(skyCtx, width * side + crossing * 45, height * .83 - crossing * height * .25, .38, true);
  }
  skyCtx.globalAlpha = 1;
  sparks = sparks.filter((spark) => now - spark.time < 350);
  for (const spark of sparks) {
    const age = (now - spark.time) / 350;
    skyCtx.fillStyle = 'rgba(246,187,97,' + (1 - age) * .64 + ')';
    skyCtx.beginPath();
    skyCtx.arc(spark.x + spark.dx * age, spark.y + 13 * age, Math.max(.2, 1.65 - age), 0, Math.PI * 2);
    skyCtx.fill();
  }
  skyFrame = requestAnimationFrame(renderSky);
}

function updateSky() {
  cancelAnimationFrame(skyFrame);
  sparks = [];
  if (!reduced.matches && !document.hidden) {
    skyStart = performance.now();
    skyFrame = requestAnimationFrame(renderSky);
  }
}
reduced.addEventListener('change', updateSky);
document.addEventListener('visibilitychange', updateSky);
updateSky();

const parts = {
  ojiva: {
    name: 'Ojiva',
    category: 'AERODINÁMICA',
    description: 'Es la punta del cohete. Su perfil curvo ayuda a reducir la resistencia del aire durante el ascenso.',
  },
  sensor: {
    name: 'Sensor',
    category: 'MEDICIÓN',
    description: 'Viaja dentro del fuselaje. Un altímetro barométrico, por ejemplo, usa los cambios de presión para estimar la altura y localizar el apogeo.',
  },
  paracaidas: {
    name: 'Paracaídas',
    category: 'RECUPERACIÓN',
    description: 'Viaja plegado dentro del cuerpo. Al abrirse aumenta la resistencia del aire y frena el descenso antes del aterrizaje.',
  },
  fuselaje: {
    name: 'Fuselaje',
    category: 'ESTRUCTURA',
    description: 'Es el cuerpo del cohete. Une la punta con la base y aloja las piezas internas, como el sensor y el paracaídas.',
  },
  motor: {
    name: 'Motor',
    category: 'PROPULSIÓN',
    description: 'Se ubica en la base. Expulsa gases hacia abajo para impulsar el cohete durante los primeros instantes del vuelo.',
  },
  alerones: {
    name: 'Alerones',
    category: 'ESTABILIDAD',
    description: 'Se colocan cerca de la base. El aire que pasa alrededor de ellos ayuda a corregir pequeñas inclinaciones durante el ascenso.',
  },
};
const anatomy = byId('despiece');
const partButtons = [...anatomy.querySelectorAll('[data-part]')];
for (const button of partButtons) {
  button.addEventListener('click', () => {
    const selected = button.dataset.part;
    const part = parts[selected];
    for (const control of partButtons) {
      control.setAttribute('aria-pressed', String(control.dataset.part === selected));
    }
    byId('part-category').textContent = part.category;
    byId('part-name').textContent = part.name;
    byId('part-description').textContent = part.description;
  });
}

const viewButton = byId('anatomy-toggle');
viewButton.addEventListener('click', () => {
  const assembled = anatomy.dataset.assembled !== 'true';
  anatomy.dataset.assembled = String(assembled);
  viewButton.textContent = assembled ? 'Ver despiece' : 'Ver ensamblado';
  byId('anatomy-view').textContent = assembled ? 'VISTA ENSAMBLADA' : 'VISTA DESPIEZADA';
});

const windCanvas = byId('wind-canvas');
const windContext = windCanvas.getContext('2d');
const windSpeed = byId('wind-speed');
const windAngle = byId('wind-angle');
const airDensity = 1.225;
let windOffset = 0;
let lastWindFrame;
let windFrame;
let windVisible = false;

function renderWind() {
  if (!windContext) return;
  const [width, height] = sizeCanvas(windCanvas, windContext);
  if (!width || !height) return;
  const ctx = windContext;
  ctx.clearRect(0, 0, width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  const scale = Math.min(width / 420, height / 240, 1.35);
  const angle = Number(windAngle.value) * Math.PI / 180;

  ctx.strokeStyle = '#22344e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = width % 28 / 2; x < width; x += 28) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = height % 28 / 2; y < height; y += 28) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  for (let line = 0; line < 12; line += 1) {
    const offset = (line - 5.5) * 15;
    const streamY = (x) => {
      const localX = (x - centerX) / scale;
      const influence = Math.exp(-Math.pow((localX - 15) / 95, 4));
      const gap = Math.sign(offset) * 25 * Math.exp(-Math.abs(offset) / 37);
      return centerY + scale * (offset + influence * (gap + Math.tan(angle) * localX));
    };
    ctx.beginPath();
    ctx.moveTo(0, streamY(0));
    for (let x = 4; x <= width + 4; x += 4) ctx.lineTo(x, streamY(x));
    ctx.strokeStyle = '#719dc980';
    ctx.stroke();
    ctx.fillStyle = '#a1e3f5';
    for (let x = (windOffset + line * 23) % 108; x < width; x += 108) {
      ctx.beginPath();
      ctx.arc(x, streamY(x), 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  const shell = ctx.createLinearGradient(0, -13, 0, 13);
  shell.addColorStop(0, '#e9f2ff');
  shell.addColorStop(1, '#7291bb');
  ctx.fillStyle = shell;
  ctx.strokeStyle = '#c9ddf7';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-99, 0);
  ctx.quadraticCurveTo(-74, -11, -54, -11);
  ctx.lineTo(48, -11);
  ctx.lineTo(72, -24);
  ctx.lineTo(89, -24);
  ctx.lineTo(78, -10);
  ctx.lineTo(88, -7);
  ctx.lineTo(88, 7);
  ctx.lineTo(78, 10);
  ctx.lineTo(89, 24);
  ctx.lineTo(72, 24);
  ctx.lineTo(48, 11);
  ctx.lineTo(-54, 11);
  ctx.quadraticCurveTo(-74, 11, -99, 0);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#182e53';
  ctx.fillRect(-48, -11, 12, 22);
  ctx.fillStyle = '#eeb962';
  ctx.fillRect(-36, -11, 5, 22);
  ctx.restore();
}

function animateWind(now) {
  if (lastWindFrame !== undefined) {
    windOffset = (windOffset + Number(windSpeed.value) * Math.min(now - lastWindFrame, 50) * .0026) % 108;
  }
  lastWindFrame = now;
  renderWind();
  windFrame = requestAnimationFrame(animateWind);
}

function updateWindMotion() {
  cancelAnimationFrame(windFrame);
  lastWindFrame = undefined;
  if (windVisible && !reduced.matches && !document.hidden) windFrame = requestAnimationFrame(animateWind);
}

function updateWindControls() {
  const speed = Number(windSpeed.value);
  byId('wind-speed-value').value = speed + ' m/s';
  byId('wind-angle-value').value = windAngle.value + '°';
  byId('wind-pressure').value = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(.5 * airDensity * speed ** 2) + ' Pa';
  renderWind();
}

windSpeed.addEventListener('input', updateWindControls);
windAngle.addEventListener('input', updateWindControls);
new ResizeObserver(renderWind).observe(windCanvas);
new IntersectionObserver(([entry]) => {
  windVisible = entry.isIntersecting;
  updateWindMotion();
}).observe(windCanvas);
reduced.addEventListener('change', updateWindMotion);
document.addEventListener('visibilitychange', updateWindMotion);
updateWindControls();

byId('quick-launch').addEventListener('click', () => {
  byId('simulador').scrollIntoView({ block: 'start' });
  byId('reiniciar').focus({ preventScroll: true });
  if (!launch.disabled) form.requestSubmit(launch);
});
