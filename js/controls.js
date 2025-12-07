const Controls = {

    initialized: false,
    planes: [],
    radar: null,
    xpdr: [1, 2, 0, 0],

    // Локальные SFX
    sfx: {
        twister: null,
        button: null
    },

    init(planes, radar) {
        this.planes = planes;
        this.radar = radar;

        // Инициализация локальных звуков
        if (!this.sfx.twister) {
            this.sfx.twister = new Audio('audio/twister.mp3');
            this.sfx.button = new Audio('audio/button.mp3');
        }

        if (this.initialized) return;
        this.setupRangeKnob();
        this.setupCentralPanel();
        this.setupVSButtons();
        this.setupTransponderKnobs();
        this.initialized = true;
    },

    playTwister() {
        if (!this.sfx.twister) return;
        try {
            this.sfx.twister.currentTime = 0;
            this.sfx.twister.play().catch(() => {});
        } catch (e) {}
    },

    playButton() {
        if (!this.sfx.button) return;
        try {
            this.sfx.button.currentTime = 0;
            this.sfx.button.play().catch(() => {});
        } catch (e) {}
    },

    isRightClick(event, element) {
        const rect = element.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        return clickX > (rect.width / 2);
    },

    setupTransponderKnobs() {
        const display = document.getElementById('xpdr-display');
        const updateDisplay = () => {
            if (display) display.textContent = this.xpdr.join('');
        };

        const knobs = [
            { id: 'knob-left-inner', idx: 0 },
            { id: 'knob-left-outer', idx: 1 },
            { id: 'knob-right-inner', idx: 2 },
            { id: 'knob-right-outer', idx: 3 }
        ];

        knobs.forEach(k => {
            const el = document.getElementById(k.id);
            if (!el) return;

            let rotation = 0;
            const step = 30;

            el.addEventListener('contextmenu', e => e.preventDefault());

            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const isRight = this.isRightClick(e, el);
                const dir = isRight ? 1 : -1;

                rotation += dir * step;
                el.style.transform = `rotate(${rotation}deg)`;

                let val = this.xpdr[k.idx] + dir;
                if (val > 7) val = 0;
                if (val < 0) val = 7;
                this.xpdr[k.idx] = val;
                updateDisplay();

                this.playTwister();
            });
        });

        updateDisplay();
    },

    setupRangeKnob() {
        const knob = document.getElementById('range-knob');
        if (!knob) return;

        const visualKnobPositions = [-116, -87, -59];
        let currentPosIndex = 1;

        const updateKnob = () => {
            const deg = visualKnobPositions[currentPosIndex];
            knob.style.transform = `translateX(-50%) rotate(${deg}deg)`;
            this.radar.setRangeMode(currentPosIndex);
        };

        updateKnob();

        knob.addEventListener('click', (e) => {
            e.preventDefault();

            if (this.isRightClick(e, knob)) {
                currentPosIndex++;
                if (currentPosIndex >= visualKnobPositions.length) currentPosIndex = visualKnobPositions.length - 1;
            } else {
                currentPosIndex--;
                if (currentPosIndex < 0) currentPosIndex = 0;
            }

            updateKnob();
            this.playTwister();
        });
    },

    setupCentralPanel() {
        const atcBtn = document.getElementById('btn-atc');
        if (atcBtn) {
            const press = () => { 
                atcBtn.src = CONFIG.IMAGES.ATC_ON; 
                this.playButton();
            };
            const release = () => { atcBtn.src = CONFIG.IMAGES.ATC_OFF; };

            atcBtn.addEventListener('mousedown', press);
            atcBtn.addEventListener('mouseup', release);
            atcBtn.addEventListener('mouseleave', release);
            atcBtn.addEventListener('touchstart', (e) => { e.preventDefault(); press(); });
            atcBtn.addEventListener('touchend', release);
        }

        const modeKnob = document.getElementById('knob-mode');
        const modeKnobPositions = [-180, -150, -110, -75, -35, 0];

        // 1. TEST
        // 2. STBY
        // 3. ALT_OFF
        // 4. ALT_ON
        // 5. TA ONLY
        // 6. TA/RA
        const modeNames = ['TEST', 'STBY', 'ALT_OFF', 'ALT_ON', 'TA', 'TA/RA'];
        let modeIdx = 1; // Start at STBY

        if (modeKnob) {
            const updateModeKnob = () => {
                const deg = modeKnobPositions[modeIdx];
                modeKnob.style.transform = `rotate(${deg}deg)`;
                this.radar.setSystemStatus(modeNames[modeIdx]);
            };

            setTimeout(updateModeKnob, 100);

            modeKnob.addEventListener('click', (e) => {
                e.preventDefault();

                if (this.radar.testState && this.radar.testState.active) return;

                let changed = false;

                if (this.isRightClick(e, modeKnob)) {
                    // Вправо: не перепрыгиваем с последнего на TEST
                    if (modeIdx < modeKnobPositions.length - 1) {
                        modeIdx++;
                        changed = true;
                    } else {
                        return;
                    }
                } else {
                    // Влево: двигаемся к TEST, но не на последний
                    if (modeIdx > 0) {
                        modeIdx--;
                        changed = true;
                    }
                }

                if (!changed) return;

                updateModeKnob();
                this.playTwister();

                if (modeIdx === 0) {
                    // TEST сам возвращается в STBY
                    setTimeout(() => {
                        modeIdx = 1;
                        updateModeKnob();
                    }, 300);
                }
            });
        }
    },

    setupVSButtons() {
        const buttons = document.querySelectorAll('.vs-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();

                const dir = btn.dataset.dir;
                const targetId = btn.dataset.target;

                if (dir === 'up') btn.src = CONFIG.IMAGES.VS_PLUS_ON;
                else btn.src = CONFIG.IMAGES.VS_MINUS_ON;

                setTimeout(() => {
                    if (dir === 'up') btn.src = CONFIG.IMAGES.VS_PLUS_OFF;
                    else btn.src = CONFIG.IMAGES.VS_MINUS_OFF;
                }, 150);

                let p = null;
                if (targetId === 'own') {
                    p = this.planes.find(pl => pl.type === 'own');
                } else if (targetId === 'enemy') {
                    p = this.planes.find(pl => pl.type === 'enemy' && pl.isControlled);
                }

                if (p) {
                    const delta = (dir === 'up') ? CONFIG.VS_INCREMENT : -CONFIG.VS_INCREMENT;
                    p.adjustVertSpeed(delta);
                    this.playButton();
                }
            });
        });
    }

};
