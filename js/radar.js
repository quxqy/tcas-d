const Radar = {

  canvas: null,
  ctx: null,
  bgImage: null,

  modeIndex: 1,
  systemStatus: 'STBY',

  testState: { active: false, startTime: 0, phase: 'idle' },

  threatState: {
    hasTraffic: false,
    hasRA: false,
    advisory: null,
    raPhase: 'none',
    raStartTime: 0,
    lastVsOkTime: null,
    lastIncreaseTime: 0,
    increaseCount: 0,
    lastClearTime: 0 // НОВОЕ: Время, когда последний раз звучал Clear
  },

  OWN_PLANE_Y_RATIO: 0.60,
  extraWidth: 40,
  baseWidth: null,
  CENTER_OFFSET: 25,

  init() {
    this.canvas = document.getElementById('radarScreen');
    this.ctx = this.canvas.getContext('2d');
    this.bgImage = document.getElementById('radar-bg');

    this.baseWidth = this.canvas.width;
    const extra = this.extraWidth || 0;
    const newWidth = this.baseWidth + extra;

    this.canvas.width = newWidth;
    this.canvas.style.width = newWidth + 'px';
    this.bgImage.style.width = newWidth + 'px';

    const container = this.bgImage.parentElement;
    if (container) {
      container.style.width = newWidth + 'px';
    }

    this.setRangeMode(1);
    this.bgImage.style.opacity = '1.0';
  },

  setSystemStatus(status) {
    if (this.testState.active && status === 'STBY') {
      this.systemStatus = status;
      return;
    }

    if (status === 'TEST' && this.systemStatus !== 'TEST') {
      this.testState.active = true;
      this.testState.startTime = Date.now();
      this.testState.phase = 'displaying';
      this.playSound('testok', false);
    } else if (status !== 'TEST') {
      this.testState.active = false;
      this.systemStatus = status;
      this.bgImage.style.opacity = '1.0';
    }
  },

  setRangeMode(index) {
    let safeIndex = index;
    if (index >= CONFIG.RADAR.IMAGES.length) safeIndex = CONFIG.RADAR.IMAGES.length - 1;
    if (index < 0) safeIndex = 0;
    this.modeIndex = safeIndex;
    if (CONFIG.RADAR.IMAGES[safeIndex]) {
      this.bgImage.src = CONFIG.RADAR.IMAGES[safeIndex];
    }
  },

  getCurrentRange() {
    const ranges = CONFIG.RADAR.RANGES;
    if (this.modeIndex >= ranges.length) return ranges[ranges.length - 1];
    return ranges[this.modeIndex];
  },

  playSound(id, play) {},

  draw(ownPlane, enemies, audioController) {
    if (!this.ctx || !ownPlane) return;

    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    if (this.testState.active) {
      this.drawTestSequence(width, height, audioController);
      if (Date.now() - this.testState.startTime > 7000) {
        this.testState.active = false;
      }
      return;
    }

    const extra = this.extraWidth || 0;
    const cx = (width / 2) + 62 - extra / 2 + this.CENTER_OFFSET;
    const cy = (height * 0.85) - 12;

    const rangeInMiles = this.getCurrentRange();
    const maxVisualDistancePx = 300;
    const scale = maxVisualDistancePx / (rangeInMiles * 1000);
    const blipScaleFactor = 0.5;

    this.ctx.save();
    this.ctx.textAlign = "center";
    this.ctx.font = "bold 20px Consolas";
    this.ctx.fillStyle = "white";

    let showThreats = true;
    let forceStatus = null;

    if (this.systemStatus === 'STBY') {
      this.ctx.font = "bold 12px Consolas";
      this.ctx.fillText("TCAS STBY", cx - 80, cy - 5);
      this.ctx.restore();
      this.drawVSScale(ownPlane.vertSpeedFtMin, null);
      return;
    }

    if (this.systemStatus === 'ALT_OFF') {
      this.ctx.font = "bold 12px Consolas";
      this.ctx.fillText("TCAS OFF", cx - 80, cy + 5);
      showThreats = false;
      forceStatus = 0;

    } else if (this.systemStatus === 'ALT_ON') {
      this.ctx.font = "bold 12px Consolas";
      this.ctx.fillText("TCAS OFF", cx - 80, cy + 5);
      showThreats = false;
      forceStatus = 0;

    } else if (this.systemStatus === 'TA') {
      this.ctx.font = "bold 12px Consolas";
      this.ctx.fillText("TA ONLY", cx - 80, cy + 5);
    }

    this.ctx.restore();

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, maxVisualDistancePx, Math.PI, 2 * Math.PI);
    this.ctx.clip();

    let currentMaxThreatLevel = 0;
    let raAdvisory = null;

    enemies.forEach(enemy => {
      const forward_dist = (enemy.x - ownPlane.x);
      const lateral_dist = (enemy.y - ownPlane.y);

      const screenY = cy - forward_dist * scale;
      const screenX = cx - lateral_dist * scale;

      const distFromCenter = Math.sqrt(
        Math.pow(screenX - cx, 2) + Math.pow(screenY - cy, 2)
      );
      if (distFromCenter > maxVisualDistancePx) return;

      // 1. Стандартный расчет (вертикаль и физика сохраняются)
      let status = enemy.checkThreat(ownPlane);

      // 2. ГОРИЗОНТАЛЬНЫЙ СРЕЗ (Horizontal Cutoff)
      // Если враг летел навстречу (vectorX < 0) и его координата X стала меньше нашей (мы его перегнали),
      // то мгновенно убираем угрозу. 
      if (enemy.vectorX < 0 && enemy.x < ownPlane.x) {
         status = 0;
         enemy.isRaActive = false; // Снимаем "залипание"
      }

      if (forceStatus !== null) {
        status = forceStatus;
      } else if (this.systemStatus === 'TA') {
        if (status === 3) status = 2;
      }

      if (status > currentMaxThreatLevel) currentMaxThreatLevel = status;

      // Логика определения типа команды (Advisory)
      if (status === 3 && this.systemStatus === 'TA/RA') {
        const altDiff = enemy.alt - ownPlane.alt;
        
        if (Math.abs(altDiff) > 750) {
            raAdvisory = 'maintain';
        } else {
            if (altDiff > 0) raAdvisory = 'descend'; 
            else raAdvisory = 'climb';               
        }
      }

      this.drawBlip(this.ctx, screenX, screenY, status, enemy, ownPlane, blipScaleFactor);
    });

    this.ctx.restore();

    this.ctx.fillStyle = "rgba(255,255,255,0)";
    this.ctx.beginPath();
    const triSize = 8;
    this.ctx.moveTo(cx, cy - triSize * 0.5);
    this.ctx.lineTo(cx - triSize, cy + triSize);
    this.ctx.lineTo(cx + triSize, cy + triSize);
    this.ctx.closePath();
    this.ctx.fill();

    this.drawVSScale(ownPlane.vertSpeedFtMin, raAdvisory);

    if (showThreats) {
      this.handleAlerts(
        width,
        height,
        cx,
        cy,
        currentMaxThreatLevel,
        raAdvisory,
        audioController,
        ownPlane.vertSpeedFtMin
      );
    }
  },

  drawTestSequence(w, h, audio) {
    const now = Date.now();
    const elapsed = now - this.testState.startTime;

    const cy = h * 0.85;
    const extra = this.extraWidth || 0;
    const cx = (w / 2) + 62 - extra / 2 + this.CENTER_OFFSET;
    const testScaleFactor = 0.6;

    if (elapsed < 7000) {
        const dummyEnemy = { alt: 1000, vertSpeedFtMin: 0 };
        const dummyOwn = { alt: 0 };

        this.drawBlip(this.ctx, cx - 50, cy - 100, 3, dummyEnemy, dummyOwn, testScaleFactor);
        this.drawBlip(this.ctx, cx - 50, cy - 200, 1, dummyEnemy, dummyOwn, testScaleFactor);
        this.drawBlip(this.ctx, cx + 80, cy - 100, 2, dummyEnemy, dummyOwn, testScaleFactor);
        this.drawBlip(this.ctx, cx + 80, cy - 200, 0, dummyEnemy, dummyOwn, testScaleFactor);

        this.ctx.fillStyle = "#FFFF00";
        this.ctx.font = "bold 14px Consolas";
        this.ctx.fillText("TRAFFIC", cx - 110, cy - 20);

        this.ctx.fillStyle = "white";
        this.ctx.font = "bold 14px Consolas";
        this.ctx.fillText("TCAS TEST", cx + 35, cy - 20);
    } else if (elapsed >= 7000 && this.testState.phase === 'displaying') {
        this.testState.phase = 'finished';
        audio.play('testok');
    }
  },

  handleAlerts(w, h, cx, cy, maxThreat, advisory, audio, ownVs) {
    const newHasTraffic = (maxThreat >= 2);
    const newHasRA = (maxThreat === 3);
    const now = Date.now();

    // --- ОТРИСОВКА ТЕКСТА ---
    const textX = cx + 45;
    if (newHasRA && advisory) {
      if (advisory !== 'maintain') {
        this.ctx.fillStyle = "red";
        this.ctx.font = "bold 16px Consolas";
        const text = advisory.toUpperCase();
        this.ctx.fillText(text, textX, cy - 40);
      }
    } else if (newHasTraffic) {
      this.ctx.fillStyle = "#FFFF00";
      this.ctx.font = "bold 16px Consolas";
      this.ctx.fillText("TRAFFIC", textX, cy - 20);
    }

    // --- ЛОГИКА АУДИО ---

    // 1. CLEAR OF CONFLICT
    // Срабатывает, когда мы перегнали цель (RA исчез).
    if (this.threatState.hasRA && !newHasRA) {
        audio.play('clear');
        this.threatState.raPhase = 'none';
        this.threatState.raStartTime = 0;
        this.threatState.lastVsOkTime = null;
        this.threatState.lastIncreaseTime = 0;
        this.threatState.increaseCount = 0;
        
        this.threatState.hasRA = false;
        
        // ВАЖНО: Сбрасываем флаг Traffic в false, чтобы система снова могла проверить условия для Traffic.
        // Но сам звук Traffic будет заблокирован таймером ниже.
        this.threatState.hasTraffic = false; 

        // Запоминаем время, когда закончился конфликт
        this.threatState.lastClearTime = now;
    }

    // 2. TRAFFIC ALERT (с задержкой)
    // Мы хотим сказать Traffic, если есть угроза, нет RA, и мы еще не сказали Traffic.
    if (newHasTraffic && !this.threatState.hasTraffic && !newHasRA) {
        // Проверяем, сколько прошло времени с момента Clear
        const timeSinceClear = now - this.threatState.lastClearTime;
        
        // Если прошло больше 2500 мс (2.5 сек), разрешаем воспроизведение
        if (timeSinceClear > 2500) {
            audio.play('traffic');
            // Ставим флаг только ПОСЛЕ воспроизведения
            this.threatState.hasTraffic = true;
        }
        // Если время еще не прошло — мы просто ничего не делаем в этом кадре.
        // В следующем кадре условие newHasTraffic всё еще будет true, и мы снова проверим таймер.
    }

    // 3. НОВЫЙ RA или ИЗМЕНЕНИЕ ADVISORY
    const isNewRA = newHasRA && !this.threatState.hasRA;
    const isAdvisoryChange = newHasRA && this.threatState.hasRA && (advisory !== this.threatState.advisory);

    if (isNewRA || isAdvisoryChange) {
      audio.play(advisory);
      
      this.threatState.raPhase = 'initial';
      this.threatState.raStartTime = now; 
      this.threatState.lastIncreaseTime = now;
      this.threatState.increaseCount = 0;
      this.threatState.lastVsOkTime = null;
    }

    // 4. ПРОВЕРКА ВЕРТИКАЛЬНОЙ СКОРОСТИ (INCREASE)
    if (newHasRA && advisory && advisory !== 'maintain') {
      const greenMin = 1500;
      const greenOk = (advisory === 'climb')
        ? (ownVs >= greenMin)
        : (ownVs <= -greenMin);

      if (greenOk) {
        if (!this.threatState.lastVsOkTime) {
          this.threatState.lastVsOkTime = now;
        }
      } else {
        this.threatState.lastVsOkTime = null;
      }

      const needIncrease = !greenOk;

      if (needIncrease) {
        const timeSinceStart = now - this.threatState.raStartTime;
        const timeSinceLastInc = now - this.threatState.lastIncreaseTime;
        const reactionTimeExpired = timeSinceStart > 4000;
        const intervalExpired = timeSinceLastInc > 3000;
        const countNotExceeded = this.threatState.increaseCount < 1;

        if (reactionTimeExpired && intervalExpired && countNotExceeded) {
          const incId = (advisory === 'climb')
            ? 'increase_climb'
            : 'increase_descent';
          
          audio.play(incId);
          
          this.threatState.lastIncreaseTime = now;
          this.threatState.increaseCount++;
        }
      }
    }

    // Сохранение состояния
    // Обратите внимание: hasTraffic сохраняем внутри блока 2, чтобы учесть задержку
    this.threatState.hasRA = newHasRA;
    this.threatState.advisory = advisory;
    // hasTraffic обновляется индивидуально внутри логики с таймером
    if (!newHasTraffic) {
       this.threatState.hasTraffic = false;
    }
  },

  drawBlip(ctx, x, y, status, enemy, ownPlane, scaleFactor) {
    let color = "#00FFFF";
    const baseSize = CONFIG.BLIP_BASE_SIZE || 12;
    const size = baseSize * scaleFactor;

    if (status === 3) color = "#FF0000";
    else if (status === 2) color = "#FFFF00";
    else if (status === 1) color = "#00FFFF";
    else color = "#00FFFF";

    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    ctx.save();
    ctx.beginPath();

    if (status === 3) {
      ctx.fillRect(x - size, y - size, size * 2, size * 2);
    } else if (status === 2) {
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    } else if (status === 1) {
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x, y + size);
      ctx.lineTo(x - size, y);
      ctx.fill();
    } else {
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x, y + size);
      ctx.lineTo(x - size, y);
      ctx.closePath();
      ctx.stroke();
    }

    const diff = Math.round((enemy.alt - ownPlane.alt) / 100);
    const absDiff = Math.abs(diff);
    const isBig = enemy.scale && enemy.scale > 1.3;
    const showLabel = (status > 0 || absDiff < 30 || isBig);

    if (showLabel) {
      const sign = diff >= 0 ? "+" : "-";
      const mag = Math.abs(diff);
      const magStr = mag < 10 ? `0${mag}` : `${mag}`;
      const text = sign + magStr;

      const isEnemyAbove = enemy.alt > ownPlane.alt;
      const textY = isEnemyAbove ? (y - size - 5) : (y + size + 15);

      const vs = enemy.vertSpeedFtMin;
      let arrow = "";
      if (vs > 500) arrow = " \u2191";
      else if (vs < -500) arrow = " \u2193";

      ctx.font = `bold ${Math.max(12, 14 * scaleFactor)}px Consolas`;
      ctx.textAlign = "center";
      ctx.fillStyle = color;
      ctx.fillText(text + arrow, x, textY);
    }

    ctx.restore();
  },

  drawVSScale(currentSpeed, advisory) {
    const ctx = this.ctx;
    const x = 20;
    const y = this.canvas.height / 2;
    const h = 260;
    const w = 14;
    const maxSpeed = 6000;

    const speedToY = (spd) => y - (spd / maxSpeed) * (h / 2);

    ctx.fillStyle = "gray";
    ctx.fillRect(x + w / 2 - 1, y - h / 2, 2, h);

    ctx.strokeStyle = "gray";
    ctx.lineWidth = 1;

    for (let spd = -6000; spd <= 6000; spd += 1000) {
      const ty = speedToY(spd);
      ctx.beginPath();
      const tickLen = (spd % 2000 === 0) ? 8 : 4;
      ctx.moveTo(x + w / 2 - tickLen, ty);
      ctx.lineTo(x + w / 2 + tickLen, ty);
      ctx.stroke();
    }

    if (advisory) {
      const greenColor = "#00FF00";
      const redColor = "#FF0000";

      if (advisory === 'maintain') {
          const yPlus1000 = speedToY(1000);
          const yMinus1000 = speedToY(-1000);
          const yTop = speedToY(6000);
          const yBottom = speedToY(-6000);

          ctx.fillStyle = redColor;
          ctx.fillRect(x, yTop, w, yPlus1000 - yTop);
          ctx.fillRect(x, yMinus1000, w, yBottom - yMinus1000);

          ctx.fillStyle = greenColor;
          ctx.fillRect(x, yPlus1000, w, yMinus1000 - yPlus1000);

      } else if (advisory === 'climb') {
        const y1500 = speedToY(1500);
        const yTop = speedToY(6000);
        const yBottom = speedToY(-6000);

        ctx.fillStyle = redColor;
        ctx.fillRect(x, y1500, w, yBottom - y1500);
        ctx.fillStyle = greenColor;
        ctx.fillRect(x, yTop, w, y1500 - yTop);
      } else if (advisory === 'descend') {
        const yNeg1500 = speedToY(-1500);
        const yTop = speedToY(6000);
        const yBottom = speedToY(-6000);

        ctx.fillStyle = redColor;
        ctx.fillRect(x, yTop, w, yNeg1500 - yTop);
        ctx.fillStyle = greenColor;
        ctx.fillRect(x, yNeg1500, w, yBottom - yNeg1500);
      }
    }

    let speed = currentSpeed;
    if (speed > maxSpeed) speed = maxSpeed;
    if (speed < -maxSpeed) speed = -maxSpeed;

    const zeroY = speedToY(0);
    const curY = speedToY(speed);
    const topY = Math.min(zeroY, curY);
    const barH = Math.abs(curY - zeroY);

    ctx.fillStyle = "white";
    ctx.globalAlpha = 0.8;
    ctx.fillRect(x + 2, topY, w - 4, barH);
    ctx.globalAlpha = 1.0;

    ctx.beginPath();
    ctx.moveTo(x + w, curY);
    ctx.lineTo(x + w + 15, curY - 8);
    ctx.lineTo(x + w + 15, curY + 8);
    ctx.fill();
  }

};
