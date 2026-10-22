/**
 * FlyBrain.js
 * Scientifically grounded computational model of the Drosophila melanogaster (fruit fly)
 * escape and navigation neural circuit.
 *
 * Modeled Neurons & Brain Regions:
 * 1. LC4 / LPLC2 (Lobula Columnar Neurons): Visual looming detectors sensitive to angular size & expansion rate.
 * 2. Giant Fiber (GF): Bilateral descending master escape command neurons.
 * 3. TTM (Tergotrochanteral Motor Neuron): Jump muscle actuator (explosive launch reflex).
 * 4. DLM (Dorsal Longitudinal Muscle Neurons): Flight power wing depressors.
 * 5. LPTC (Lobula Plate Tangential Cells - HS/VS): Wide-field optic flow motion detectors (yaw/pitch stabilization).
 * 6. Central Complex (EB/FB/PB): Ring attractor heading compass & exploratory foraging saccades.
 */

class FlyBrain {
    constructor(flyId = 1, options = {}) {
        this.id = flyId;

        // Neural membrane parameters (in millivolts and milliseconds)
        this.V_rest = -70.0;       // Resting potential (mV)
        this.V_thresh = options.threshold || -48.0; // Spike threshold (mV)
        this.V_peak = 30.0;        // Action potential peak (mV)
        this.V_hyper = -78.0;      // Hyperpolarization floor (mV)
        this.tau_m = 18.0;         // Membrane time constant (ms)
        this.refractoryTime = 0;   // Remaining refractory period (ms)
        this.refractoryDuration = options.refractory || 90; // ms

        // Current membrane voltages
        this.V_GF = this.V_rest;   // Giant Fiber potential
        this.spikeHistory = [];    // For oscilloscope visualizer
        this.maxHistory = 100;

        // Visual Looming Neurons (LC4 / LPLC2)
        this.lc4_activation = 0.0;   // Looming activation [0.0 - 1.0]
        this.lplc2_activation = 0.0; // Rapid expansion detector [0.0 - 1.0]
        this.prevAngularSize = 0.0;  // Previous frame theta

        // Central Complex (Compass / Heading)
        this.heading = Math.random() * Math.PI * 2;
        this.targetHeading = this.heading;
        this.timeSinceSaccade = 0;
        this.nextSaccadeInterval = 1.0 + Math.random() * 2.0; // seconds

        // Optic Flow (HS & VS Neurons)
        this.hs_yawRate = 0.0;       // Horizontal system
        this.vs_pitchRate = 0.0;     // Vertical system

        // Thoracic Motor Outputs
        this.ttm_firing = false;     // Jump leg extension
        this.dlm_power = 0.6;        // Baseline wing power (0.0 - 1.0)
        this.wingFrequency = 180;    // Hz (150-240 Hz range)
        
        // Escape State Machine
        this.isEscaping = false;
        this.escapeTimer = 0;
        this.escapeVector = new THREE.Vector3();
        this.lastSpikeTime = -999;

        // Difficulty & Unpredictability Multipliers
        this.sensitivity = options.sensitivity || 1.0;   // Multiplies looming current
        this.dodgeAgility = options.dodgeAgility || 1.0; // Evasive burst multiplier
        this.chaosFactor = options.chaosFactor || 1.0;   // Saccade frequency & erratic maneuvers
        this.verticalJink = 0;
    }

