/**
 * NeuralHUD.js
 * Real-Time Fly Connectome & Action Potential Oscilloscope Visualizer.
 * Renders the Drosophila melanogaster escape neural circuit:
 * - LC4 / LPLC2 Visual Looming Columnar Neurons
 * - Central Complex Ring Attractor Heading Compass
 * - Giant Fiber (GF) Descending Command Axon
 * - TTM (Tergotrochanteral Motor Neuron) Leg Jump Reflex
 * - DLM (Dorsal Longitudinal Flight Muscles)
 * - HS/VS Optic Flow Stabilization
 */

class NeuralHUD {
    constructor() {
        this.canvas = document.getElementById('neuralCanvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

        // Oscilloscope canvas
        this.oscCanvas = document.getElementById('oscCanvas');
        this.oscCtx = this.oscCanvas ? this.oscCanvas.getContext('2d') : null;

        // HUD DOM Elements
        this.vmElem = document.getElementById('hudVoltage');
        this.lc4Elem = document.getElementById('hudLC4');
        this.statusElem = document.getElementById('hudEscapeStatus');
        this.freqElem = document.getElementById('hudWingFreq');
        this.ttmElem = document.getElementById('hudTTM');

        this.pulsePhase = 0;
        this.redrawTimer = 0;
        this._lastStatus = '';

        // Pre-render static background grid once to an offscreen canvas
        if (this.canvas) {
            this.gridCache = document.createElement('canvas');
            this.gridCache.width = this.canvas.width;
            this.gridCache.height = this.canvas.height;
            const gCtx = this.gridCache.getContext('2d');
            gCtx.strokeStyle = 'rgba(0, 255, 180, 0.08)';
            gCtx.lineWidth = 1;
            gCtx.beginPath();
            for (let x = 0; x < this.gridCache.width; x += 20) {
                gCtx.moveTo(x, 0);
                gCtx.lineTo(x, this.gridCache.height);
            }
            for (let y = 0; y < this.gridCache.height; y += 20) {
                gCtx.moveTo(0, y);
                gCtx.lineTo(this.gridCache.width, y);
            }
            gCtx.stroke();
        }
    }

    update(activeFly, dt) {
        this.pulsePhase += dt * 5.0;
        this.redrawTimer += dt;
        // Throttle 2D HUD canvas redraws to 20 FPS (every 50ms) to free up main-thread frame budget
        if (this.redrawTimer < 0.05) return;
        this.redrawTimer = 0;
        if (!activeFly || !activeFly.isAlive || !activeFly.brain) {
            this.clearHUD();
            return;
        }

        const telem = activeFly.brain.getTelemetry();
        // 1. Update DOM telemetry readouts
        if (this.vmElem) {
            this.vmElem.textContent = `${telem.membraneVoltage.toFixed(1)} mV`;
            this.vmElem.style.color = telem.membraneVoltage > telem.threshold ? '#ff3344' : 
                                     telem.membraneVoltage > -58 ? '#ffaa00' : '#00ffcc';
        }

        if (this.lc4Elem) {
            const pct = Math.round(telem.lc4 * 100);
            this.lc4Elem.textContent = `${pct}%`;
            this.lc4Elem.style.color = pct > 60 ? '#ff4444' : (pct > 25 ? '#ffaa00' : '#88ee88');
        }

        if (this.statusElem) {
            if (telem.lastSpikeAge < 0.25) {
                this.statusElem.textContent = "⚡ GF ACTION POTENTIAL!";
                this.statusElem.className = "status-badge spike";
            } else if (telem.isEscaping) {
                this.statusElem.textContent = "🚀 EVASIVE SACCADE";
                this.statusElem.className = "status-badge escape";
            } else if (telem.lc4 > 0.3) {
                this.statusElem.textContent = "⚠️ LOOMING THREAT DETECTED";
                this.statusElem.className = "status-badge warning";
            } else {
                this.statusElem.textContent = "🌿 FORAGING / CRUISING";
                this.statusElem.className = "status-badge normal";
            }
        }

        if (this.freqElem) {
            this.freqElem.textContent = `${Math.round(telem.wingFrequency)} Hz`;
        }

        if (this.ttmElem) {
            this.ttmElem.textContent = telem.ttmActive ? "FIRED (JUMP KICK)" : "ARMED (STANDBY)";
            this.ttmElem.style.color = telem.ttmActive ? "#ff3344" : "#00ffcc";
        }

        // 2. Render Connectome Circuit Canvas
        this.renderConnectome(telem, activeFly);

        // 3. Render Action Potential Oscilloscope
        this.renderOscilloscope(telem);
    }

    renderConnectome(telem, fly) {
        if (!this.ctx || !this.canvas) return;
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        // Blit pre-rendered background grid in 1 drawImage call
        if (this.gridCache) {
            ctx.drawImage(this.gridCache, 0, 0);
        }

        // Circuit Node Definitions
        // Diagram coordinates
        const cx = w * 0.5;
        const nodes = {
            leftEye: { x: cx - 65, y: 35, label: "Left Eye", type: "sensor" },
            rightEye: { x: cx + 65, y: 35, label: "Right Eye", type: "sensor" },
            lc4_L: { x: cx - 45, y: 70, label: "LC4 Looming", act: telem.lc4 },
            lc4_R: { x: cx + 45, y: 70, label: "LC4 Looming", act: telem.lc4 },
            cxCompass: { x: cx, y: 95, label: "Central Complex", heading: fly.brain.heading },
            gf: { x: cx, y: 145, label: "Giant Fiber (GF)", spike: telem.lastSpikeAge < 0.25, v: telem.membraneVoltage },
            ttm: { x: cx - 40, y: 195, label: "TTM (Leg Jump)", active: telem.ttmActive },
            dlm: { x: cx + 40, y: 195, label: "DLM (Wing Power)", power: telem.dlmPower }
        };

        // Draw Synaptic Connections (Wires)
        ctx.lineWidth = 2;

        // Eye -> LC4
        this.drawWire(nodes.leftEye, nodes.lc4_L, nodes.lc4_L.act > 0.2 ? '#ffaa00' : '#00aa88');
        this.drawWire(nodes.rightEye, nodes.lc4_R, nodes.lc4_R.act > 0.2 ? '#ffaa00' : '#00aa88');

        // LC4 -> Giant Fiber
        const gfWireColor = telem.membraneVoltage > -55 ? '#ff3344' : '#00ffcc';
        this.drawWire(nodes.lc4_L, nodes.gf, gfWireColor, telem.lc4 > 0.3);
        this.drawWire(nodes.lc4_R, nodes.gf, gfWireColor, telem.lc4 > 0.3);

        // Central Complex -> Giant Fiber / Motor
        this.drawWire(nodes.cxCompass, nodes.gf, '#00ffcc');

        // Giant Fiber -> TTM & DLM
        const motorWireColor = telem.isEscaping ? '#ff3344' : '#0099bb';
        this.drawWire(nodes.gf, nodes.ttm, motorWireColor, telem.isEscaping);
        this.drawWire(nodes.gf, nodes.dlm, motorWireColor, telem.isEscaping);

        // Draw Nodes
        // Eyes
        this.drawNode(nodes.leftEye.x, nodes.leftEye.y, 8, '#aa1122', 'Eye');
        this.drawNode(nodes.rightEye.x, nodes.rightEye.y, 8, '#aa1122', 'Eye');

        // LC4 Looming
        const lc4Color = telem.lc4 > 0.5 ? '#ff3300' : (telem.lc4 > 0.2 ? '#ffaa00' : '#22bb66');
        this.drawNode(nodes.lc4_L.x, nodes.lc4_L.y, 10, lc4Color, 'LC4');
        this.drawNode(nodes.lc4_R.x, nodes.lc4_R.y, 10, lc4Color, 'LC4');

        // Central Complex Ring Compass
        this.drawCompassNode(nodes.cxCompass.x, nodes.cxCompass.y, 13, fly.brain.heading);

        // Giant Fiber Command Neuron
        const gfColor = nodes.gf.spike ? '#ffffff' : (telem.membraneVoltage > -52 ? '#ff5500' : '#00ffee');
        const gfRadius = nodes.gf.spike ? 16 : 13;
        this.drawNode(nodes.gf.x, nodes.gf.y, gfRadius, gfColor, 'GF', true);

        // TTM & DLM
        this.drawNode(nodes.ttm.x, nodes.ttm.y, 9, telem.ttmActive ? '#ff0033' : '#0088cc', 'TTM');
        this.drawNode(nodes.dlm.x, nodes.dlm.y, 9, telem.isEscaping ? '#ff6600' : '#00cc88', 'DLM');
    }

    drawWire(p1, p2, color, isPulsing = false) {
        const ctx = this.ctx;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        if (isPulsing) {
            // Pulse dot traveling along axon
            const t = (this.pulsePhase % 1.0);
            const px = p1.x + (p2.x - p1.x) * t;
            const py = p1.y + (p2.y - p1.y) * t;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawNode(x, y, radius, color, label, glow = false) {
        const ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.restore();

        // Label
        ctx.fillStyle = '#ccffea';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y + radius + 11);
    }

    drawCompassNode(x, y, radius, heading) {
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Heading arrow (Central Complex compass needle)
        const needleX = x + Math.cos(heading) * (radius - 3);
        const needleY = y + Math.sin(heading) * (radius - 3);
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(needleX, needleY);
        ctx.stroke();

        ctx.restore();

        ctx.fillStyle = '#ccffea';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CX Compass', x, y + radius + 11);
    }

    renderOscilloscope(telem) {
        if (!this.oscCtx || !this.oscCanvas) return;
        const ctx = this.oscCtx;
        const w = this.oscCanvas.width;
        const h = this.oscCanvas.height;

        ctx.clearRect(0, 0, w, h);

        // Dark oscilloscope background
        ctx.fillStyle = '#061311';
        ctx.fillRect(0, 0, w, h);

        // Threshold dashed line (-48 mV)
        // Range: -80mV (bottom) to +30mV (top) -> total 110mV range
        const vMin = -80;
        const vMax = 35;
        const vRange = vMax - vMin;

        const getY = (mv) => h - ((mv - vMin) / vRange) * h;

        const threshY = getY(telem.threshold);
        ctx.strokeStyle = 'rgba(255, 60, 60, 0.65)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, threshY);
        ctx.lineTo(w, threshY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label threshold
        ctx.fillStyle = '#ff6666';
        ctx.font = '8px monospace';
        ctx.fillText(`THRES: ${telem.threshold.toFixed(0)}mV`, 4, threshY - 3);

        // Voltage Waveform Trace
        const hist = telem.history;
        if (!hist || hist.length < 2) return;

        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 2;
        ctx.beginPath();

        const stepX = w / (hist.length - 1);
        for (let i = 0; i < hist.length; i++) {
            const x = i * stepX;
            const y = getY(hist[i]);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    clearHUD() {
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        if (this.oscCtx && this.oscCanvas) {
            this.oscCtx.fillStyle = '#061311';
            this.oscCtx.fillRect(0, 0, this.oscCanvas.width, this.oscCanvas.height);
        }
        if (this.statusElem) {
            this.statusElem.textContent = "TARGET DOWN";
            this.statusElem.className = "status-badge normal";
        }
    }
}
