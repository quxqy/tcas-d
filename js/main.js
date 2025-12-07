const planes = [];

const audioController = {
  sounds: {},

  init() {
    [
      'traffic',
      'climb',
      'descend',
      'clear',
      'testok',
      'maintain',
      'increase_climb',
      'increase_descent'
    ].forEach(id => {
      this.sounds[id] = document.getElementById(`tcas-${id}`);
    });
  },

  play(id) {
    const s = this.sounds[id];
    if (s) {
      s.currentTime = 0;
      s.play().catch(e => console.log("Audio play failed", e));
    }
  }
};

function initPlanes() {
  planes.length = 0;

  const skyContainer = document.getElementById('sky-container');
  skyContainer.innerHTML = '';

  // OWN PLANE (наш) — старт слева, летим вправо
  const ownPlane = new Plane(1, 'own', {
    x: 0,
    y: 0,
    alt: 10000,
    speed: 15
  });
  planes.push(ownPlane);

  // ВСТРЕЧНЫЕ НА ЛИНИИ (y = 0)

  // CONTROLLED ENEMY — основной нарушитель
  const controlPlane = new Plane(2, 'enemy', {
    x: 14000,
    y: 0,
    alt: 11500,
    speed: -14, // навстречу
    isControlled: true,
    vectorY: 0
  });
  planes.push(controlPlane);

  // BOT C — ближе, может давать TA/RA
  planes.push(new Plane(5, 'bot', {
    x: 9000,
    y: 0,
    alt: 10800,
    speed: -18, // навстречу
    scale: 1.0,
    vectorY: 0
  }));

  // BOT D — дальше по курсу
  planes.push(new Plane(6, 'bot', {
    x: 22000,
    y: 0,
    alt: 11200,
    speed: -12, // навстречу
    scale: 1.0,
    vectorY: 0
  }));

  // БОКОВЫЕ: с нами в одну сторону, но TCAS на них не реагирует

  // ЛЕВЫЙ — самый маленький, выше, слева на радаре
  planes.push(new Plane(3, 'bot', {
    x: 18000,
    y: 4000,        // левее на радаре
    alt: 14500,     // заметно выше
    speed: 13,      // с нами, но чуть медленнее
    scale: 0.5,     // маленький
    vectorY: 0
  }));

  // ПРАВЫЙ — самый большой, ниже, справа на радаре
  // Чуть подкорректирован ALT, чтобы попадал в TA/PROX-зону и давал команды
  planes.push(new Plane(4, 'bot', {
    x: 6000,
    y: -4000,       // правее на радаре
    alt: 8300,      // ближе к нам по высоте, чтобы давать хотя бы TA
    speed: 17,      // с нами, но чуть быстрее
    scale: 1.4,     // большой
    vectorY: 0
  }));

  planes.forEach(p => {
    const img = document.createElement('img');
    img.src = p.currentImgSrc;
    img.className = 'sky-plane';
    img.style.height = '60px';
    skyContainer.appendChild(img);
    p.domElement = img;
  });
}

function resetSimulation() {
  initPlanes();
  if (Radar.threatState) {
    Radar.threatState.hasTraffic = false;
    Radar.threatState.hasRA = false;
    Radar.threatState.advisory = null;
    Radar.threatState.raPhase = 'none';
    Radar.threatState.raStartTime = 0;
    Radar.threatState.lastVsOkTime = null;
    Radar.threatState.lastIncreaseTime = 0;
    Radar.threatState.increaseCount = 0;
    Radar.threatState.raTargetId = null;
  }
}

// Подключаем шрифт для XPDR по JS
function injectXpdrFont() {
  const style = document.createElement('style');
  style.textContent = `
@font-face {
  font-family: 'Digit Tech 7';
  src: url('fonts/DigitTech7-Regular.otf') format('opentype');
}
#xpdr-display {
  font-family: 'Digit Tech 7', monospace;
}
`;
  document.head.appendChild(style);
}

function animate() {
  const ownPlane = planes.find(p => p.type === 'own');
  const enemies = planes.filter(p => p.type !== 'own');

  let currentRange = 20;
  if (Radar && typeof Radar.getCurrentRange === 'function') {
    currentRange = Radar.getCurrentRange();
  }

  const baseRange = 10;
  const zoomFactor = baseRange / currentRange;

  // Горизонтальное окно камеры зависит от range
  const baseViewWorldWidth = 15000; // при 10 nm
  const viewWorldWidth = baseViewWorldWidth * (currentRange / baseRange); // 10->15000, 20->30000, 40->60000

  const worldWidth = CONFIG.WORLD_WIDTH;
  const minY = 50;

  // Чуть уменьшили долю экрана по высоте для ноутбука 1366x768
  const maxY = window.innerHeight * 0.55;

  const screenWidth = window.innerWidth;
  let cameraX = 0;

  if (ownPlane) {
    const desiredOwnScreenRatio = 0.2; // держим наш на 20% ширины
    let idealCameraX = ownPlane.x - desiredOwnScreenRatio * viewWorldWidth;

    const maxCameraX = Math.max(0, worldWidth - viewWorldWidth);
    if (idealCameraX < 0) idealCameraX = 0;
    if (idealCameraX > maxCameraX) idealCameraX = maxCameraX;
    cameraX = idealCameraX;
  }

  planes.forEach(p => {
    p.update();

    if (p.domElement && ownPlane) {
      // Если цель далеко за пределами видимого окна — не рисуем
      const margin = 2000;
      if (p.x < cameraX - margin || p.x > cameraX + viewWorldWidth + margin) {
        p.domElement.style.display = 'none';
        return;
      }

      const norm = (p.x - cameraX) / viewWorldWidth; // 0..1
      const screenX = norm * screenWidth;

      if (p.type === 'own') {
        // как только наш ушёл за правый край мира — перезапуск
        if (ownPlane.x >= worldWidth) {
          resetSimulation();
          return;
        }
      }

      const cameraBaseAlt = 10000;
      const altDiff = cameraBaseAlt - p.alt;
      const pixelsPerFt = 0.15 * zoomFactor;

      let rawScreenY = (window.innerHeight * 0.35) +
        (altDiff * pixelsPerFt) +
        (p.y * 0.05 * zoomFactor);

      let finalScreenY = Math.max(minY, Math.min(rawScreenY, maxY));
      const finalScale = (p.scale || 1) * zoomFactor;

      p.domElement.style.transform =
        `translate(${screenX}px, ${finalScreenY}px) scale(${finalScale})`;
      p.domElement.style.display = 'block';
    }
  });

  const ownVsText = document.getElementById('vs-text-own');
  if (ownVsText && ownPlane) ownVsText.textContent = Math.round(ownPlane.vertSpeedFtMin);

  const enemyPlane = planes.find(p => p.isControlled && p.type === 'enemy');
  const enemyVsText = document.getElementById('vs-text-enemy');
  if (enemyVsText && enemyPlane) enemyVsText.textContent = Math.round(enemyPlane.vertSpeedFtMin);

  Radar.draw(ownPlane, enemies, audioController);
  requestAnimationFrame(animate);
}

document.addEventListener('DOMContentLoaded', () => {
  audioController.init();
  injectXpdrFont(); // шрифт для XPDR
  Radar.init();
  initPlanes();
  Controls.init(planes, Radar);
  animate();
});