    /**
     * Updates the computational neural circuit for a single physics frame
     * @param {number} dt Delta time in seconds
     * @param {THREE.Vector3} flyPos Current position of the fly
     * @param {THREE.Vector3} threatPos Position of the incoming threat (player/weapon/projectile)
     * @param {THREE.Vector3} threatVel Velocity vector of the threat
     * @param {number} threatRadius Physical radius of the threat in meters
     * @param {Array} obstacles Nearby forest tree positions for collision avoidance
     */
    update(dt, flyPos, threatPos, threatVel, threatRadius, obstacles = []) {
        const dt_ms = dt * 1000.0;

        // -------------------------------------------------------------
        // 1. VISUAL SYSTEM: LC4 & LPLC2 Looming Computation
        // -------------------------------------------------------------
        const toThreat = new THREE.Vector3().subVectors(threatPos, flyPos);
        const distance = Math.max(0.2, toThreat.length());
        
        // Compute angular size (theta) in radians
        // theta = 2 * arctan(radius / distance)
        const angularSize = 2.0 * Math.atan((threatRadius || 0.4) / (2.0 * distance));
        
        // Compute expansion rate (d_theta / dt)
        const deltaTheta = (angularSize - this.prevAngularSize) / Math.max(0.001, dt);
        this.prevAngularSize = angularSize;

        // Relative approach velocity towards fly
        const relVel = threatVel ? threatVel.clone() : new THREE.Vector3();
        const approachSpeed = -relVel.dot(toThreat.clone().normalize());

        // Looming stimulus is strong when object is expanding AND approaching
        const loomingSignal = Math.max(0, deltaTheta) * (approachSpeed > 0 ? (1.0 + approachSpeed * 0.15) : 0.4);
        
        // Receptive field: fly has compound eye coverage (~330 deg). Blind cone right behind/underneath abdomen
        // Let's compute angle between fly forward orientation and threat direction
        const flyForward = new THREE.Vector3(Math.cos(this.heading), 0, Math.sin(this.heading));
        const dirToThreat = toThreat.clone().normalize();
        const dotFront = flyForward.dot(dirToThreat); // 1 = in front, -1 = directly behind

        // Flies have higher visual acuity in front/lateral fields, lower in posterior blind spot
        const visualGain = (dotFront > -0.7) ? 1.0 : 0.25;

        // LC4 (integrates angular size and approach)
        this.lc4_activation = Math.min(1.0, Math.max(0.0, (angularSize * 1.5 + loomingSignal * 0.8) * this.sensitivity * visualGain));
        
        // LPLC2 (high sensitivity to rapid non-linear angular acceleration)
        this.lplc2_activation = Math.min(1.0, Math.max(0.0, Math.max(0, deltaTheta) * 0.7 * this.sensitivity * visualGain));

        // Synaptic current injected into Giant Fiber (pA)
        // Strong non-linear threshold response typical of looming escape circuits
        const I_looming = (this.lc4_activation * 28.0 + Math.pow(this.lplc2_activation, 2) * 55.0);

        // -------------------------------------------------------------
        // 2. GIANT FIBER (GF) LEAKY INTEGRATE-AND-FIRE DYNAMICS
        // -------------------------------------------------------------
        let spikedThisFrame = false;

        if (this.refractoryTime > 0) {
            this.refractoryTime -= dt_ms;
            // Hyperpolarization recovery
            this.V_GF += (this.V_rest - this.V_GF) * (dt_ms / (this.tau_m * 0.6));
        } else {
            // Membrane potential integration: dV/dt = -(V - V_rest)/tau + I_synaptic + noise
            const noise = (Math.random() - 0.5) * 1.5;
            const dV = (-(this.V_GF - this.V_rest) / this.tau_m + I_looming * 0.4 + noise) * dt_ms;
            this.V_GF += dV;

            // Check if Giant Fiber fires Action Potential
            if (this.V_GF >= this.V_thresh) {
                // SPIKE!
                this.V_GF = this.V_peak;
                this.refractoryTime = this.refractoryDuration;
                spikedThisFrame = true;
                this.lastSpikeTime = performance.now();
                this.onGiantFiberSpike(flyPos, threatPos, approachSpeed);
            }
        }

        // Keep V_GF within physiological bounds
        this.V_GF = Math.max(this.V_hyper, Math.min(this.V_peak, this.V_GF));

        // Record history for HUD Oscilloscope
        this.spikeHistory.push(this.V_GF);
        if (this.spikeHistory.length > this.maxHistory) {
            this.spikeHistory.shift();
        }

        // -------------------------------------------------------------
        // 3. CENTRAL COMPLEX & UNPREDICTABLE SACCADES
        // -------------------------------------------------------------
        this.timeSinceSaccade += dt;
        if (!this.isEscaping && this.timeSinceSaccade >= this.nextSaccadeInterval) {
            // Saccade turn angle scales with chaos factor (unpredictable zigzags)
            const saccadeSpread = 1.1 + 0.45 * Math.min(2.5, this.chaosFactor);
            const saccadeAngle = (Math.random() - 0.5) * Math.PI * saccadeSpread;
            this.targetHeading = (this.heading + saccadeAngle) % (Math.PI * 2);
            this.verticalJink = (Math.random() - 0.5) * 3.8 * Math.min(2.5, this.chaosFactor);
            this.timeSinceSaccade = 0;
            this.nextSaccadeInterval = Math.max(0.18, (0.7 + Math.random() * 1.5) / this.chaosFactor);
        }

        // -------------------------------------------------------------
        // 4. LPTC (Optic Flow) & Obstacle Avoidance (Trees/Terrain)
        // -------------------------------------------------------------
        // Steer away from nearby obstacles like tree trunks
        let avoidX = 0, avoidZ = 0;
        for (let i = 0; i < obstacles.length; i++) {
            const obs = obstacles[i];
            const triggerDist = obs.radius + 1.8;
            const dx = flyPos.x - obs.position.x;
            if (dx > triggerDist || dx < -triggerDist) continue;
            const dz = flyPos.z - obs.position.z;
            if (dz > triggerDist || dz < -triggerDist) continue;
            const distSq = dx * dx + dz * dz;
            if (distSq < triggerDist * triggerDist && distSq > 0.0001) {
                const dist = Math.sqrt(distSq);
                const strength = (triggerDist - dist) * 2.5 / dist;
                avoidX += dx * strength;
                avoidZ += dz * strength;
            }
        }
        const obstacleAvoidanceForce = { x: avoidX, z: avoidZ, lengthSq: () => avoidX * avoidX + avoidZ * avoidZ };

        // Smooth heading towards target or away from obstacles
        if (obstacleAvoidanceForce.lengthSq() > 0.01) {
            const avoidHeading = Math.atan2(obstacleAvoidanceForce.z, obstacleAvoidanceForce.x);
            if (Number.isFinite(avoidHeading)) {
                this.targetHeading = avoidHeading;
            }
        }

        // Safe angle normalization (Zero loops, zero freeze risk!)
        let rawDiff = (this.targetHeading - this.heading);
        let angleDiff = Number.isFinite(rawDiff) ? Math.atan2(Math.sin(rawDiff), Math.cos(rawDiff)) : 0;
        const turnSpeed = this.isEscaping ? 12.0 : 4.0;
        this.heading = (this.heading + angleDiff * Math.min(1.0, turnSpeed * dt));
        if (!Number.isFinite(this.heading)) this.heading = 0;
        this.hs_yawRate = angleDiff * turnSpeed;

        // -------------------------------------------------------------
        // 5. ESCAPE DYNAMICS & MOTOR OUTPUT (TTM / DLM)
        // -------------------------------------------------------------
        if (this.isEscaping) {
            this.escapeTimer -= dt;
            if (this.escapeTimer <= 0) {
                this.isEscaping = false;
                this.ttm_firing = false;
                this.dlm_power = 0.65;
                this.wingFrequency = 185;
            } else {
                // TTM jump burst decays, DLM wings operate at maximum overdrive
                this.dlm_power = 1.0;
                this.wingFrequency = 230 + Math.random() * 15;
            }
        }

        return {
            spiked: spikedThisFrame,
            V_GF: this.V_GF,
            lc4: this.lc4_activation,
            lplc2: this.lplc2_activation,
            heading: this.heading,
            isEscaping: this.isEscaping,
            escapeVector: this.escapeVector.clone(),
            wingFrequency: this.wingFrequency,
            dlm_power: this.dlm_power,
            ttm_firing: this.ttm_firing
        };
    }

