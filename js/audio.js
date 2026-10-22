/**
 * Audio.js
 * 100% Procedural Web Audio API sound generator for "KILL THE FLY".
 * Features 3D spatialized fly buzzing, weapon audio, forest ambience,
 * neural spike telemetric beeps, and impact squishes with zero external dependencies.
 */

class SoundSystem {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.isMuted = false;
        this.isInitialized = false;

        // Decoded real recorded audio buffers
        this.audioBuffers = new Map();
        this.preloaded = false;

        // Active fly buzz audio nodes indexed by fly id
        this.flyBuzzers = new Map();

        // Ambience generator state
        this.ambienceGain = null;
        this.nextBirdTime = 0;
        this.rainSource = null;
        this.rainGain = null;
        this.currentWeatherMode = 'day';
    }

    init() {
        if (this.isInitialized) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
            this.masterGain.connect(this.ctx.destination);

            this.initForestAmbience();
            this.preloadAllSounds();
            this.isInitialized = true;
        } catch (e) {
            console.warn("Web Audio API initialization failed:", e);
        }
    }

    /**
     * Preloads authentic recorded audio files from free open repositories
     */
    preloadAllSounds() {
        if (this.preloaded || !this.ctx) return;
        this.preloaded = true;

        const manifest = {
            'fly_buzz': 'sounds/fly_buzz.opus',
            'pistol': 'sounds/pistol.wav',
            'gunshots': 'sounds/gunshots.ogg',
            'rocket_blast': 'sounds/rocket_blast.oga',
            'explosion': 'sounds/explosion.ogg',
            'swat_whoosh': 'sounds/swat_whoosh.ogg',
            'splat': 'sounds/splat.ogg',
            'reload': 'sounds/gun_cock.wav',
            'click': 'sounds/click.ogg',
            'hurt': 'sounds/hurt.ogg',
            'death': 'sounds/wilhelm_death.ogg',
            'rain': 'sounds/rain_thunder.ogg',
            'thunder': 'sounds/thunder.ogg',
            'electric': 'sounds/electric_shock.ogg',
            'birds': 'sounds/birds.ogg'
        };

        for (const [key, path] of Object.entries(manifest)) {
            fetch(path)
                .then(r => {
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    return r.arrayBuffer();
                })
                .then(ab => this.ctx.decodeAudioData(ab))
                .then(audioBuf => {
                    this.audioBuffers.set(key, audioBuf);
                })
                .catch(err => {
                    // Procedural synthesis fallback is preserved
                });
        }
    }

    /**
     * Plays a preloaded authentic audio buffer with custom volume, pitch and routing
     */
    playBuffer(key, options = {}) {
        if (!this.ctx) this.init();
        if (!this.ctx) return null;
        this.resume();

        const buf = this.audioBuffers.get(key);
        if (!buf) return null;

        try {
            const src = this.ctx.createBufferSource();
            src.buffer = buf;
            src.loop = Boolean(options.loop);
            if (options.playbackRate) {
                src.playbackRate.setValueAtTime(options.playbackRate, this.ctx.currentTime);
            }

            const gain = this.ctx.createGain();
            const vol = (options.volume !== undefined) ? options.volume : 0.8;
            gain.gain.setValueAtTime(vol, this.ctx.currentTime);

            if (options.panner) {
                src.connect(gain);
                gain.connect(options.panner);
            } else {
                src.connect(gain);
                gain.connect(this.masterGain);
            }

            // Clamp randomized sample offsets to the decoded clip. Some browser
            // decoders reject starts beyond the end of shorter OGG/Opus assets.
            const offset = Math.min(Math.max(0, options.offset || 0), Math.max(0, buf.duration - 0.01));
            if (options.duration) {
                src.start(this.ctx.currentTime, offset, Math.min(options.duration, buf.duration - offset));
            } else {
                src.start(this.ctx.currentTime, offset);
            }
            return { source: src, gain: gain };
        } catch (e) {
            return null;
        }
    }

    resume() {
        if (!this.ctx) this.init();
        if (!this.ctx || this.ctx.state !== 'suspended') return Promise.resolve();
        return this.ctx.resume().catch(() => {});
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.masterGain) {
            this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.7, this.ctx.currentTime);
        }
        return this.isMuted;
    }

    /**
     * Updates listener position & orientation for 3D spatial audio
     */
    updateListener(camera) {
        if (!this.ctx || !this.isInitialized) return;
        try {
            const p = camera.position;
            const dir = new THREE.Vector3();
            camera.getWorldDirection(dir);
            const up = camera.up;

            const t = this.ctx.currentTime;
            if (this.ctx.listener.positionX && Number.isFinite(p.x)) {
                this.ctx.listener.positionX.setValueAtTime(p.x, t);
                this.ctx.listener.positionY.setValueAtTime(p.y, t);
                this.ctx.listener.positionZ.setValueAtTime(p.z, t);
                this.ctx.listener.forwardX.setValueAtTime(dir.x, t);
                this.ctx.listener.forwardY.setValueAtTime(dir.y, t);
                this.ctx.listener.forwardZ.setValueAtTime(dir.z, t);
                this.ctx.listener.upX.setValueAtTime(up.x, t);
                this.ctx.listener.upY.setValueAtTime(up.y, t);
                this.ctx.listener.upZ.setValueAtTime(up.z, t);
            } else if (this.ctx.listener.setPosition && Number.isFinite(p.x)) {
                this.ctx.listener.setPosition(p.x, p.y, p.z);
                this.ctx.listener.setOrientation(dir.x, dir.y, dir.z, up.x, up.y, up.z);
            }

            // Periodically trigger random procedural bird chirps in daytime alpine forest
            if (t > this.nextBirdTime && this.currentWeatherMode === 'day') {
                this.playProceduralBirdChirp();
                this.nextBirdTime = t + 4.0 + Math.random() * 6.0;
            }
        } catch (e) {}
    }

    /**
     * Creates or updates a 3D spatialized buzzing sound source for a fly
     * Uses authentic recorded insect buzzing when loaded, with procedural Doppler modulation
     */
    updateFlyBuzz(flyId, position, wingFreq = 180, isEscaping = false) {
        if (!this.ctx || !this.isInitialized || !Number.isFinite(position.x)) return;

        let buzzer = this.flyBuzzers.get(flyId);
        const t = this.ctx.currentTime;

        // Upgrade procedural buzzer to real insect buzz once audio buffer loads
        if (buzzer && !buzzer.isReal && this.audioBuffers.has('fly_buzz')) {
            try {
                if (buzzer.osc1) buzzer.osc1.stop();
                const realBuzzBuf = this.audioBuffers.get('fly_buzz');
                const src = this.ctx.createBufferSource();
                src.buffer = realBuzzBuf;
                src.loop = true;
                src.playbackRate.setValueAtTime(isEscaping ? 1.35 : 1.0, t);

                const gain = this.ctx.createGain();
                gain.gain.setValueAtTime(0.14, t);

                src.connect(gain);
                gain.connect(buzzer.panner);

                src.start(t, Math.random() * 5.0);
                buzzer.bufferSource = src;
                buzzer.gain = gain;
                buzzer.isReal = true;
            } catch (e) {}
        }

        if (!buzzer) {
            // Cap simultaneous buzzing sources to 8
            if (this.flyBuzzers.size >= 8) return;

            try {
                const panner = this.ctx.createPanner();
                panner.panningModel = 'equalpower';
                panner.distanceModel = 'exponential';
                panner.refDistance = 1.5;
                panner.maxDistance = 25.0;
                panner.rolloffFactor = 1.2;

                const realBuzzBuf = this.audioBuffers.get('fly_buzz');
                if (realBuzzBuf) {
                    const src = this.ctx.createBufferSource();
                    src.buffer = realBuzzBuf;
                    src.loop = true;
                    src.playbackRate.setValueAtTime(isEscaping ? 1.35 : 1.0, t);

                    const gain = this.ctx.createGain();
                    gain.gain.setValueAtTime(0.14, t);

                    src.connect(gain);
                    gain.connect(panner);
                    panner.connect(this.masterGain);

                    src.start(t, Math.random() * 5.0);
                    buzzer = { panner, bufferSource: src, gain, isReal: true };
                } else {
                    const osc1 = this.ctx.createOscillator();
                    osc1.type = 'sawtooth';
                    osc1.frequency.setValueAtTime(wingFreq, t);

                    const filter = this.ctx.createBiquadFilter();
                    filter.type = 'bandpass';
                    filter.frequency.setValueAtTime(wingFreq * 1.5, t);
                    filter.Q.setValueAtTime(2.0, t);

                    const gain = this.ctx.createGain();
                    gain.gain.setValueAtTime(0.06, t);

                    osc1.connect(filter);
                    filter.connect(gain);
                    gain.connect(panner);
                    panner.connect(this.masterGain);

                    osc1.start();
                    buzzer = { panner, osc1, filter, gain, isReal: false };
                }

                this.flyBuzzers.set(flyId, buzzer);
            } catch (e) {
                return;
            }
        }

        try {
            if (buzzer.panner.positionX && Number.isFinite(position.x)) {
                buzzer.panner.positionX.setValueAtTime(position.x, t);
                buzzer.panner.positionY.setValueAtTime(position.y, t);
                buzzer.panner.positionZ.setValueAtTime(position.z, t);
            } else if (buzzer.panner.setPosition && Number.isFinite(position.x)) {
                buzzer.panner.setPosition(position.x, position.y, position.z);
            }

            if (buzzer.isReal && buzzer.bufferSource) {
                const targetRate = isEscaping ? 1.35 : 1.0;
                buzzer.bufferSource.playbackRate.setTargetAtTime(targetRate, t, 0.05);
            } else if (buzzer.osc1) {
                const targetFreq = isEscaping ? wingFreq * 1.3 : wingFreq;
                buzzer.osc1.frequency.setTargetAtTime(targetFreq, t, 0.05);
            }
        } catch (e) {}
    }

    /**
     * Stop and cleanup buzz sound when a fly dies
     */
    stopFlyBuzz(flyId) {
        const buzzer = this.flyBuzzers.get(flyId);
        if (buzzer) {
            const t = this.ctx.currentTime;
            buzzer.gain.gain.linearRampToValueAtTime(0.001, t + 0.08);
            setTimeout(() => {
                try {
                    if (buzzer.bufferSource) buzzer.bufferSource.stop();
                    if (buzzer.osc1) buzzer.osc1.stop();
                    if (buzzer.osc2) buzzer.osc2.stop();
                    if (buzzer.lfo) buzzer.lfo.stop();
                    buzzer.panner.disconnect();
                } catch (e) {}
                this.flyBuzzers.delete(flyId);
            }, 90);
        }
    }

    /**
     * Badminton racket swoosh swing sound
     */
    playSwatSwing() {
        if (this.playBuffer('swat_whoosh', { volume: 0.85, playbackRate: 0.95 + Math.random() * 0.15 })) return;
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const dur = 0.22;

        // White noise through sweeping bandpass filter
        const bufferSize = this.ctx.sampleRate * dur;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(400, t);
        filter.frequency.exponentialRampToValueAtTime(1800, t + 0.08);
        filter.frequency.exponentialRampToValueAtTime(250, t + dur);
        filter.Q.setValueAtTime(2.2, t);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.01, t);
        gain.gain.linearRampToValueAtTime(0.65, t + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        noise.start(t);
        noise.stop(t + dur);
    }



    /**
     * Fly swat / squash hit sound
     */
    playFlySplat() {
        if (this.playBuffer('splat', { volume: 0.95, playbackRate: 0.9 + Math.random() * 0.25 })) return;
        if (!this.ctx) return;
        const t = this.ctx.currentTime;

        // 1. Heavy resonant body thud
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.16);

        const oscGain = this.ctx.createGain();
        oscGain.gain.setValueAtTime(0.9, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

        osc.connect(oscGain);
        oscGain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.18);

        // 2. Crunchy wet squish noise
        const dur = 0.25;
        const bufferSize = this.ctx.sampleRate * dur;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.04));
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1600, t);
        filter.frequency.linearRampToValueAtTime(400, t + dur);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.7, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, t + dur);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);

        noise.start(t);
        noise.stop(t + dur);
    }



    /**
     * Handgun pistol shot sound
     */
    playPistolShot() {
        if (this.playBuffer('pistol', { volume: 0.95, playbackRate: 0.98 + Math.random() * 0.05 })) {
            setTimeout(() => this.playShellCasing(), 180);
            return;
        }
        if (!this.ctx) return;
        const t = this.ctx.currentTime;

        // 1. Sharp punchy transient
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(420, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);

        const oscGain = this.ctx.createGain();
        oscGain.gain.setValueAtTime(1.0, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

        osc.connect(oscGain);
        oscGain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.2);

        // 2. Gunpowder explosion crack
        const dur = 0.35;
        const bufferSize = Math.floor(this.ctx.sampleRate * dur);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1);
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(5000, t);
        filter.frequency.exponentialRampToValueAtTime(600, t + dur);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.9, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);

        noise.start(t);
        noise.stop(t + dur);

        // 3. Shell casing clink slightly delayed
        setTimeout(() => this.playShellCasing(), 180);
    }

    /**
     * Machine gun rapid shot sound
     */
    playMachineGunShot() {
        if (this.playBuffer('gunshots', { volume: 0.85, duration: 0.16, offset: Math.random() * 2.5, playbackRate: 1.05 + Math.random() * 0.15 })) return;
        if (!this.ctx) return;
        const t = this.ctx.currentTime;

        // Punch kick
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 0.08);

        const oscGain = this.ctx.createGain();
        oscGain.gain.setValueAtTime(0.85, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

        osc.connect(oscGain);
        oscGain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.09);

        // Sharp muzzle blast
        const dur = 0.12;
        const bufferSize = Math.floor(this.ctx.sampleRate * dur);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1);
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2400, t);
        filter.Q.setValueAtTime(1.2, t);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.75, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);

        noise.start(t);
        noise.stop(t + dur);
    }



    /**
     * Shotgun heavy blast + buckshot disperse
     */
    playShotgunShot() {
        const p = this.playBuffer('pistol', { volume: 1.0, playbackRate: 0.62 });
        const e = this.playBuffer('explosion', { volume: 0.75, playbackRate: 0.8 });
        if (p || e) {
            setTimeout(() => {
                this.playMechanicalClick(this.ctx.currentTime, 500);
                setTimeout(() => this.playMechanicalClick(this.ctx.currentTime, 700), 120);
            }, 280);
            return;
        }
        if (!this.ctx) return;
        const t = this.ctx.currentTime;

        // Sub-bass thump
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + 0.22);
        const oscGain = this.ctx.createGain();
        oscGain.gain.setValueAtTime(1.0, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.connect(oscGain);
        oscGain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.25);

        // Booming noise blast
        const dur = 0.45;
        const bufferSize = Math.floor(this.ctx.sampleRate * dur);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3800, t);
        filter.frequency.exponentialRampToValueAtTime(400, t + dur);
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(1.0, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noise.start(t);
        noise.stop(t + dur);

        // Pump slide sound after 280ms
        setTimeout(() => {
            this.playMechanicalClick(this.ctx.currentTime, 500);
            setTimeout(() => this.playMechanicalClick(this.ctx.currentTime, 700), 120);
        }, 280);
    }

    /**
     * MAC-10 / UZI Rapid high-frequency SMG shot
     */
    playSMGShot() {
        if (this.playBuffer('gunshots', { volume: 0.85, duration: 0.12, offset: Math.random() * 2.5, playbackRate: 1.2 + Math.random() * 0.1 })) return;
        if (!this.ctx) return;
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(450, t);
        osc.frequency.exponentialRampToValueAtTime(70, t + 0.06);
        const oscGain = this.ctx.createGain();
        oscGain.gain.setValueAtTime(0.65, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        osc.connect(oscGain);
        oscGain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.07);

        const dur = 0.09;
        const bufferSize = Math.floor(this.ctx.sampleRate * dur);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(3200, t);
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.7, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noise.start(t);
        noise.stop(t + dur);
    }



    /**
     * AK-47 7.62mm heavy rifle crack
     */
    playAK47Shot() {
        if (this.playBuffer('gunshots', { volume: 0.95, duration: 0.18, offset: Math.random() * 2.5, playbackRate: 0.95 + Math.random() * 0.08 })) return;
        if (!this.ctx) return;
        const t = this.ctx.currentTime;

        // Distinctive deep wooden/steel body punch
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(380, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.16);
        const oscGain = this.ctx.createGain();
        oscGain.gain.setValueAtTime(0.95, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(oscGain);
        oscGain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.18);

        // Explosive muzzle report
        const dur = 0.28;
        const bufferSize = Math.floor(this.ctx.sampleRate * dur);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(4200, t);
        filter.frequency.exponentialRampToValueAtTime(800, t + dur);
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.85, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noise.start(t);
        noise.stop(t + dur);
    }



    /**
     * Heavy Squad LMG rhythmic thud
     */
    playLMGShot() {
        if (this.playBuffer('gunshots', { volume: 1.0, duration: 0.16, offset: Math.random() * 2.5, playbackRate: 0.85 + Math.random() * 0.08 })) return;
        if (!this.ctx) return;
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(260, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.11);
        const oscGain = this.ctx.createGain();
        oscGain.gain.setValueAtTime(1.0, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.connect(oscGain);
        oscGain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.12);

        const dur = 0.14;
        const bufferSize = Math.floor(this.ctx.sampleRate * dur);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2100, t);
        filter.Q.setValueAtTime(1.0, t);
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.85, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noise.start(t);
        noise.stop(t + dur);
    }



    /**
     * High-Caliber Sniper Rifle concussive gunshot
     */
    playSniperShot() {
        const p = this.playBuffer('pistol', { volume: 1.25, playbackRate: 0.7 });
        const e = this.playBuffer('explosion', { volume: 0.65, playbackRate: 0.75 });
        if (p || e) return;
        if (!this.ctx) return;
        const t = this.ctx.currentTime;

        // Massive thunderous crack
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(550, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + 0.35);
        const oscGain = this.ctx.createGain();
        oscGain.gain.setValueAtTime(1.0, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
        osc.connect(oscGain);
        oscGain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.38);

        // Reverberant mountain echo
        const dur = 0.75;
        const bufferSize = Math.floor(this.ctx.sampleRate * dur);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(6000, t);
        filter.frequency.exponentialRampToValueAtTime(300, t + dur);
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(1.0, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noise.start(t);
        noise.stop(t + dur);
    }



    /**
     * RPG-7 Rocket launch whoosh & ignition
     */
    playRocketLaunch() {
        if (this.playBuffer('rocket_blast', { volume: 1.0, duration: 2.2 })) return;
        if (!this.ctx) return;
        const t = this.ctx.currentTime;

        // Ignition pop + roaring whoosh
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, t);
        osc.frequency.linearRampToValueAtTime(450, t + 0.15);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.45);
        const oscGain = this.ctx.createGain();
        oscGain.gain.setValueAtTime(0.8, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc.connect(oscGain);
        oscGain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.45);

        // Rocket exhaust hiss
        const dur = 0.55;
        const bufferSize = Math.floor(this.ctx.sampleRate * dur);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1400, t);
        filter.frequency.exponentialRampToValueAtTime(600, t + dur);
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.9, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noise.start(t);
        noise.stop(t + dur);
    }



    /**
     * RPG-7 Rocket detonation explosion
     */
    playRocketExplosion() {
        if (this.playBuffer('explosion', { volume: 1.2, playbackRate: 0.85 })) return;
        if (!this.ctx) return;
        const t = this.ctx.currentTime;

        // Subwoofer earth-shattering boom
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(160, t);
        osc.frequency.exponentialRampToValueAtTime(25, t + 0.65);
        const oscGain = this.ctx.createGain();
        oscGain.gain.setValueAtTime(1.0, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
        osc.connect(oscGain);
        oscGain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.7);

        // Fiery debris noise blast
        const dur = 0.95;
        const bufferSize = Math.floor(this.ctx.sampleRate * dur);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2800, t);
        filter.frequency.exponentialRampToValueAtTime(150, t + dur);
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(1.0, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noise.start(t);
        noise.stop(t + dur);
    }



    /**
     * Empty clip or weapon dry fire click
     */
    playDryFire() {
        if (this.playBuffer('click', { volume: 0.75, playbackRate: 1.4 })) return;
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(900, t);
        osc.frequency.exponentialRampToValueAtTime(200, t + 0.04);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.04);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.04);
    }

    /**
     * Reload mechanism sound
     */
    playReload() {
        if (this.playBuffer('reload', { volume: 0.9 })) return;
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        
        // Eject click
        this.playMechanicalClick(t, 650);
        // Slide insert click
        setTimeout(() => this.playMechanicalClick(this.ctx.currentTime, 850), 320);
        // Chamber lock click
        setTimeout(() => this.playMechanicalClick(this.ctx.currentTime, 500), 580);
    }

    playMechanicalClick(t, freq) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, t);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.06);
    }

    playShellCasing() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2200 + Math.random() * 600, t);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.12);
    }

    /**
     * Giant Fiber (GF) Action Potential Spike Audio Pulse
     * Telemetric feedback so player hears the fly's brain firing an escape spike
     */
    playNeuralSpike() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.exponentialRampToValueAtTime(1400, t + 0.06);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(t);
        osc.stop(t + 0.08);
    }

    /**
     * Forest Wind & Leaf rustling ambience generator
     */
    initForestAmbience() {
        if (!this.ctx) return;
        const dur = 4.0;
        const bufferSize = this.ctx.sampleRate * dur;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0.0;
        // Pink / Brownian noise for wind
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            data[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = data[i];
            data[i] *= 3.5;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(450, this.ctx.currentTime);

        // Wind swell LFO
        const lfo = this.ctx.createOscillator();
        lfo.frequency.setValueAtTime(0.15, this.ctx.currentTime);
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.setValueAtTime(200, this.ctx.currentTime);
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);

        this.ambienceGain = this.ctx.createGain();
        this.ambienceGain.gain.setValueAtTime(0.12, this.ctx.currentTime);

        noise.connect(filter);
        filter.connect(this.ambienceGain);
        this.ambienceGain.connect(this.masterGain);

        noise.start();
        lfo.start();
    }

    /**
     * Procedural bird chirp sound for forest immersion
     */
    playProceduralBirdChirp() {
        if (this.playBuffer('birds', { volume: 0.45, duration: 3.5, offset: Math.random() * 25.0 })) return;
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';

        // Bird tweet pitch modulation
        const baseFreq = 2600 + Math.random() * 1200;
        osc.frequency.setValueAtTime(baseFreq, t);
        osc.frequency.linearRampToValueAtTime(baseFreq + 700, t + 0.07);
        osc.frequency.linearRampToValueAtTime(baseFreq - 300, t + 0.14);
        osc.frequency.linearRampToValueAtTime(baseFreq + 500, t + 0.22);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.035, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

        // Soft spatial pan
        const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
        if (panner) {
            panner.pan.setValueAtTime((Math.random() - 0.5) * 1.6, t);
            osc.connect(gain);
            gain.connect(panner);
            panner.connect(this.masterGain);
        } else {
            osc.connect(gain);
            gain.connect(this.masterGain);
        }

        osc.start(t);
        osc.stop(t + 0.26);
    }

    /**
     * Level Complete / Victory Fanfare
     */
    playVictoryFanfare() {
        if (!this.ctx) return;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        const t = this.ctx.currentTime;
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, t + idx * 0.14);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.001, t + idx * 0.14);
            gain.gain.linearRampToValueAtTime(0.25, t + idx * 0.14 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.14 + 0.45);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(t + idx * 0.14);
            osc.stop(t + idx * 0.14 + 0.46);
        });
    }

    /**
     * Mechanical flashlight toggle click sound
     */
    playFlashlightClick() {
        if (!this.ctx || this.isMuted) return;
        if (this.playBuffer('click', { volume: 0.85, playbackRate: 1.0 })) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const oscGain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(1200, t);
            osc.frequency.exponentialRampToValueAtTime(280, t + 0.035);

            oscGain.gain.setValueAtTime(0.35, t);
            oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

            osc.connect(oscGain);
            oscGain.connect(this.masterGain);

            osc.start(t);
            osc.stop(t + 0.038);
        } catch (e) {}
    }

    /**
     * Player damage impact grunt / sharp sting hit sound
     */
    playPlayerHurt() {
        if (!this.ctx || this.isMuted) return;
        if (this.playBuffer('hurt', { volume: 1.0, playbackRate: 0.95 + Math.random() * 0.15 })) return;
        try {
            const t = this.ctx.currentTime;
            // 1. Heavy visceral thud
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, t);
            osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);

            gain.gain.setValueAtTime(0.7, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(t);
            osc.stop(t + 0.22);

            // 2. High-pitch stinging snap
            const snap = this.ctx.createOscillator();
            const snapGain = this.ctx.createGain();
            snap.type = 'triangle';
            snap.frequency.setValueAtTime(1800, t);
            snap.frequency.exponentialRampToValueAtTime(320, t + 0.09);

            snapGain.gain.setValueAtTime(0.45, t);
            snapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

            snap.connect(snapGain);
            snapGain.connect(this.masterGain);
            snap.start(t);
            snap.stop(t + 0.1);
        } catch (e) {}
    }

    /**
     * Angry Fly aggressive swoop and sting bite sound
     */
    playFlyAttackSting() {
        if (!this.ctx || this.isMuted) return;
        this.resume();
        try {
            const t = this.ctx.currentTime;
            // Aggressive screeching dive buzz
            const buzz = this.ctx.createOscillator();
            const buzzGain = this.ctx.createGain();
            buzz.type = 'sawtooth';
            buzz.frequency.setValueAtTime(540, t);
            buzz.frequency.linearRampToValueAtTime(780, t + 0.08);
            buzz.frequency.linearRampToValueAtTime(320, t + 0.18);

            buzzGain.gain.setValueAtTime(0.5, t);
            buzzGain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

            buzz.connect(buzzGain);
            buzzGain.connect(this.masterGain);
            buzz.start(t);
            buzz.stop(t + 0.22);
        } catch (e) {}
    }

    /**
     * Dramatic player death sound (low brass chord, flatline pulse)
     */
    playPlayerDeath() {
        if (!this.ctx || this.isMuted) return;
        const d = this.playBuffer('death', { volume: 0.95 });
        const e = this.playBuffer('explosion', { volume: 0.6, playbackRate: 0.5 });
        if (d || e) return;
        try {
            const t = this.ctx.currentTime;
            const chords = [130.8, 103.8, 87.3, 65.4]; // C3, G#2, F2, C2 (Dark dramatic minor drop)
            chords.forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, t + idx * 0.12);
                osc.frequency.exponentialRampToValueAtTime(freq * 0.7, t + idx * 0.12 + 1.2);

                gain.gain.setValueAtTime(0.001, t + idx * 0.12);
                gain.gain.linearRampToValueAtTime(0.4, t + idx * 0.12 + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.12 + 1.4);

                const filter = this.ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(800, t);
                filter.frequency.linearRampToValueAtTime(120, t + 1.5);

                osc.connect(filter);
                filter.connect(gain);
                gain.connect(this.masterGain);

                osc.start(t + idx * 0.12);
                osc.stop(t + idx * 0.12 + 1.5);
            });
        } catch (e) {}
    }

    /**
     * Spell 1: Summon Lightning - Electric discharge and crackling thunder
     */
    playLightningSpell() {
        if (!this.ctx || this.isMuted) return;
        const el = this.playBuffer('electric', { volume: 0.9 });
        const th = this.playBuffer('thunder', { volume: 0.8, playbackRate: 1.25 });
        if (el || th) return;
        try {
            const t = this.ctx.currentTime;
            const crackle = this.ctx.createOscillator();
            const crackleGain = this.ctx.createGain();
            crackle.type = 'sawtooth';
            crackle.frequency.setValueAtTime(2400, t);
            crackle.frequency.exponentialRampToValueAtTime(140, t + 0.12);

            crackleGain.gain.setValueAtTime(0.8, t);
            crackleGain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

            crackle.connect(crackleGain);
            crackleGain.connect(this.masterGain);
            crackle.start(t);
            crackle.stop(t + 0.16);

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(120, t + 0.05);
            osc.frequency.exponentialRampToValueAtTime(30, t + 0.7);

            gain.gain.setValueAtTime(0.01, t + 0.05);
            gain.gain.linearRampToValueAtTime(0.9, t + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);

            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(t + 0.05);
            osc.stop(t + 0.9);
        } catch (e) {}
    }

    /**
     * Spell 2: Fireball Throw - Whoosh release and fiery detonation
     */
    playFireballSpell() {
        if (!this.ctx || this.isMuted) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(380, t);
            osc.frequency.linearRampToValueAtTime(750, t + 0.12);
            osc.frequency.exponentialRampToValueAtTime(80, t + 0.55);

            gain.gain.setValueAtTime(0.7, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(1200, t);
            filter.frequency.exponentialRampToValueAtTime(220, t + 0.6);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.masterGain);

            osc.start(t);
            osc.stop(t + 0.62);
        } catch (e) {}
    }

    /**
     * Spell 3: Smoke Confuse - Hissing cloud emission
     */
    playSmokeSpell() {
        if (!this.ctx || this.isMuted) return;
        try {
            const t = this.ctx.currentTime;
            const dur = 0.5;
            const bufSize = Math.floor(this.ctx.sampleRate * dur);
            const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buf;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1800, t);
            filter.frequency.exponentialRampToValueAtTime(600, t + dur);
            filter.Q.value = 2.5;

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.01, t);
            gain.gain.linearRampToValueAtTime(0.5, t + 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.masterGain);

            noise.start(t);
            noise.stop(t + dur);
        } catch (e) {}
    }

    /**
     * Spell 4: Echo Attack - Ultrasonic sonar resonance pulse
     */
    playEchoSpell() {
        if (!this.ctx || this.isMuted) return;
        try {
            const t = this.ctx.currentTime;
            [1400, 1100, 850].forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, t + idx * 0.1);
                osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + idx * 0.1 + 0.35);

                gain.gain.setValueAtTime(0.4, t + idx * 0.1);
                gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.1 + 0.35);

                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(t + idx * 0.1);
                osc.stop(t + idx * 0.1 + 0.38);
            });
        } catch (e) {}
    }

    /**
     * Spell 5: Earth Crust - Seismic subterranean eruption and rock impact
     */
    playEarthCrustSpell() {
        if (!this.ctx || this.isMuted) return;
        try {
            const t = this.ctx.currentTime;
            const sub = this.ctx.createOscillator();
            const subGain = this.ctx.createGain();
            sub.type = 'triangle';
            sub.frequency.setValueAtTime(65, t);
            sub.frequency.linearRampToValueAtTime(40, t + 0.4);
            sub.frequency.exponentialRampToValueAtTime(22, t + 0.9);

            subGain.gain.setValueAtTime(0.85, t);
            subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.95);

            sub.connect(subGain);
            subGain.connect(this.masterGain);
            sub.start(t);
            sub.stop(t + 1.0);

            const crack = this.ctx.createOscillator();
            const crackGain = this.ctx.createGain();
            crack.type = 'sawtooth';
            crack.frequency.setValueAtTime(260, t);
            crack.frequency.exponentialRampToValueAtTime(55, t + 0.25);

            crackGain.gain.setValueAtTime(0.65, t);
            crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

            crack.connect(crackGain);
            crackGain.connect(this.masterGain);
            crack.start(t);
            crack.stop(t + 0.32);
        } catch (e) {}
    }

    /**
     * Start continuous ambient rainfall sound loop
     * Uses authentic recorded storm downpour when loaded, with procedural filter fallback
     */
    startRainAmbient() {
        if (!this.ctx) {
            this.init();
        }
        if (!this.ctx) return;
        this.resume();
        if (this.rainSource) {
            this.stopRainAmbient();
        }

        const realRain = this.playBuffer('rain', { volume: 0.38, loop: true });
        if (realRain) {
            this.rainSource = realRain.source;
            this.rainGain = realRain.gain;
            return;
        }

        try {
            // Generate 4-second looping pink noise buffer for realistic rain sound
            const bufferSize = this.ctx.sampleRate * 4.0;
            const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const output = noiseBuffer.getChannelData(0);
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
                b6 = white * 0.115926;
            }

            const source = this.ctx.createBufferSource();
            source.buffer = noiseBuffer;
            source.loop = true;

            // Lowpass filter shaped to sound like natural downpour
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(2400, this.ctx.currentTime);

            const rainGain = this.ctx.createGain();
            const t = this.ctx.currentTime;
            rainGain.gain.setValueAtTime(0.001, t);
            rainGain.gain.linearRampToValueAtTime(0.14, t + 1.2);

            source.connect(filter);
            filter.connect(rainGain);
            rainGain.connect(this.masterGain);

            source.start(t);
            this.rainSource = source;
            this.rainGain = rainGain;
        } catch (e) {
            console.warn("Rain ambient audio error:", e);
        }
    }

    /**
     * Stop ambient rainfall audio with smooth fade out
     */
    stopRainAmbient() {
        if (!this.ctx || !this.rainGain) return;
        try {
            const t = this.ctx.currentTime;
            this.rainGain.gain.linearRampToValueAtTime(0.001, t + 0.6);
            if (this.rainSource) {
                const src = this.rainSource;
                setTimeout(() => {
                    try { src.stop(); } catch (err) {}
                }, 650);
            }
        } catch (e) {}
        this.rainSource = null;
        this.rainGain = null;
    }

    /**
     * Atmospheric Thunder Clap & Sub-Bass Rolling Rumble
     * Uses authentic recorded thunderclap when loaded, with procedural shockwave fallback
     */
    playThunderClap() {
        if (!this.ctx) {
            this.init();
        }
        if (!this.ctx) return;
        this.resume();

        if (this.playBuffer('thunder', { volume: 0.95, playbackRate: 0.95 + Math.random() * 0.1 })) return;

        try {
            const t = this.ctx.currentTime;

            // 1. Initial sharp acoustic lightning strike crack
            const crackLen = 0.32;
            const crackBuf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * crackLen), this.ctx.sampleRate);
            const crackData = crackBuf.getChannelData(0);
            for (let i = 0; i < crackData.length; i++) {
                crackData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.05));
            }
            const crackSource = this.ctx.createBufferSource();
            crackSource.buffer = crackBuf;

            const crackFilter = this.ctx.createBiquadFilter();
            crackFilter.type = 'bandpass';
            crackFilter.frequency.setValueAtTime(1250, t);
            crackFilter.Q.setValueAtTime(1.8, t);

            const crackGain = this.ctx.createGain();
            crackGain.gain.setValueAtTime(0.38, t);
            crackGain.gain.exponentialRampToValueAtTime(0.001, t + crackLen);

            crackSource.connect(crackFilter);
            crackFilter.connect(crackGain);
            crackGain.connect(this.masterGain);
            crackSource.start(t);

            // 2. Heavy low-frequency rolling thunder rumble (3.2 seconds)
            const rumbleLen = 3.4;
            const rumbleBuf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * rumbleLen), this.ctx.sampleRate);
            const rData = rumbleBuf.getChannelData(0);
            for (let i = 0; i < rData.length; i++) {
                rData[i] = (Math.random() * 2 - 1);
            }
            const rumbleSource = this.ctx.createBufferSource();
            rumbleSource.buffer = rumbleBuf;

            const rumbleFilter = this.ctx.createBiquadFilter();
            rumbleFilter.type = 'lowpass';
            rumbleFilter.frequency.setValueAtTime(180, t);
            rumbleFilter.frequency.exponentialRampToValueAtTime(40, t + rumbleLen);

            const rumbleGain = this.ctx.createGain();
            rumbleGain.gain.setValueAtTime(0.01, t);
            rumbleGain.gain.linearRampToValueAtTime(0.42, t + 0.15); // Dynamic swell
            rumbleGain.gain.linearRampToValueAtTime(0.30, t + 0.9);
            rumbleGain.gain.exponentialRampToValueAtTime(0.001, t + rumbleLen);

            // 3. Sub-bass resonant sine wave punch (sub-harmonic shockwave)
            const subOsc = this.ctx.createOscillator();
            subOsc.type = 'sine';
            subOsc.frequency.setValueAtTime(68, t);
            subOsc.frequency.exponentialRampToValueAtTime(30, t + 1.8);

            const subGain = this.ctx.createGain();
            subGain.gain.setValueAtTime(0.01, t);
            subGain.gain.linearRampToValueAtTime(0.35, t + 0.08);
            subGain.gain.exponentialRampToValueAtTime(0.001, t + 1.9);

            subOsc.connect(subGain);
            subGain.connect(this.masterGain);
            subOsc.start(t);
            subOsc.stop(t + 1.95);

            rumbleSource.connect(rumbleFilter);
            rumbleFilter.connect(rumbleGain);
            rumbleGain.connect(this.masterGain);
            rumbleSource.start(t);
            rumbleSource.stop(t + rumbleLen);
        } catch (e) {
            console.warn("Thunder clap audio error:", e);
        }
    }
}

// Global sound system instance
const soundSystem = new SoundSystem();
window.soundSystem = soundSystem;

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        soundSystem.init();
    });
}
