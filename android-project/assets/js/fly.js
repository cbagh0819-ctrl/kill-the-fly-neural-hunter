/**
 * Fly.js
 * 3D Fly Entity for "KILL THE FLY".
 * Features high-detail procedural anatomical mesh (compound eyes, segmented thorax/abdomen,
 * 6 articulating legs, translucent flapping wings, halteres), flight aerodynamics,
 * neural brain link, landing/perching behavior, and death splat particle system.
 */

class Fly {
    constructor(scene, id = 1, options = {}) {
        this.scene = scene;
        this.id = id;
        this.isAlive = true;

        // Neural computational brain
        this.brain = new FlyBrain(id, options);

        // Physics & Motion State
        this.position = new THREE.Vector3(
            (Math.random() - 0.5) * 16,
            2.0 + Math.random() * 2.5,
            (Math.random() - 0.5) * 16
        );
        this.velocity = new THREE.Vector3();
        this.acceleration = new THREE.Vector3();
        this.flyScale = options.scale || 0.70; // Larger, more visible fly mesh
        this.maxSpeed = options.maxSpeed || 8.5; // m/s
        this.hoverSpeed = options.hoverSpeed || 3.4;

        // Red Angry Fly combat & attack state
        this.isAngry = Boolean(options.isAngry);
        this.rage = options.rage || 0;
        this.attackDamage = options.attackDamage || 10;
        this.diveSpeed = options.diveSpeed || 13.5;
        this.stalkTimeScale = options.stalkTimeScale || 1;
        this.attackCooldownDuration = options.attackCooldown || 1.6;
        this.attackRange = 2.2; // Swept collision radius for fast dives
        this.attackCooldown = 0.0;
        this.attackState = 'STALK'; // 'STALK', 'DIVE', 'RECOIL'
        this.stalkTimer = (0.8 + Math.random() * 1.5) * this.stalkTimeScale;
        this.recoilTimer = 0.0;
        this.diveDuration = 0.0;
        this.diveTarget = new THREE.Vector3();

        // Visual roll & pitch banking angles
        this.bankRoll = 0.0;
        this.pitch = 0.0;
        this.wingFlapPhase = 0.0;

        // Landing & Perching behavior
        this.isPerched = false;
        this.perchTimer = 0;
        this.timeSincePerch = 0;

        // Fly Mesh Construction
        this.mesh = this.buildFlyMesh();
        this.mesh.position.copy(this.position);
        this.scene.add(this.mesh);

        // Bounding hit radius for collision/weapons (generous sweet spot)
        this.hitRadius = Math.max(0.68, 0.95 * this.flyScale);
    }