    /**
     * Triggered when Giant Fiber crosses firing threshold
     * Coordinates bilateral TTM leg thrust and DLM wing depressors
     * Evades and flees AWAY from looming threat / player
     */
    onGiantFiberSpike(flyPos, threatPos, approachSpeed) {
        this.isEscaping = true;
        this.escapeTimer = 0.35; // 350ms high-G emergency escape burst
        this.ttm_firing = true;

        // Vector pointing directly AWAY from looming threat / player
        let away = new THREE.Vector3().subVectors(flyPos, threatPos);
        const distFromThreat = away.length();
        if (distFromThreat < 0.001) away.set((Math.random() - 0.5), 0, (Math.random() - 0.5));
        away.y = 0;
        away.normalize();
        
        // Random lateral orthogonal vector for evasive jinking around obstacles
        const up = new THREE.Vector3(0, 1, 0);
        let lateral = new THREE.Vector3().crossVectors(away, up).normalize();
        if (Math.random() < 0.5) lateral.negate();

        // Upward burst (TTM leg jump thrust)
        const verticalBias = 0.35 + Math.random() * 0.30;

        // Strong escape impulse directly AWAY from threat (85%) + lateral jink (45%)
        const awayWeight = 0.85;
        const lateralWeight = 0.45;

        this.escapeVector = away.multiplyScalar(awayWeight)
            .add(lateral.multiplyScalar(lateralWeight))
            .add(up.multiplyScalar(verticalBias))
            .normalize();

        // High agility Drosophila escape burst speed
        const burstSpeed = Math.min(18.0, 9.0 * this.dodgeAgility);
        this.escapeVector.multiplyScalar(burstSpeed);

        // Turn heading to face escape trajectory away from player
        this.targetHeading = Math.atan2(this.escapeVector.z, this.escapeVector.x);
    }

    /**
     * Get live telemetry data for HUD display
     */
    getTelemetry() {
        return {
            membraneVoltage: this.V_GF,
            threshold: this.V_thresh,
            lc4: this.lc4_activation,
            lplc2: this.lplc2_activation,
            isEscaping: this.isEscaping,
            ttmActive: this.ttm_firing,
            dlmPower: this.dlm_power,
            wingFrequency: this.wingFrequency,
            history: this.spikeHistory,
            lastSpikeAge: (performance.now() - this.lastSpikeTime) / 1000.0
        };
    }
}
