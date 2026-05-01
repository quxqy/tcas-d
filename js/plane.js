class Plane {

  constructor(id, type, options = {}) {
    this.id = id;
    this.type = type;

    this.x = options.x || 0;
    this.y = options.y || 0;
    this.alt = options.alt || 10000;
    this.speed = options.speed || 50;
    this.scale = options.scale || 1.0;

    this.isControlled = options.isControlled || (type === 'own');
    this.vertSpeedFtMin = 0;

    // Флаг: была ли эта цель активирована как RA (Red)
    // Она останется RA, пока конфликт не будет полностью исчерпан
    this.isRaActive = false;

    if (this.type === 'own') {
      this.vectorX = (this.speed / 15);
      this.vectorY = 0;
      this.imgRight = CONFIG.IMAGES.OWN_RIGHT;
      this.imgLeft = CONFIG.IMAGES.OWN_LEFT;
    } else {
      this.vectorX = (this.speed / 15);
      this.vectorY = options.vectorY !== undefined ? options.vectorY : (Math.random() * 2 - 1);

      if (this.isControlled) {
        this.imgRight = CONFIG.IMAGES.CONTROL_RIGHT;
        this.imgLeft = CONFIG.IMAGES.CONTROL_LEFT;
      } else {
        this.imgRight = CONFIG.IMAGES.ENEMY_RIGHT;
        this.imgLeft = CONFIG.IMAGES.ENEMY_LEFT;
      }
    }

    this.currentImgSrc = this.imgRight;
    this.domElement = null;
  }

  update() {
    this.x += this.vectorX;
    this.y += this.vectorY;
    this.alt += (this.vertSpeedFtMin / 360);

    // Physics Limits
    if (this.alt < 0) {
      this.alt = 0;
      if (this.vertSpeedFtMin < 0) this.vertSpeedFtMin = 0;
    }

    if (this.alt > 30000) {
      this.alt = 30000;
      if (this.vertSpeedFtMin > 0) this.vertSpeedFtMin = 0;
    }

    // Horizontal Bounds & Image Direction
    if (this.x <= 0) {
      this.x = 0;
      this.vectorX = Math.abs(this.vectorX);
    }

    if (this.x >= CONFIG.WORLD_WIDTH) {
      if (this.type !== 'own') {
        this.x = CONFIG.WORLD_WIDTH;
        this.vectorX = -Math.abs(this.vectorX);
      }
    }

    // Image Direction
    if (this.vectorX < 0 && this.currentImgSrc !== this.imgLeft) {
      this.currentImgSrc = this.imgLeft;
      if (this.domElement) this.domElement.src = this.imgLeft;
    } else if (this.vectorX >= 0 && this.currentImgSrc !== this.imgRight) {
      this.currentImgSrc = this.imgRight;
      if (this.domElement) this.domElement.src = this.imgRight;
    }
  }

  adjustVertSpeed(delta) {
    this.vertSpeedFtMin += delta;
    if (this.vertSpeedFtMin > 6000) this.vertSpeedFtMin = 6000;
    if (this.vertSpeedFtMin < -6000) this.vertSpeedFtMin = -6000;
  }

  checkThreat(otherPlane) {
    if (!otherPlane || this.id === otherPlane.id) return 0;

    const dx = Math.abs(this.x - otherPlane.x);
    const dy = Math.abs(this.y - otherPlane.y);
    const dz = Math.abs(this.alt - otherPlane.alt);
    const distSq = dx * dx + dy * dy;
    const dist = Math.sqrt(distSq);

    const RA_DIST = 8000;
    const RA_ALT  = 1200;
    const TA_DIST = 9000;
    const TA_ALT  = 2000;
    const PROX_DIST = 12000;
    const PROX_ALT  = 2500;

    const isBigNear = (this.id === 4);

    if (isBigNear) {
      if (dist < PROX_DIST && dz < PROX_ALT) return 1;
      return 0;
    }

    // 1. Рассчитываем "мгновенный" статус
    let rawStatus = 0;
    if (dist < RA_DIST && dz < RA_ALT) rawStatus = 3;
    else if (dist < TA_DIST && dz < TA_ALT) rawStatus = 2;
    else if (dist < PROX_DIST && dz < PROX_ALT) rawStatus = 1;

    // 2. Логика "залипания" RA (Sticky RA)
    if (this.isRaActive) {
        // Если RA был активен, он остается активным (3)
        // до тех пор, пока rawStatus не упадет до 0 (полностью безопасно).
        if (rawStatus === 0) {
            // Полностью разошлись по дистанции И по высоте
            this.isRaActive = false;
            return 0;
        } else {
            // Угроза все еще есть (1, 2, или 3). Мы форсируем 3 (RA).
            return 3; 
        }
    } else {
        // Если RA не активен, и мы достигли RA зоны
        if (rawStatus === 3) {
            this.isRaActive = true;
        }
        // Возвращаем текущий статус (0, 1, 2, или 3)
        return rawStatus;
    }
  }
}