    /**
     * Authentic Drosophila melanogaster abdominal tergite pigmentation texture.
     * Features warm honey-amber base with 5 transverse dark melanin bands
     * and a characteristic dark posterior tip (NO bee stinger!).
     */
    createDrosophilaAbdomenTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Warm Drosophila honey-amber base chitin
        const bgGrad = ctx.createLinearGradient(0, 0, 0, 128);
        bgGrad.addColorStop(0, '#d8a968');
        bgGrad.addColorStop(0.5, '#c59352');
        bgGrad.addColorStop(1, '#ab793e');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, 128, 128);

        // Drosophila melanogaster 5 abdominal segments with dark posterior melanin stripes
        const segments = [
            { y: 14, h: 7, alpha: 0.55 },
            { y: 34, h: 9, alpha: 0.70 },
            { y: 56, h: 12, alpha: 0.85 },
            { y: 78, h: 15, alpha: 0.95 },
            { y: 100, h: 28, alpha: 1.00 } // Distinct posterior dark melanin cap
        ];

        segments.forEach(seg => {
            const grad = ctx.createLinearGradient(0, seg.y, 0, seg.y + seg.h);
            grad.addColorStop(0, `rgba(45, 28, 16, ${seg.alpha * 0.8})`);
            grad.addColorStop(0.5, `rgba(20, 12, 7, ${seg.alpha})`);
            grad.addColorStop(1, `rgba(35, 20, 12, ${seg.alpha * 0.9})`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, seg.y, 128, seg.h);

            // Fine intersegmental membrane line
            ctx.fillStyle = 'rgba(235, 195, 140, 0.4)';
            ctx.fillRect(0, seg.y - 2, 128, 2);
        });

        // Fine sensory microchaetae dots across tergites
        ctx.fillStyle = 'rgba(25, 15, 8, 0.4)';
        for (let i = 0; i < 40; i++) {
            const bx = Math.random() * 128;
            const by = Math.random() * 128;
            ctx.fillRect(bx, by, 1, 2);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        return texture;
    }

    /**
     * Clear hyaline Drosophila wing texture with biological venation
     * (costa margin, radial branches, medial vein, crossveins)
     */
    createDrosophilaWingTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, 128, 256);

        // Delicate hyaline iridescence tint
        const grad = ctx.createLinearGradient(0, 0, 128, 256);
        grad.addColorStop(0, 'rgba(235, 245, 255, 0.25)');
        grad.addColorStop(0.5, 'rgba(245, 235, 255, 0.18)');
        grad.addColorStop(1, 'rgba(235, 255, 245, 0.25)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 256);

        // Costa & Subcosta along anterior wing margin
        ctx.strokeStyle = 'rgba(65, 45, 30, 0.8)';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(30, 240);
        ctx.quadraticCurveTo(15, 120, 35, 20);
        ctx.quadraticCurveTo(65, 8, 95, 25);
        ctx.stroke();

        // Longitudinal veins (R1, R2+3, R4+5, M1)
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = 'rgba(80, 55, 38, 0.6)';
        
        // R1
        ctx.beginPath();
        ctx.moveTo(35, 220);
        ctx.quadraticCurveTo(28, 140, 42, 70);
        ctx.stroke();

        // R2+3
        ctx.beginPath();
        ctx.moveTo(35, 220);
        ctx.quadraticCurveTo(38, 110, 68, 30);
        ctx.stroke();

        // R4+5
        ctx.beginPath();
        ctx.moveTo(40, 210);
        ctx.quadraticCurveTo(50, 120, 88, 55);
        ctx.stroke();

        // M1
        ctx.beginPath();
        ctx.moveTo(45, 190);
        ctx.quadraticCurveTo(65, 130, 95, 105);
        ctx.stroke();

        // Crossveins
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(46, 115);
        ctx.lineTo(58, 122);
        ctx.moveTo(60, 145);
        ctx.lineTo(76, 155);
        ctx.stroke();

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    static getSharedAssets(instance) {
        if (!Fly._sharedAssets) {
            const abTex = instance.createDrosophilaAbdomenTexture();
            const wingTex = instance.createDrosophilaWingTexture();

            // Create radial red threat glow sprite texture (replaces expensive PointLights!)
            const auraCanvas = document.createElement('canvas');
            auraCanvas.width = 64;
            auraCanvas.height = 64;
            const aCtx = auraCanvas.getContext('2d');
            const aGrad = aCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
            aGrad.addColorStop(0, 'rgba(255, 25, 50, 0.70)');
            aGrad.addColorStop(0.45, 'rgba(255, 10, 30, 0.28)');
            aGrad.addColorStop(1.0, 'rgba(255, 0, 20, 0.0)');
            aCtx.fillStyle = aGrad;
            aCtx.fillRect(0, 0, 64, 64);
            const auraTex = new THREE.CanvasTexture(auraCanvas);

            const makeMats = (angry) => ({
                eyeMat: new THREE.MeshStandardMaterial({
                    color: angry ? 0xff002b : 0xd42626,
                    roughness: 0.12,
                    metalness: 0.4,
                    emissive: angry ? 0xff0033 : 0x350404,
                    emissiveIntensity: angry ? 1.6 : 0.25
                }),
                thoraxMat: new THREE.MeshStandardMaterial({
                    color: angry ? 0x6e1018 : 0x9b6b3d,
                    roughness: angry ? 0.42 : 0.65,
                    metalness: angry ? 0.35 : 0.18,
                    emissive: angry ? 0x33050a : 0x000000
                }),
                drosophilaAbdomenMat: new THREE.MeshStandardMaterial({
                    map: abTex,
                    color: angry ? 0xff3b48 : 0xffffff,
                    roughness: 0.45,
                    metalness: 0.15,
                    emissive: angry ? 0x45060c : 0x000000
                }),
                legMat: new THREE.MeshStandardMaterial({
                    color: angry ? 0x3a080d : 0x5a402a,
                    roughness: 0.7
                }),
                wingMat: new THREE.MeshStandardMaterial({
                    map: wingTex,
                    color: angry ? 0xff7785 : 0xffffff,
                    roughness: 0.1,
                    metalness: 0.2,
                    transparent: true,
                    opacity: angry ? 0.75 : 0.65,
                    side: THREE.DoubleSide,
                    depthWrite: false
                }),
                haltereMat: new THREE.MeshStandardMaterial({
                    color: angry ? 0xff4455 : 0xdfcb9f,
                    roughness: 0.4
                })
            });

            Fly._sharedAssets = {
                normal: makeMats(false),
                angry: makeMats(true),
                auraMat: new THREE.SpriteMaterial({
                    map: auraTex,
                    transparent: true,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                })
            };
        }
        return Fly._sharedAssets;
    }

    buildFlyMesh() {
        const root = new THREE.Group();
        const shared = Fly.getSharedAssets(this);
        const mats = this.isAngry ? shared.angry : shared.normal;
        const { eyeMat, thoraxMat, drosophilaAbdomenMat, legMat, wingMat, haltereMat } = mats;

        // 2. Thorax (Brownish-tan Scutum)
        const thoraxGeo = new THREE.SphereGeometry(0.35, 10, 10);
        thoraxGeo.scale(1.0, 0.9, 1.3);
        const thorax = new THREE.Mesh(thoraxGeo, thoraxMat);
        thorax.castShadow = true;
        root.add(thorax);

        // 3. Head & Compound Eyes
        const headGroup = new THREE.Group();
        headGroup.position.set(0, 0.05, 0.45);

        const headBase = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), thoraxMat);
        headGroup.add(headBase);

        // Left & Right Iconic Brick-Red Faceted Ommatidia Eyes
        const eyeGeo = new THREE.SphereGeometry(0.17, 10, 10);
        eyeGeo.scale(0.85, 1.25, 1.1);

        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(0.15, 0.06, 0.08);
        leftEye.rotation.set(-0.2, 0.3, -0.2);
        headGroup.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(-0.15, 0.06, 0.08);
        rightEye.rotation.set(-0.2, -0.3, 0.2);
        headGroup.add(rightEye);

        // Feathery Dipteran Aristae Antennae
        const antGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.18, 4);
        const leftAnt = new THREE.Mesh(antGeo, legMat);
        leftAnt.position.set(0.06, 0.15, 0.18);
        leftAnt.rotation.set(0.6, 0.2, -0.3);
        headGroup.add(leftAnt);

        const rightAnt = new THREE.Mesh(antGeo, legMat);
        rightAnt.position.set(-0.06, 0.15, 0.18);
        rightAnt.rotation.set(0.6, -0.2, 0.3);
        headGroup.add(rightAnt);

        // Arista branching setae
        for (let b = 0; b < 3; b++) {
            const barbGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.08, 3);
            const leftBarb = new THREE.Mesh(barbGeo, legMat);
            leftBarb.position.set(0.08 + b * 0.02, 0.18 + b * 0.02, 0.22);
            leftBarb.rotation.z = -0.8;
            headGroup.add(leftBarb);

            const rightBarb = new THREE.Mesh(barbGeo, legMat);
            rightBarb.position.set(-0.08 - b * 0.02, 0.18 + b * 0.02, 0.22);
            rightBarb.rotation.z = 0.8;
            headGroup.add(rightBarb);
        }

        // Proboscis mouthparts underneath
        const probGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.14, 5);
        const prob = new THREE.Mesh(probGeo, legMat);
        prob.position.set(0, -0.16, 0.05);
        prob.rotation.x = -0.4;
        headGroup.add(prob);

        root.add(headGroup);

        // 4. Authentic Drosophila Abdomen (Natural rounded tip, NO stinger!)
        const abGroup = new THREE.Group();
        abGroup.position.set(0, -0.05, -0.45);
        const abGeo = new THREE.SphereGeometry(0.37, 12, 12);
        abGeo.scale(0.86, 0.80, 1.55);
        const abdomen = new THREE.Mesh(abGeo, drosophilaAbdomenMat);
        abdomen.castShadow = true;
        abGroup.add(abdomen);

        root.add(abGroup);
        this.abdomenGroup = abGroup;

        // 5. Dipteran Halteres (Oscillating balance organs behind wings)
        this.halteres = [];
        const haltereGeo = new THREE.CylinderGeometry(0.008, 0.01, 0.12, 4);
        const knobGeo = new THREE.SphereGeometry(0.028, 6, 6);

        [-1, 1].forEach(side => {
            const hGroup = new THREE.Group();
            hGroup.position.set(side * 0.18, 0.12, -0.22);
            const stalk = new THREE.Mesh(haltereGeo, haltereMat);
            stalk.rotation.z = side * 0.6;
            const knob = new THREE.Mesh(knobGeo, haltereMat);
            knob.position.set(side * 0.06, 0.08, 0);
            hGroup.add(stalk);
            hGroup.add(knob);
            root.add(hGroup);
            this.halteres.push(hGroup);
        });

        // 6. Six Articulating Legs
        const legOffsets = [
            { x: 0.22, y: -0.15, z: 0.2, rotZ: -0.6, rotY: 0.4 },   // Front right
            { x: -0.22, y: -0.15, z: 0.2, rotZ: 0.6, rotY: -0.4 },  // Front left
            { x: 0.25, y: -0.18, z: 0.0, rotZ: -0.8, rotY: 0.0 },   // Mid right
            { x: -0.25, y: -0.18, z: 0.0, rotZ: 0.8, rotY: 0.0 },  // Mid left
            { x: 0.22, y: -0.16, z: -0.2, rotZ: -0.7, rotY: -0.4 }, // Back right
            { x: -0.22, y: -0.16, z: -0.2, rotZ: 0.7, rotY: 0.4 }   // Back left
        ];

        this.legs = [];
        legOffsets.forEach(lo => {
            const leg = new THREE.Group();
            leg.position.set(lo.x, lo.y, lo.z);

            // Femur segment
            const femur = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 5), legMat);
            femur.position.y = -0.15;
            leg.add(femur);

            // Tibia segment
            const tibia = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.012, 0.38, 5), legMat);
            tibia.position.set(0, -0.32, 0.08);
            tibia.rotation.x = 0.5;
            leg.add(tibia);

            leg.rotation.z = lo.rotZ;
            leg.rotation.y = lo.rotY;
            root.add(leg);
            this.legs.push(leg);
        });

        // 7. Translucent Hyaline Wings
        this.leftWingPivot = new THREE.Group();
        this.leftWingPivot.position.set(0.18, 0.22, 0.02);

        this.rightWingPivot = new THREE.Group();
        this.rightWingPivot.position.set(-0.18, 0.22, 0.02);

        const wingGeo = new THREE.PlaneGeometry(0.35, 0.95);
        wingGeo.translate(0, 0, -0.45); // Pivot at wing hinge
        wingGeo.rotateX(Math.PI / 2);

        const leftWingMesh = new THREE.Mesh(wingGeo, wingMat);
        this.leftWingPivot.add(leftWingMesh);

        const rightWingMesh = new THREE.Mesh(wingGeo, wingMat);
        this.rightWingPivot.add(rightWingMesh);

        root.add(this.leftWingPivot);
        root.add(this.rightWingPivot);

        // Red Angry Fly Glowing Menacing Threat Aura (Zero-Lag Additive Sprite - avoids WebGL shader recompile stalls!)
        if (this.isAngry) {
            const shared = Fly.getSharedAssets(this);
            this.angryAura = new THREE.Sprite(shared.auraMat);
            const auraScale = 2.2 + this.rage * 0.8;
            this.angryAura.scale.set(auraScale, auraScale, 1.0);
            this.angryAura.position.set(0, 0.05, 0);
            root.add(this.angryAura);
            // Proxy object for compatibility with updateSwarmRage()
            this.angryLight = { intensity: 1.35 + this.rage * 1.1, distance: 4.2 + this.rage * 1.5 };
        }

        // Scale entire fly mesh
        root.scale.set(this.flyScale, this.flyScale, this.flyScale);
        return root;
    }

    /**
     * Updates physics, neural brain circuit, and wing flap animation
     * Real Drosophila behavior: roams across whole map, flees AWAY from player
     * Red Angry Fly: executes predator STALK -> DIVE -> STRIKE -> RECOIL attack cycle
     */
    update(dt, threatPos, threatVel, threatRadius, obstacles = [], terrainFunc = null, playerPos = null, onPlayerDamaged = null) {
        if (!this.isAlive) return;

        // 1. Run Drosophila Brain Model
        const brainOutput = this.brain.update(
            dt,
            this.position,
            threatPos,
            threatVel,
            threatRadius,
            obstacles
        );

        // Play neural spike feedback sound if GF action potential triggered
        if (brainOutput.spiked) {
            soundSystem.playNeuralSpike();
        }

        // 2. Flight & Steering Dynamics
        let distToPlayer = Infinity;
        const toPlayer = new THREE.Vector3();
        const awayFromPlayer = new THREE.Vector3();
        if (playerPos) {
            toPlayer.subVectors(playerPos, this.position);
            distToPlayer = toPlayer.length();
            if (distToPlayer > 0.001) {
                awayFromPlayer.set(-toPlayer.x / distToPlayer, 0, -toPlayer.z / distToPlayer);
            }
        }

        const previousX = this.position.x;
        const previousY = this.position.y;
        const previousZ = this.position.z;

        // A looming weapon must not interrupt an angry fly's attack cycle.
        if (brainOutput.isEscaping && !this.isAngry) {
            // Unperch immediately if escaping
            this.isPerched = false;
            this.perchTimer = 0;

            // Direct impulse from Giant Fiber escape vector (fleeing away from threat)
            this.velocity.copy(brainOutput.escapeVector);
        } else if (this.isAngry && playerPos) {
            // ============================================
            // RED ANGRY FLY AGGRESSIVE ATTACK AI
            // ============================================
            this.isPerched = false;
            this.attackCooldown = Math.max(0, this.attackCooldown - dt);

            if (this.attackState === 'STALK') {
                this.stalkTimer -= dt;
                // Circle menacingly around player (radius ~6m) at player eye height
                const circleAngle = this.wingFlapPhase * 0.45 + this.id * 1.6;
                const stalkDist = 6.2;
                const targetPos = new THREE.Vector3(
                    playerPos.x + Math.cos(circleAngle) * stalkDist,
                    playerPos.y + 0.6 + Math.sin(this.wingFlapPhase * 0.5) * 0.45,
                    playerPos.z + Math.sin(circleAngle) * stalkDist
                );
                const toStalk = targetPos.sub(this.position);
                const stalkSpeed = this.hoverSpeed * 1.5;
                this.velocity.lerp(toStalk.normalize().multiplyScalar(stalkSpeed), 4.5 * dt);

                // Dive attack trigger
                if (this.stalkTimer <= 0 && this.attackCooldown <= 0) {
                    this.attackState = 'DIVE';
                    this.diveDuration = 0;
                    this.diveTarget.copy(playerPos);
                    soundSystem.playFlyAttackSting();
                }
            } else if (this.attackState === 'DIVE') {
                this.diveDuration += dt;
                // High-speed aggressive dive-bomb straight at player's head
                const diveDir = playerPos.clone().sub(this.position).normalize();
                this.velocity.lerp(diveDir.multiplyScalar(this.diveSpeed), 9.0 * dt);

                // Sting collision and dive timeout are resolved after movement below.
            } else if (this.attackState === 'RECOIL') {
                this.recoilTimer -= dt;
                // Recoil: bank steeply upward and away from player
                const recoilTarget = awayFromPlayer.clone().multiplyScalar(this.hoverSpeed * 1.8);
                recoilTarget.y = 4.0;
                this.velocity.lerp(recoilTarget, 6.0 * dt);

                if (this.recoilTimer <= 0) {
                    this.attackState = 'STALK';
                    this.stalkTimer = (0.9 + Math.random() * 1.4) * this.stalkTimeScale;
                }
            }

            // Central complex visual alignment
            brainOutput.heading = Math.atan2(this.velocity.z, this.velocity.x);
        } else {
            // Normal roaming / foraging flight ("MOVES IN WHOLE MAP", "MOVES HERE AND THEIR")
            const speed = this.isPerched ? 0 : this.hoverSpeed;
            const targetVel = new THREE.Vector3(
                Math.cos(brainOutput.heading) * speed,
                Math.sin(this.wingFlapPhase * 0.3) * 0.4 + (brainOutput.verticalJink || 0),
                Math.sin(brainOutput.heading) * speed
            );

            // ACTIVE PREDATOR EVASION: If player approaches within 14m, FLEE AWAY!
            if (playerPos && distToPlayer < 14.0) {
                this.isPerched = false;
                // The closer the player gets, the faster the Drosophila runs away into the woods!
                const fleeUrgency = Math.pow((14.0 - distToPlayer) / 14.0, 1.25);
                const fleeSpeed = (this.hoverSpeed * 1.4) + fleeUrgency * (this.maxSpeed * 0.85);

                // Add strong repulsive velocity AWAY from player
                targetVel.add(awayFromPlayer.clone().multiplyScalar(fleeSpeed));

                // Erratic vertical evasive dodging when player gets very close (< 5.5m)
                if (distToPlayer < 5.5) {
                    targetVel.y += Math.sin(this.wingFlapPhase * 0.8) * 2.5;
                }
            }

            // Map boundary containment: smoothly steer back inside if near outer forest boundary (radius 68m)
            const distFromCenter = Math.hypot(this.position.x, this.position.z);
            if (distFromCenter > 66.0) {
                const pullIn = new THREE.Vector3(-this.position.x, 0, -this.position.z).normalize();
                const boundaryForce = (distFromCenter - 66.0) * 2.8;
                targetVel.add(pullIn.multiplyScalar(boundaryForce));
            }

            // Central complex acceleration: responsive evasive turns
            const accelRate = (distToPlayer < 10.0) ? 6.5 : 3.5;
            this.velocity.lerp(targetVel, accelRate * dt);
        }

        // Apply movement
        this.position.addScaledVector(this.velocity, dt);

        // Hard arena boundary clamp at map perimeter (74m)
        const distFromCenter = Math.hypot(this.position.x, this.position.z);
        if (distFromCenter > 74.0) {
            const ratio = 74.0 / distFromCenter;
            this.position.x *= ratio;
            this.position.z *= ratio;
            const vRad = (this.velocity.x * this.position.x + this.velocity.z * this.position.z) / 74.0;
            if (vRad > 0) {
                this.velocity.x -= vRad * (this.position.x / 74.0) * 1.5;
                this.velocity.z -= vRad * (this.position.z / 74.0) * 1.5;
            }
        }

        // Tree trunk & obstacle collision avoidance for flies (with fast AABB pre-rejection)
        for (let i = 0; i < obstacles.length; i++) {
            const obs = obstacles[i];
            const obsRadius = obs.radius + 0.35;
            const odx = this.position.x - obs.position.x;
            if (odx > obsRadius || odx < -obsRadius) continue;
            const odz = this.position.z - obs.position.z;
            if (odz > obsRadius || odz < -obsRadius) continue;
            const odSq = odx * odx + odz * odz;
            if (odSq < obsRadius * obsRadius) {
                const od = Math.sqrt(odSq) || 0.001;
                const onx = odx / od;
                const onz = odz / od;
                this.position.x = obs.position.x + onx * (obsRadius + 0.02);
                this.position.z = obs.position.z + onz * (obsRadius + 0.02);
                const vn = this.velocity.x * onx + this.velocity.z * onz;
                if (vn < 0) {
                    this.velocity.x -= vn * onx;
                    this.velocity.z -= vn * onz;
                }
            }
        }

        // Terrain & forest canopy height limits
        let groundY = 0;
        if (terrainFunc) {
            groundY = terrainFunc(this.position.x, this.position.z);
        }
        const minFlyY = groundY + 0.70;
        const maxFlyY = groundY + 5.5; // Natural canopy cruising height throughout the forest

        if (this.position.y < minFlyY) {
            this.position.y = minFlyY;
            this.velocity.y = Math.abs(this.velocity.y) * 0.4 + 1.2;
        } else if (this.position.y > maxFlyY) {
            this.position.y = maxFlyY;
            this.velocity.y = -Math.abs(this.velocity.y) * 0.5 - 0.8;
        }

        // Sweep the complete dive segment so a fast fly cannot tunnel through the player.
        if (this.isAngry && playerPos && this.attackState === 'DIVE') {
            const dx = this.position.x - previousX;
            const dy = this.position.y - previousY;
            const dz = this.position.z - previousZ;
            const segmentLengthSq = dx * dx + dy * dy + dz * dz;
            const t = segmentLengthSq > 0
                ? THREE.MathUtils.clamp(
                    ((playerPos.x - previousX) * dx + (playerPos.y - previousY) * dy + (playerPos.z - previousZ) * dz) / segmentLengthSq,
                    0,
                    1
                )
                : 0;
            const hitX = previousX + dx * t - playerPos.x;
            const hitY = previousY + dy * t - playerPos.y;
            const hitZ = previousZ + dz * t - playerPos.z;

            if (hitX * hitX + hitY * hitY + hitZ * hitZ <= this.attackRange * this.attackRange) {
                if (onPlayerDamaged) onPlayerDamaged(this.attackDamage, this);
                this.attackCooldown = this.attackCooldownDuration;
                this.attackState = 'RECOIL';
                this.recoilTimer = 0.9;
            } else if (this.diveDuration > 1.8) {
                this.attackState = 'RECOIL';
                this.recoilTimer = 0.7;
            }
        }

        // 3. Banking & Mesh Rotation
        // Heading rotation
        this.mesh.position.copy(this.position);
        
        // Banking roll when turning (HS neuron integration)
        const targetRoll = -this.brain.hs_yawRate * 0.25;
        this.bankRoll += (targetRoll - this.bankRoll) * Math.min(1.0, 10.0 * dt);

        // Pitch based on vertical velocity
        const targetPitch = THREE.MathUtils.clamp(-this.velocity.y * 0.08, -0.5, 0.5);
        this.pitch += (targetPitch - this.pitch) * Math.min(1.0, 8.0 * dt);

        // Orientation
        this.mesh.rotation.order = 'YXZ';
        this.mesh.rotation.y = -brainOutput.heading + Math.PI / 2; // Three.js forward alignment
        this.mesh.rotation.x = this.pitch;
        this.mesh.rotation.z = this.bankRoll;

        // 4. High-Frequency Wing Flap Animation (~180-240 Hz)
        this.wingFlapPhase += dt * brainOutput.wingFrequency * Math.PI * 2;
        const wingFlapAngle = Math.sin(this.wingFlapPhase) * (brainOutput.isEscaping ? 0.95 : 0.65);
        
        this.leftWingPivot.rotation.z = wingFlapAngle;
        this.leftWingPivot.rotation.y = -0.3 + Math.cos(this.wingFlapPhase * 0.5) * 0.15;

        this.rightWingPivot.rotation.z = -wingFlapAngle;
        this.rightWingPivot.rotation.y = 0.3 - Math.cos(this.wingFlapPhase * 0.5) * 0.15;

        // Abdomen breathing animation
        if (this.abdomenGroup) {
            const abScale = 1.0 + Math.sin(this.wingFlapPhase * 0.1) * 0.05;
            this.abdomenGroup.scale.set(abScale, abScale, 1.0);
        }

        // Haltere anti-phase oscillation (Dipteran gyroscopes)
        if (this.halteres && this.halteres.length === 2) {
            const hAngle = -Math.sin(this.wingFlapPhase) * 0.45;
            this.halteres[0].rotation.x = hAngle;
            this.halteres[1].rotation.x = -hAngle;
        }

        // 5. Update 3D Spatial Audio Buzz
        soundSystem.updateFlyBuzz(this.id, this.position, brainOutput.wingFrequency, brainOutput.isEscaping);
    }

    /**
     * Trigger fly death: splat effect, particles, audio cutoff
     */
    kill(hitPoint, impulseVector) {
        if (!this.isAlive) return;
        this.isAlive = false;

        // Stop buzzing sound
        soundSystem.stopFlyBuzz(this.id);
        soundSystem.playFlySplat();

        // Remove angry point light if attached
        if (this.angryLight && this.angryLight.parent) {
            this.angryLight.parent.remove(this.angryLight);
        }

        // Spawn viscous bug splat particles
        this.spawnSplatParticles(this.position, impulseVector);

        // Remove mesh from scene
        this.scene.remove(this.mesh);
    }

    createSplat(pos) {
        this.kill(pos || this.position);
    }

    spawnSplatParticles(pos, impulse) {
        const particleCount = 45;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const velocities = [];

        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = pos.x;
            positions[i * 3 + 1] = pos.y;
            positions[i * 3 + 2] = pos.z;

            // Cone of viscous visceral splatter in hit direction
            const dir = (impulse ? impulse.clone().normalize() : new THREE.Vector3(0, 1, 0));
            dir.x += (Math.random() - 0.5) * 1.8;
            dir.y += (Math.random() - 0.5) * 1.8;
            dir.z += (Math.random() - 0.5) * 1.8;
            dir.normalize();

            const speed = 2.0 + Math.random() * 8.0;
            velocities.push(dir.multiplyScalar(speed));
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        // Green/yellow bug visceral hemolymph fluid
        const mat = new THREE.PointsMaterial({
            color: 0x98d415,
            size: 0.22,
            transparent: true,
            opacity: 1.0
        });

        const pSystem = new THREE.Points(geo, mat);
        this.scene.add(pSystem);

        // Animate particles falling to ground
        let elapsed = 0;
        const animateSplat = () => {
            elapsed += 0.016;
            const pArray = pSystem.geometry.attributes.position;
            for (let i = 0; i < particleCount; i++) {
                const idx = i * 3;
                velocities[i].y -= 9.8 * 0.016; // gravity
                pArray.setXYZ(
                    i,
                    pArray.getX(i) + velocities[i].x * 0.016,
                    Math.max(0.05, pArray.getY(i) + velocities[i].y * 0.016),
                    pArray.getZ(i) + velocities[i].z * 0.016
                );
            }
            pArray.needsUpdate = true;
            mat.opacity = Math.max(0, 1.0 - elapsed * 1.2);

            if (elapsed < 0.9) {
                requestAnimationFrame(animateSplat);
            } else {
                this.scene.remove(pSystem);
                geo.dispose();
                mat.dispose();
            }
        };
        requestAnimationFrame(animateSplat);
    }

    destroy() {
        soundSystem.stopFlyBuzz(this.id);
        if (this.angryLight && this.angryLight.parent) {
            this.angryLight.parent.remove(this.angryLight);
        }
        if (this.mesh && this.mesh.parent) {
            this.scene.remove(this.mesh);
        }
    }
}
