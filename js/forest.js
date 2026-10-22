/**
 * Forest.js
 * High-Fidelity Alpine Mountain Woodland Environment for "KILL THE FLY".
 * Features both DAY and NIGHT modes:
 * - DAY: Radiant golden alpine sun, blue Rayleigh scattering sky, distant ridges,
 *   colossal stratified rock monolith on the right, cut timber stumps, clovers & ferns.
 * - NIGHT (matching user reference photo): Atmospheric midnight indigo/violet tones,
 *   pale silvery moonlight filtering through dense night fog, weathered wooden shack/cabin
 *   with split-rail fence on the left, foreground marsh/pond reflecting moonlight,
 *   gnarled twisted dead tree snags, and headlamp/torch illumination.
 * - Seamless runtime switching between Day and Night via setTimeOfDay('day'|'night').
 * - 100% solid obstacle collision physics (trees, monolith, cabin, fence, stumps, rocks).
 */

class ForestEnvironment {
    constructor(scene) {
        this.scene = scene;
        this.currentMode = 'day'; // Default Day mode ('day', 'night', 'rain')
        this.previousMode = 'day';
        this.obstacles = [];
        this.particles = null;
        this.particleCount = 280;
        this.arenaRadius = 85;
        this.mistPlanes = [];

        // Rain & Storm System (Night + Rain + Lightning)
        this.rainMesh = null;
        // Rain is simulated on the CPU each frame; this still reads as a storm while
        // keeping terrain sampling and particle updates affordable on mid-range GPUs.
        this.rainCount = 900;
        this.rainVelocities = [];
        this.splashMesh = null;
        this.splashCount = 200;
        this.splashes = [];
        this.lightningLight = null;
        this.lightningTimer = 3.5 + Math.random() * 3.5;
        this.lightningFlashTime = 0.0;
        this.isLightningFlashing = false;
        this.skyLightningGroup = null;

        this.initLighting();
        this.createSky();
        this.createTerrain();
        this.createRockMonolith();
        this.createWoodenCabinAndFence();
        this.createForestPond();
        this.createGnarledDeadTrees();
        this.createDistantMountainRidges();
        this.generateTrees();
        this.generateTimberStumpsAndLogs();
        this.generateFoliageAndProps();
        this.createAtmosphericMist();
        this.createAtmosphericParticles();
        this.createRainSystem();
        this.createArenaBoundaries();
        this.mergeStaticGeometry();
    }

    /**
     * Merges all static environment meshes sharing the same material into unified
     * BufferGeometries, reducing scene draw calls from ~2,650 down to ~22!
     */
    mergeStaticGeometry() {
        this.scene.updateMatrixWorld(true);

        const dynamicSet = new Set([
            this.ground,
            this.skyDome,
            this.waterMesh,
            this.rainMesh,
            this.splashMesh,
            this.particles,
            this.sunSprite,
            this.moonSprite,
            ...this.mistPlanes
        ]);

        const matGroups = new Map();
        const meshesToRemove = [];

        this.scene.traverse(obj => {
            if (!obj.isMesh) return;
            if (dynamicSet.has(obj)) return;
            if (Array.isArray(obj.material) || !obj.material || !obj.geometry) return;

            const matId = obj.material.uuid;
            if (!matGroups.has(matId)) {
                matGroups.set(matId, { material: obj.material, meshes: [] });
            }
            matGroups.get(matId).meshes.push(obj);
            meshesToRemove.push(obj);
        });

        for (const [matId, group] of matGroups.entries()) {
            const meshes = group.meshes;
            if (meshes.length === 0) continue;

            const bakedGeos = [];
            let totalVerts = 0;
            let hasUV = true;

            for (let i = 0; i < meshes.length; i++) {
                const m = meshes[i];
                let g = m.geometry.clone();
                if (g.index) g = g.toNonIndexed();
                g.applyMatrix4(m.matrixWorld);
                if (!g.attributes.normal) g.computeVertexNormals();
                if (!g.attributes.uv) hasUV = false;
                totalVerts += g.attributes.position.count;
                bakedGeos.push(g);
            }

            const posArr = new Float32Array(totalVerts * 3);
            const normArr = new Float32Array(totalVerts * 3);
            const uvArr = hasUV ? new Float32Array(totalVerts * 2) : null;

            let vOffset = 0;
            for (let i = 0; i < bakedGeos.length; i++) {
                const g = bakedGeos[i];
                const count = g.attributes.position.count;
                posArr.set(g.attributes.position.array, vOffset * 3);
                normArr.set(g.attributes.normal.array, vOffset * 3);
                if (hasUV && g.attributes.uv) {
                    uvArr.set(g.attributes.uv.array, vOffset * 2);
                }
                vOffset += count;
                g.dispose();
            }

            const mergedGeo = new THREE.BufferGeometry();
            mergedGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
            mergedGeo.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
            if (hasUV && uvArr) {
                mergedGeo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
            }
            mergedGeo.computeBoundingSphere();

            const mergedMesh = new THREE.Mesh(mergedGeo, group.material);
            mergedMesh.matrixAutoUpdate = false;
            mergedMesh.updateMatrix();
            this.scene.add(mergedMesh);
        }

        // Remove original unbatched static meshes and empty groups
        for (let i = 0; i < meshesToRemove.length; i++) {
            const m = meshesToRemove[i];
            if (m.parent) m.parent.remove(m);
            if (m.geometry) m.geometry.dispose();
        }

        // Clean up empty THREE.Group containers left behind
        const emptyGroups = [];
        this.scene.traverse(obj => {
            if (obj !== this.scene && obj.type === 'Group' && obj.children.length === 0) {
                emptyGroups.push(obj);
            }
        });
        for (let i = 0; i < emptyGroups.length; i++) {
            if (emptyGroups[i].parent) emptyGroups[i].parent.remove(emptyGroups[i]);
        }

        // Freeze matrices on remaining static meshes
        if (this.ground) {
            this.ground.matrixAutoUpdate = false;
            this.ground.updateMatrix();
        }
    }

    initLighting() {
        // Ambient Hemisphere Light
        this.hemiLight = new THREE.HemisphereLight(0x9bd8ff, 0x3d3824, 1.10);
        this.hemiLight.position.set(0, 75, 0);
        this.scene.add(this.hemiLight);

        // Directional Sun / Moon Light
        this.sunLight = new THREE.DirectionalLight(0xfff7e2, 1.75);
        this.sunLight.position.set(40, 65, 25);
        this.scene.add(this.sunLight);

        // Secondary Soft Fill Light
        this.fillLight = new THREE.DirectionalLight(0x7fb8db, 0.45);
        this.fillLight.position.set(-45, 30, -35);
        this.scene.add(this.fillLight);

        // Dynamic Atmospheric Lightning Light (Rain & Storm mode)
        this.lightningLight = new THREE.DirectionalLight(0xd5eaff, 0);
        this.lightningLight.position.set(0, 85, 0);
        this.scene.add(this.lightningLight);

        // Scene Fog (soft daylight haze initially)
        this.scene.fog = new THREE.FogExp2(0x82b4cc, 0.0075);
    }

    createSky() {
        this.scene.background = new THREE.Color(0x4aa3db);

        // 1. Day Sky Texture
        const dayCanvas = document.createElement('canvas');
        dayCanvas.width = 16;
        dayCanvas.height = 256;
        const dCtx = dayCanvas.getContext('2d');
        const dGrad = dCtx.createLinearGradient(0, 0, 0, 256);
        dGrad.addColorStop(0, '#156ab6');    // Deep zenith alpine cerulean
        dGrad.addColorStop(0.35, '#358ece'); // Bright mountain blue
        dGrad.addColorStop(0.68, '#62b0dd'); // Mid-sky cyan
        dGrad.addColorStop(0.88, '#98cee8'); // Pale horizon haze
        dGrad.addColorStop(1.0, '#7eb9d4');  // Mountain ridge mist
        dCtx.fillStyle = dGrad;
        dCtx.fillRect(0, 0, 16, 256);
        this.daySkyTex = new THREE.CanvasTexture(dayCanvas);

        // 2. Night Sky Texture (matching user nocturnal reference photo)
        const nightCanvas = document.createElement('canvas');
        nightCanvas.width = 16;
        nightCanvas.height = 256;
        const nCtx = nightCanvas.getContext('2d');
        const nGrad = nCtx.createLinearGradient(0, 0, 0, 256);
        nGrad.addColorStop(0, '#060914');    // Pitch midnight zenith
        nGrad.addColorStop(0.35, '#10172c'); // Deep navy-indigo
        nGrad.addColorStop(0.70, '#1e243d'); // Nocturnal violet mist
        nGrad.addColorStop(0.90, '#2d334e'); // Pale misty moon glow
        nGrad.addColorStop(1.0, '#181e30');  // Mountain silhouette horizon
        nCtx.fillStyle = nGrad;
        nCtx.fillRect(0, 0, 16, 256);
        this.nightSkyTex = new THREE.CanvasTexture(nightCanvas);

        // 3. Rain & Thunderstorm Sky Texture (Ominous dark tempest)
        const rainCanvas = document.createElement('canvas');
        rainCanvas.width = 16;
        rainCanvas.height = 256;
        const rCtx = rainCanvas.getContext('2d');
        const rGrad = rCtx.createLinearGradient(0, 0, 0, 256);
        rGrad.addColorStop(0, '#03050a');    // Obsidian tempest zenith
        rGrad.addColorStop(0.35, '#090d18'); // Heavy storm cloud canopy
        rGrad.addColorStop(0.70, '#101524'); // Low-hanging rain front
        rGrad.addColorStop(0.90, '#161c2c'); // Distant electric mist
        rGrad.addColorStop(1.0, '#0a0e18');  // Dark mountain silhouettes
        rCtx.fillStyle = rGrad;
        rCtx.fillRect(0, 0, 16, 256);
        this.rainSkyTex = new THREE.CanvasTexture(rainCanvas);

        // Sky Dome
        const skyGeo = new THREE.SphereGeometry(180, 24, 16);
        this.skyMat = new THREE.MeshBasicMaterial({
            map: this.daySkyTex,
            side: THREE.BackSide,
            depthWrite: false
        });
        const skyDome = new THREE.Mesh(skyGeo, this.skyMat);
        this.skyDome = skyDome;
        this.scene.add(skyDome);

        // Sun Corona Sprite (Day)
        const sunCanvas = document.createElement('canvas');
        sunCanvas.width = 128;
        sunCanvas.height = 128;
        const sCtx = sunCanvas.getContext('2d');
        const sGrad = sCtx.createRadialGradient(64, 64, 4, 64, 64, 62);
        sGrad.addColorStop(0, 'rgba(255, 255, 245, 1.0)');
        sGrad.addColorStop(0.25, 'rgba(255, 242, 195, 0.85)');
        sGrad.addColorStop(0.55, 'rgba(255, 225, 155, 0.35)');
        sGrad.addColorStop(1.0, 'rgba(255, 225, 155, 0.0)');
        sCtx.fillStyle = sGrad;
        sCtx.fillRect(0, 0, 128, 128);

        const sunTex = new THREE.CanvasTexture(sunCanvas);
        this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: sunTex,
            transparent: true,
            blending: THREE.AdditiveBlending
        }));
        this.sunSprite.position.set(90, 126, 63);
        this.sunSprite.scale.set(42, 42, 1);
        this.scene.add(this.sunSprite);

        // Moon Corona Sprite (Night)
        const moonCanvas = document.createElement('canvas');
        moonCanvas.width = 128;
        moonCanvas.height = 128;
        const mCtx = moonCanvas.getContext('2d');
        const mGrad = mCtx.createRadialGradient(64, 64, 6, 64, 64, 58);
        mGrad.addColorStop(0, 'rgba(240, 246, 255, 1.0)');
        mGrad.addColorStop(0.25, 'rgba(200, 225, 255, 0.80)');
        mGrad.addColorStop(0.55, 'rgba(150, 190, 255, 0.28)');
        mGrad.addColorStop(1.0, 'rgba(120, 160, 255, 0.0)');
        mCtx.fillStyle = mGrad;
        mCtx.fillRect(0, 0, 128, 128);

        const moonTex = new THREE.CanvasTexture(moonCanvas);
        this.moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: moonTex,
            transparent: true,
            blending: THREE.AdditiveBlending
        }));
        this.moonSprite.position.set(-65, 125, -60);
        this.moonSprite.scale.set(36, 36, 1);
        this.moonSprite.visible = false;
        this.scene.add(this.moonSprite);
    }

    /**
     * Set Time of Day & Weather: 'day', 'night', or 'rain'
     */
    setTimeOfDay(mode) {
        if (mode === 'rain') {
            this.currentMode = 'rain';

            // NIGHT + RAIN + LIGHTNING (User Request)
            this.scene.background = new THREE.Color(0x04060d);
            this.scene.fog.color = new THREE.Color(0x090d18);
            this.scene.fog.density = 0.0175;

            // Deep brooding stormy indigo ambient
            this.hemiLight.color.setHex(0x131a2c);
            this.hemiLight.groundColor.setHex(0x05070e);
            this.hemiLight.intensity = 0.32;

            // Pale shrouded moonlight through tempest storm clouds
            this.sunLight.color.setHex(0x6a86ad);
            this.sunLight.intensity = 0.42;
            this.sunLight.position.set(-30, 65, -25);

            this.fillLight.color.setHex(0x0c1320);
            this.fillLight.intensity = 0.16;

            if (this.skyMat && this.rainSkyTex) {
                this.skyMat.map = this.rainSkyTex;
                this.skyMat.needsUpdate = true;
            }

            if (this.sunSprite) this.sunSprite.visible = false;
            if (this.moonSprite) this.moonSprite.visible = false;

            // Glistening wet puddle and lake water
            if (this.waterMat) {
                this.waterMat.color.setHex(0x070e18);
                this.waterMat.roughness = 0.03;
            }

            // Muddy drenched glossy ground reflecting wetness
            if (this.groundMat) {
                this.groundMat.roughness = 0.32;
                this.groundMat.needsUpdate = true;
            }

            // Activate rain particles
            if (this.rainMesh) this.rainMesh.visible = true;
            if (this.splashMesh) this.splashMesh.visible = true;

            this.lightningTimer = 2.0 + Math.random() * 2.5;
            this.isLightningFlashing = false;
            return;
        }

        // Cleanup rain/storm effects when switching to day or night
        if (this.rainMesh) this.rainMesh.visible = false;
        if (this.splashMesh) this.splashMesh.visible = false;
        if (this.lightningLight) this.lightningLight.intensity = 0;
        if (this.skyLightningGroup && this.skyLightningGroup.parent) {
            this.scene.remove(this.skyLightningGroup);
            this.skyLightningGroup = null;
        }
        if (this.groundMat) {
            this.groundMat.roughness = 0.82;
            this.groundMat.needsUpdate = true;
        }

        this.currentMode = (mode === 'night') ? 'night' : 'day';

        if (this.currentMode === 'night') {
            // Eerie nocturnal atmosphere matching user's night reference photo
            this.scene.background = new THREE.Color(0x0c101c);
            this.scene.fog.color = new THREE.Color(0x111628);
            this.scene.fog.density = 0.0125;

            // Deep indigo ambient moonlight
            this.hemiLight.color.setHex(0x1e2844);
            this.hemiLight.groundColor.setHex(0x080c14);
            this.hemiLight.intensity = 0.35;

            // Silvery-blue directional moonlight angled across the trees
            this.sunLight.color.setHex(0xa6cbff);
            this.sunLight.intensity = 0.80;
            this.sunLight.position.set(-35, 65, -30);

            this.fillLight.color.setHex(0x131a2c);
            this.fillLight.intensity = 0.20;

            // Night sky with mist
            if (this.skyMat && this.nightSkyTex) {
                this.skyMat.map = this.nightSkyTex;
                this.skyMat.needsUpdate = true;
            }

            if (this.sunSprite) this.sunSprite.visible = false;
            if (this.moonSprite) this.moonSprite.visible = true;

            // Glistening water under moonlight
            if (this.waterMat) {
                this.waterMat.color.setHex(0x0e1724);
                this.waterMat.roughness = 0.08;
            }
        } else {
            // Radiant sunny alpine mountain daylight (100% preserved day version)
            this.scene.background = new THREE.Color(0x4aa3db);
            this.scene.fog.color = new THREE.Color(0x82b4cc);
            this.scene.fog.density = 0.0075;

            this.hemiLight.color.setHex(0x9bd8ff);
            this.hemiLight.groundColor.setHex(0x3d3824);
            this.hemiLight.intensity = 1.10;

            this.sunLight.color.setHex(0xfff7e2);
            this.sunLight.intensity = 1.75;
            this.sunLight.position.set(40, 65, 25);

            this.fillLight.color.setHex(0x7fb8db);
            this.fillLight.intensity = 0.45;

            if (this.skyMat && this.daySkyTex) {
                this.skyMat.map = this.daySkyTex;
                this.skyMat.needsUpdate = true;
            }

            if (this.sunSprite) this.sunSprite.visible = true;
            if (this.moonSprite) this.moonSprite.visible = false;

            if (this.waterMat) {
                this.waterMat.color.setHex(0x182436);
                this.waterMat.roughness = 0.12;
            }
        }
    }

    toggleTimeOfDay() {
        if (this.currentMode === 'rain') {
            this.setTimeOfDay('day');
        } else {
            this.setTimeOfDay(this.currentMode === 'day' ? 'night' : 'day');
        }
        return this.currentMode;
    }

    toggleRain() {
        if (this.currentMode === 'rain') {
            const target = this.previousMode || 'night';
            this.setTimeOfDay(target);
        } else {
            this.previousMode = this.currentMode;
            this.setTimeOfDay('rain');
        }
        return this.currentMode;
    }

    /**
     * Create Dense 3D Rain Streaks & Ground Splash Particle System
     */
    createRainSystem() {
        const rainCount = this.rainCount;
        const positions = new Float32Array(rainCount * 2 * 3); // 2 vertices per line segment
        this.rainVelocities = [];

        for (let i = 0; i < rainCount; i++) {
            const x = (Math.random() - 0.5) * 80;
            const y = Math.random() * 32;
            const z = (Math.random() - 0.5) * 80;
            const len = 0.75 + Math.random() * 0.60;
            const speed = 28.0 + Math.random() * 10.0;
            const windX = -2.8;
            const windZ = 1.6;

            const idx = i * 6;
            positions[idx] = x;
            positions[idx + 1] = y;
            positions[idx + 2] = z;

            positions[idx + 3] = x + (windX * 0.022);
            positions[idx + 4] = y - len;
            positions[idx + 5] = z + (windZ * 0.022);

            this.rainVelocities.push({
                x: x,
                y: y,
                z: z,
                len: len,
                speed: speed,
                windX: windX,
                windZ: windZ
            });
        }

        const rainGeo = new THREE.BufferGeometry();
        rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const rainMat = new THREE.LineBasicMaterial({
            color: 0x98c5ed,
            transparent: true,
            opacity: 0.60,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.rainMesh = new THREE.LineSegments(rainGeo, rainMat);
        this.rainMesh.visible = false;
        this.scene.add(this.rainMesh);

        // Ground splash particle system
        const splashGeo = new THREE.BufferGeometry();
        const splashPos = new Float32Array(this.splashCount * 3);
        this.splashes = [];

        for (let i = 0; i < this.splashCount; i++) {
            splashPos[i * 3] = 0;
            splashPos[i * 3 + 1] = -50;
            splashPos[i * 3 + 2] = 0;
            this.splashes.push({
                x: 0,
                y: -50,
                z: 0,
                life: 0,
                maxLife: 0.22 + Math.random() * 0.18
            });
        }

        splashGeo.setAttribute('position', new THREE.BufferAttribute(splashPos, 3));
        const splashMat = new THREE.PointsMaterial({
            color: 0xa8d2ff,
            size: 0.32,
            transparent: true,
            opacity: 0.65,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.splashMesh = new THREE.Points(splashGeo, splashMat);
        this.splashMesh.visible = false;
        this.scene.add(this.splashMesh);
    }

    /**
     * Atmospheric Lightning Strike in Storm Clouds
     * Spawns multi-branch electric bolt geometry, strobing directional flash,
     * and triggers synchronized rolling procedural thunderclaps.
     */
    triggerAtmosphericLightning() {
        if (this.currentMode !== 'rain') return;

        this.isLightningFlashing = true;
        this.lightningFlashTime = 0.0;
        this.lightningTimer = 3.5 + Math.random() * 4.5;

        // Play procedural rolling thunder audio
        soundSystem.playThunderClap();

        // Remove old sky bolt
        if (this.skyLightningGroup && this.skyLightningGroup.parent) {
            this.scene.remove(this.skyLightningGroup);
            this.skyLightningGroup = null;
        }

        const boltGroup = new THREE.Group();
        const boltMat = new THREE.MeshBasicMaterial({
            color: 0xd8eeff,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending
        });

        const startAngle = Math.random() * Math.PI * 2;
        const startDist = 35.0 + Math.random() * 32.0;
        const startX = Math.cos(startAngle) * startDist;
        const startZ = Math.sin(startAngle) * startDist;
        const startY = 82.0 + Math.random() * 15.0;

        let cur = new THREE.Vector3(startX, startY, startZ);
        const targetPos = new THREE.Vector3(
            startX + (Math.random() - 0.5) * 36.0,
            startY - 38.0 - Math.random() * 22.0,
            startZ + (Math.random() - 0.5) * 36.0
        );

        const segments = 12;
        for (let s = 0; s < segments; s++) {
            const prog = (s + 1) / segments;
            const next = new THREE.Vector3(
                THREE.MathUtils.lerp(cur.x, targetPos.x, prog) + (Math.random() - 0.5) * 5.5,
                THREE.MathUtils.lerp(startY, targetPos.y, prog),
                THREE.MathUtils.lerp(cur.z, targetPos.z, prog) + (Math.random() - 0.5) * 5.5
            );
            if (s === segments - 1) next.copy(targetPos);

            const segVec = next.clone().sub(cur);
            const segLen = segVec.length();
            const cylGeo = new THREE.CylinderGeometry(0.38, 0.50, segLen, 5);
            cylGeo.translate(0, segLen / 2, 0);
            cylGeo.rotateX(Math.PI / 2);

            const segMesh = new THREE.Mesh(cylGeo, boltMat);
            segMesh.position.copy(cur);
            segMesh.lookAt(next);
            boltGroup.add(segMesh);

            // Sub-branch fork
            if (Math.random() < 0.40) {
                const forkVec = new THREE.Vector3(
                    (Math.random() - 0.5) * 9.0,
                    -4.0 - Math.random() * 6.0,
                    (Math.random() - 0.5) * 9.0
                );
                const forkEnd = next.clone().add(forkVec);
                const forkLen = forkVec.length();
                const forkGeo = new THREE.CylinderGeometry(0.18, 0.26, forkLen, 4);
                forkGeo.translate(0, forkLen / 2, 0);
                forkGeo.rotateX(Math.PI / 2);

                const forkMesh = new THREE.Mesh(forkGeo, boltMat);
                forkMesh.position.copy(next);
                forkMesh.lookAt(forkEnd);
                boltGroup.add(forkMesh);
            }

            cur.copy(next);
        }

        this.skyLightningGroup = boltGroup;
        this.scene.add(boltGroup);
    }

    /**
     * Animate Atmospheric Lightning Flash & Fog Illuminations
     */
    updateLightning(dt) {
        if (this.currentMode !== 'rain') return;

        this.lightningTimer -= dt;
        if (this.lightningTimer <= 0 && !this.isLightningFlashing) {
            this.triggerAtmosphericLightning();
        }

        if (this.isLightningFlashing) {
            this.lightningFlashTime += dt;
            const t = this.lightningFlashTime;

            let flashIntensity = 0;
            if (t < 0.045) {
                flashIntensity = (t / 0.045) * 5.0;
            } else if (t < 0.085) {
                flashIntensity = 1.6; // Strobe dip
            } else if (t < 0.16) {
                flashIntensity = 6.8; // Peak stroke
            } else if (t < 0.38) {
                const fade = 1.0 - (t - 0.16) / 0.22;
                flashIntensity = Math.max(0, fade * 6.8);
            } else {
                flashIntensity = 0;
                this.isLightningFlashing = false;
                if (this.skyLightningGroup) {
                    this.scene.remove(this.skyLightningGroup);
                    this.skyLightningGroup = null;
                }
            }

            if (this.lightningLight) {
                this.lightningLight.intensity = flashIntensity;
            }

            // Atmospheric fog flash reaction
            if (this.scene.fog) {
                if (flashIntensity > 0.8) {
                    this.scene.fog.color.setHex(0x283852);
                } else {
                    this.scene.fog.color.setHex(0x090d18);
                }
            }

            // Fade sky bolt
            if (this.skyLightningGroup) {
                const alpha = Math.max(0, 1.0 - (t / 0.35));
                this.skyLightningGroup.traverse(child => {
                    if (child.material) child.material.opacity = alpha;
                });
            }
        }
    }

    /**
     * Update Falling Rain Streaks Centered on Player
     */
    updateRain(dt, playerPos = new THREE.Vector3(0, 2, 0)) {
        if (!this.rainMesh || !this.rainMesh.visible) return;

        const posAttr = this.rainMesh.geometry.attributes.position;
        const positions = posAttr.array;
        const boxRadius = 40.0;
        let splashIdx = 0;

        for (let i = 0; i < this.rainCount; i++) {
            const drop = this.rainVelocities[i];
            drop.y -= drop.speed * dt;
            drop.x += drop.windX * dt;
            drop.z += drop.windZ * dt;

            // Drops above the player's near-ground band cannot hit terrain yet.
            // Avoid thousands of unnecessary trigonometric terrain samples per frame.
            const groundY = drop.y < playerPos.y + 6.0
                ? this.getTerrainHeight(drop.x, drop.z)
                : -Infinity;

            // Wrap rain around player's active position
            const dx = drop.x - playerPos.x;
            const dz = drop.z - playerPos.z;

            if (drop.y <= groundY || drop.y < playerPos.y - 4.0 || Math.abs(dx) > boxRadius || Math.abs(dz) > boxRadius) {
                // Trigger ground splash if close to player
                if (drop.y <= groundY + 0.5 && splashIdx < this.splashCount && Math.abs(dx) < 22 && Math.abs(dz) < 22) {
                    const sp = this.splashes[splashIdx];
                    sp.x = drop.x;
                    sp.y = groundY + 0.05;
                    sp.z = drop.z;
                    sp.life = sp.maxLife;
                    splashIdx++;
                }

                // Reset drop to top of rain box above player
                drop.x = playerPos.x + (Math.random() - 0.5) * (boxRadius * 2.0);
                drop.z = playerPos.z + (Math.random() - 0.5) * (boxRadius * 2.0);
                drop.y = playerPos.y + 16.0 + Math.random() * 14.0;
            }

            const idx = i * 6;
            positions[idx] = drop.x;
            positions[idx + 1] = drop.y;
            positions[idx + 2] = drop.z;
            positions[idx + 3] = drop.x + (drop.windX * 0.022);
            positions[idx + 4] = drop.y - drop.len;
            positions[idx + 5] = drop.z + (drop.windZ * 0.022);
        }
        posAttr.needsUpdate = true;

        // Update ground splashes
        if (this.splashMesh && this.splashMesh.visible) {
            const spAttr = this.splashMesh.geometry.attributes.position;
            const splashPositions = spAttr.array;
            for (let s = 0; s < this.splashCount; s++) {
                const sp = this.splashes[s];
                if (sp.life > 0) {
                    sp.life -= dt;
                    const idx = s * 3;
                    splashPositions[idx] = sp.x;
                    splashPositions[idx + 1] = sp.y;
                    splashPositions[idx + 2] = sp.z;
                } else {
                    const idx = s * 3;
                    splashPositions[idx] = 0;
                    splashPositions[idx + 1] = -50;
                    splashPositions[idx + 2] = 0;
                }
            }
            spAttr.needsUpdate = true;
        }
    }

    /**
     * Procedural 1024x1024 Alpine Ground Texture & Bump Map
     */
    generateGroundTextures() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        // Base mountain loam
        ctx.fillStyle = '#2b231a';
        ctx.fillRect(0, 0, 1024, 1024);

        // Moss & humus blotches
        for (let i = 0; i < 400; i++) {
            const cx = Math.random() * 1024;
            const cy = Math.random() * 1024;
            const r = 20 + Math.random() * 50;
            const radGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
            radGrad.addColorStop(0, 'rgba(58, 74, 34, 0.55)');
            radGrad.addColorStop(1, 'rgba(43, 35, 26, 0.0)');
            ctx.fillStyle = radGrad;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Clover & broadleaf carpet
        for (let i = 0; i < 3500; i++) {
            const x = Math.random() * 1024;
            const y = Math.random() * 1024;
            const s = 4 + Math.random() * 8;
            ctx.fillStyle = Math.random() > 0.5 ? '#3d7826' : '#2e5f1b';
            for (let l = 0; l < 3; l++) {
                const ang = (l / 3) * Math.PI * 2;
                ctx.beginPath();
                ctx.arc(x + Math.cos(ang) * (s * 0.6), y + Math.sin(ang) * (s * 0.6), s * 0.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Wild grass strokes
        for (let i = 0; i < 8000; i++) {
            const x = Math.random() * 1024;
            const y = Math.random() * 1024;
            const len = 6 + Math.random() * 10;
            const ang = -Math.PI / 2 + (Math.random() - 0.5) * 0.7;
            ctx.strokeStyle = Math.random() > 0.4 ? 'rgba(74, 133, 45, 0.75)' : 'rgba(92, 156, 56, 0.65)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
            ctx.stroke();
        }

        // Fallen pine needles & slate pebbles
        for (let i = 0; i < 2500; i++) {
            const x = Math.random() * 1024;
            const y = Math.random() * 1024;
            if (i % 2 === 0) {
                ctx.strokeStyle = 'rgba(122, 75, 42, 0.6)';
                ctx.lineWidth = 1.2;
                const ang = Math.random() * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + Math.cos(ang) * 8, y + Math.sin(ang) * 8);
                ctx.stroke();
            } else {
                ctx.fillStyle = 'rgba(105, 102, 95, 0.55)';
                ctx.fillRect(x, y, 2 + Math.random() * 4, 2 + Math.random() * 3);
            }
        }

        // Alpine meadow wildflowers (golden buttercups & white mountain blossoms)
        for (let i = 0; i < 450; i++) {
            const x = Math.random() * 1024;
            const y = Math.random() * 1024;
            ctx.fillStyle = (i % 3 === 0) ? '#f5ce38' : ((i % 3 === 1) ? '#ffffff' : '#e8f0a0');
            ctx.beginPath();
            ctx.arc(x, y, 1.5 + Math.random() * 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        const diffuseTex = new THREE.CanvasTexture(canvas);
        diffuseTex.wrapS = THREE.RepeatWrapping;
        diffuseTex.wrapT = THREE.RepeatWrapping;
        diffuseTex.repeat.set(18, 18);

        // Grayscale Bump Map
        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = 512;
        bumpCanvas.height = 512;
        const bCtx = bumpCanvas.getContext('2d');
        bCtx.fillStyle = '#808080';
        bCtx.fillRect(0, 0, 512, 512);

        for (let i = 0; i < 4000; i++) {
            const bx = Math.random() * 512;
            const by = Math.random() * 512;
            const br = Math.random() > 0.5 ? 255 : 40;
            bCtx.fillStyle = `rgba(${br}, ${br}, ${br}, 0.22)`;
            bCtx.fillRect(bx, by, 2 + Math.random() * 5, 2 + Math.random() * 5);
        }

        const bumpTex = new THREE.CanvasTexture(bumpCanvas);
        bumpTex.wrapS = THREE.RepeatWrapping;
        bumpTex.wrapT = THREE.RepeatWrapping;
        bumpTex.repeat.set(18, 18);

        return { diffuse: diffuseTex, bump: bumpTex };
    }

    createTerrain() {
        const size = 230;
        const segments = 90;
        const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
        geometry.rotateX(-Math.PI / 2);

        const pos = geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            const y = this.getTerrainHeight(x, z);
            pos.setY(i, y);
        }
        geometry.computeVertexNormals();

        const { diffuse, bump } = this.generateGroundTextures();

        const groundMat = new THREE.MeshStandardMaterial({
            map: diffuse,
            bumpMap: bump,
            bumpScale: 0.08,
            roughness: 0.82,
            metalness: 0.08
        });

        const groundMesh = new THREE.Mesh(geometry, groundMat);
        groundMesh.receiveShadow = true;
        this.scene.add(groundMesh);
        this.ground = groundMesh;
        this.groundMat = groundMat;
    }

    /**
     * Exact terrain height function at any (x, z) world coordinate
     */
    getTerrainHeight(x, z) {
        const distFromCenter = Math.sqrt(x * x + z * z);
        const perimeterFactor = Math.pow(Math.min(1.0, distFromCenter / 85.0), 2.2);

        let y = Math.sin(x * 0.045) * Math.cos(z * 0.045) * 1.1;
        y += Math.sin(x * 0.02 + 1.2) * Math.cos(z * 0.025) * 1.6;
        y += Math.sin(x * 0.08 + z * 0.06) * 0.45;
        y += perimeterFactor * (Math.sin(x * 0.07) * 2.8 + 4.5);
        return y;
    }

    /**
     * The Colossal Weathered Rock Monolith (Day Reference Hallmark on the Right)
     */
    createRockMonolith() {
        const monolithGroup = new THREE.Group();
        const monoX = 38;
        const monoZ = -14;
        const groundY = this.getTerrainHeight(monoX, monoZ);

        // Stratified Granite Rock Texture
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#615c52';
        ctx.fillRect(0, 0, 512, 512);

        for (let y = 0; y < 512; y += 24 + Math.random() * 16) {
            const h = 10 + Math.random() * 20;
            ctx.fillStyle = Math.random() > 0.5 ? '#736d62' : '#524e45';
            ctx.fillRect(0, y, 512, h);

            ctx.fillStyle = 'rgba(25, 23, 20, 0.7)';
            ctx.fillRect(0, y, 512, 3);
            ctx.fillStyle = 'rgba(150, 145, 130, 0.4)';
            ctx.fillRect(0, y + 3, 512, 1.5);
        }

        for (let i = 0; i < 40; i++) {
            const vx = Math.random() * 512;
            ctx.fillStyle = 'rgba(30, 27, 22, 0.35)';
            ctx.fillRect(vx, 0, 4 + Math.random() * 8, 512);
        }

        for (let i = 0; i < 150; i++) {
            const mx = Math.random() * 512;
            const my = Math.random() * 512;
            ctx.fillStyle = 'rgba(68, 88, 48, 0.45)';
            ctx.fillRect(mx, my, 8 + Math.random() * 18, 4 + Math.random() * 8);
        }

        const rockTex = new THREE.CanvasTexture(canvas);
        rockTex.wrapS = THREE.RepeatWrapping;
        rockTex.wrapT = THREE.RepeatWrapping;
        rockTex.repeat.set(2, 2);

        const rockMat = new THREE.MeshStandardMaterial({
            map: rockTex,
            roughness: 0.88,
            metalness: 0.12,
            flatShading: true
        });

        // 4-Tier Stratified Monolith Construction
        const tier1Blocks = [
            { x: 0, y: 3.5, z: 0, sx: 24, sy: 7.0, sz: 22, rotY: 0.1 },
            { x: -5, y: 3.0, z: 4, sx: 14, sy: 6.2, sz: 12, rotY: -0.25 },
            { x: 6, y: 3.2, z: -3, sx: 16, sy: 6.5, sz: 14, rotY: 0.3 }
        ];

        tier1Blocks.forEach(b => {
            const geo = new THREE.DodecahedronGeometry(1, 1);
            const m = new THREE.Mesh(geo, rockMat);
            m.position.set(b.x, b.y, b.z);
            m.scale.set(b.sx * 0.5, b.sy * 0.5, b.sz * 0.5);
            m.rotation.y = b.rotY;
            monolithGroup.add(m);
        });

        const tier2Blocks = [
            { x: -1, y: 9.5, z: 0, sx: 19, sy: 6.5, sz: 17, rotY: 0.15 },
            { x: 4, y: 9.2, z: 2, sx: 13, sy: 6.0, sz: 11, rotY: -0.2 },
            { x: -4, y: 8.8, z: -2, sx: 12, sy: 5.5, sz: 10, rotY: 0.4 }
        ];

        tier2Blocks.forEach(b => {
            const geo = new THREE.DodecahedronGeometry(1, 1);
            const m = new THREE.Mesh(geo, rockMat);
            m.position.set(b.x, b.y, b.z);
            m.scale.set(b.sx * 0.5, b.sy * 0.5, b.sz * 0.5);
            m.rotation.y = b.rotY;
            monolithGroup.add(m);
        });

        const tier3Blocks = [
            { x: 0, y: 15.0, z: -1, sx: 15, sy: 5.5, sz: 13, rotY: -0.1 },
            { x: -2, y: 14.8, z: 2, sx: 11, sy: 5.0, sz: 9, rotY: 0.25 }
        ];

        tier3Blocks.forEach(b => {
            const geo = new THREE.DodecahedronGeometry(1, 1);
            const m = new THREE.Mesh(geo, rockMat);
            m.position.set(b.x, b.y, b.z);
            m.scale.set(b.sx * 0.5, b.sy * 0.5, b.sz * 0.5);
            m.rotation.y = b.rotY;
            monolithGroup.add(m);
        });

        const summitGeo = new THREE.DodecahedronGeometry(5.2, 1);
        const summit = new THREE.Mesh(summitGeo, rockMat);
        summit.position.set(0, 18.5, 0);
        summit.scale.set(1.4, 0.75, 1.2);
        monolithGroup.add(summit);

        monolithGroup.scale.set(1.22, 1.25, 1.22);
        monolithGroup.position.set(monoX, groundY, monoZ);
        this.scene.add(monolithGroup);

        const monolithColliders = [
            { ox: 0, oz: 0, r: 12.0 },
            { ox: -7.5, oz: 5.0, r: 7.5 },
            { ox: 8.5, oz: -3.5, r: 8.2 },
            { ox: -5.0, oz: -6.0, r: 7.0 }
        ];

        monolithColliders.forEach(c => {
            this.obstacles.push({
                position: new THREE.Vector3(monoX + c.ox, groundY, monoZ + c.oz),
                radius: c.r
            });
        });

        // Base mist
        const mistCanvas = document.createElement('canvas');
        mistCanvas.width = 128;
        mistCanvas.height = 128;
        const mCtx = mistCanvas.getContext('2d');
        const mGrad = mCtx.createRadialGradient(64, 64, 8, 64, 64, 62);
        mGrad.addColorStop(0, 'rgba(235, 245, 255, 0.45)');
        mGrad.addColorStop(0.5, 'rgba(225, 240, 250, 0.22)');
        mGrad.addColorStop(1.0, 'rgba(215, 235, 245, 0.0)');
        mCtx.fillStyle = mGrad;
        mCtx.fillRect(0, 0, 128, 128);

        const mistTex = new THREE.CanvasTexture(mistCanvas);
        const mistMat = new THREE.MeshBasicMaterial({
            map: mistTex,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        for (let m = 0; m < 6; m++) {
            const mistGeo = new THREE.PlaneGeometry(22, 10);
            const mistMesh = new THREE.Mesh(mistGeo, mistMat);
            const ang = (m / 6) * Math.PI * 2;
            const dist = 11 + (m % 2) * 3;
            mistMesh.position.set(monoX + Math.cos(ang) * dist, groundY + 2.5 + Math.random() * 2, monoZ + Math.sin(ang) * dist);
            mistMesh.rotation.y = ang + Math.PI / 2;
            this.scene.add(mistMesh);
            this.mistPlanes.push(mistMesh);
        }
    }

    /**
     * The Weathered Wooden Shack & Rustic Split-Rail Fence
     * (Prominent feature on the left slope in the user's nocturnal reference photo)
     */
    createWoodenCabinAndFence() {
        const cabinGroup = new THREE.Group();
        const cabX = -28;
        const cabZ = 12;
        const groundY = this.getTerrainHeight(cabX, cabZ);

        // Weathered timber plank texture
        const plankCanvas = document.createElement('canvas');
        plankCanvas.width = 256;
        plankCanvas.height = 256;
        const pCtx = plankCanvas.getContext('2d');
        pCtx.fillStyle = '#3a2b1f';
        pCtx.fillRect(0, 0, 256, 256);

        // Horizontal wood siding planks
        for (let y = 0; y < 256; y += 18) {
            pCtx.fillStyle = (y % 36 === 0) ? '#443325' : '#33261a';
            pCtx.fillRect(0, y, 256, 17);
            pCtx.fillStyle = 'rgba(18, 12, 8, 0.7)';
            pCtx.fillRect(0, y + 16, 256, 2);
        }
        const plankTex = new THREE.CanvasTexture(plankCanvas);
        plankTex.wrapS = THREE.RepeatWrapping;
        plankTex.wrapT = THREE.RepeatWrapping;
        plankTex.repeat.set(2, 2);

        const cabinMat = new THREE.MeshStandardMaterial({
            map: plankTex,
            roughness: 0.9,
            metalness: 0.05
        });

        const roofMat = new THREE.MeshStandardMaterial({
            color: 0x241c14,
            roughness: 0.85
        });

        // 1. Cabin Main Walls
        const wallGeo = new THREE.BoxGeometry(8.2, 4.4, 6.4);
        const walls = new THREE.Mesh(wallGeo, cabinMat);
        walls.position.y = 2.2;
        walls.castShadow = true;
        cabinGroup.add(walls);

        // 2. Pitched Timber Gable Roof (slanted overhang)
        const roofPrism = new THREE.Group();
        const roofLeft = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.28, 7.4), roofMat);
        roofLeft.position.set(-2.0, 5.0, 0);
        roofLeft.rotation.z = 0.52;
        roofPrism.add(roofLeft);

        const roofRight = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.28, 7.4), roofMat);
        roofRight.position.set(2.0, 5.0, 0);
        roofRight.rotation.z = -0.52;
        roofPrism.add(roofRight);
        cabinGroup.add(roofPrism);

        // 3. Dark Recessed Wooden Door
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x1a120b, roughness: 0.95 });
        const door = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.8), doorMat);
        door.position.set(0, 1.4, 3.22);
        cabinGroup.add(door);

        // 4. Dark Window Frame
        const winMat = new THREE.MeshStandardMaterial({ color: 0x0a0f16, roughness: 0.2, metalness: 0.8 });
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), winMat);
        win.position.set(2.4, 2.4, 3.22);
        cabinGroup.add(win);

        cabinGroup.position.set(cabX, groundY, cabZ);
        cabinGroup.rotation.y = 0.35;
        this.scene.add(cabinGroup);

        // Solid impenetrable collision for the cabin
        this.obstacles.push({
            position: new THREE.Vector3(cabX, groundY, cabZ),
            radius: 5.6
        });

        // 5. Rustic Split-Rail Wooden Fence (as seen in the reference image running down the slope)
        const fenceMat = new THREE.MeshStandardMaterial({ color: 0x3d2c1d, roughness: 0.92 });
        const postGeo = new THREE.CylinderGeometry(0.12, 0.14, 1.6, 6);
        const railGeo = new THREE.BoxGeometry(3.6, 0.12, 0.14);

        const fencePath = [
            { x: -21, z: 8 },
            { x: -23.5, z: 9.5 },
            { x: -26, z: 11 },
            { x: -28.5, z: 12.5 },
            { x: -31, z: 14 }
        ];

        for (let i = 0; i < fencePath.length; i++) {
            const p = fencePath[i];
            const py = this.getTerrainHeight(p.x, p.z);
            const post = new THREE.Mesh(postGeo, fenceMat);
            post.position.set(p.x, py + 0.8, p.z);
            this.scene.add(post);

            this.obstacles.push({
                position: new THREE.Vector3(p.x, py, p.z),
                radius: 0.45
            });

            // Rails connecting to next post
            if (i < fencePath.length - 1) {
                const nextP = fencePath[i + 1];
                const nextPy = this.getTerrainHeight(nextP.x, nextP.z);
                const midX = (p.x + nextP.x) / 2;
                const midZ = (p.z + nextP.z) / 2;
                const midY = (py + nextPy) / 2;
                const ang = Math.atan2(nextP.z - p.z, nextP.x - p.x);

                const topRail = new THREE.Mesh(railGeo, fenceMat);
                topRail.position.set(midX, midY + 1.1, midZ);
                topRail.rotation.y = -ang;
                this.scene.add(topRail);

                const botRail = new THREE.Mesh(railGeo, fenceMat);
                botRail.position.set(midX, midY + 0.6, midZ);
                botRail.rotation.y = -ang;
                this.scene.add(botRail);
            }
        }
    }

    /**
     * Foreground Marsh / Forest Pond
     * (Reflective water pool reflecting moonlight/sky in foreground as seen in user's night photo)
     */
    createForestPond() {
        const pondX = -9.0;
        const pondZ = 3.5;
        const groundY = this.getTerrainHeight(pondX, pondZ);

        // Water surface plane with specular reflections
        this.waterMat = new THREE.MeshStandardMaterial({
            color: 0x182436,
            roughness: 0.12,
            metalness: 0.45,
            transparent: true,
            opacity: 0.88,
            side: THREE.DoubleSide
        });

        const waterGeo = new THREE.CircleGeometry(6.2, 24);
        waterGeo.rotateX(-Math.PI / 2);
        waterGeo.scale(1.25, 1.0, 0.95); // Natural oblong pool shape

        const waterMesh = new THREE.Mesh(waterGeo, this.waterMat);
        waterMesh.position.set(pondX, groundY + 0.08, pondZ);
        waterMesh.rotation.y = 0.4;
        this.waterMesh = waterMesh;
        this.scene.add(waterMesh);

        // Wet mossy boulders around the water's edge (matching user's reference)
        const wetRockMat = new THREE.MeshStandardMaterial({ color: 0x32353c, roughness: 0.65, flatShading: true });
        const bankRockOffsets = [
            { x: -5.5, z: 0.8, r: 0.9 },
            { x: 4.8, z: -1.2, r: 1.1 },
            { x: -2.5, z: -4.2, r: 0.85 },
            { x: 3.2, z: 3.5, r: 0.75 },
            { x: -5.0, z: -3.0, r: 0.95 }
        ];

        bankRockOffsets.forEach(bo => {
            const rx = pondX + bo.x;
            const rz = pondZ + bo.z;
            const ry = this.getTerrainHeight(rx, rz);
            const rMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(bo.r, 1), wetRockMat);
            rMesh.position.set(rx, ry + bo.r * 0.4, rz);
            rMesh.scale.set(1.2, 0.7, 1.1);
            this.scene.add(rMesh);

            this.obstacles.push({
                position: new THREE.Vector3(rx, ry, rz),
                radius: bo.r * 1.1
            });
        });

        // Reeds and marsh grass clumps surrounding the pond
        const reedMat = new THREE.MeshStandardMaterial({ color: 0x224820, roughness: 0.8, side: THREE.DoubleSide });
        for (let r = 0; r < 28; r++) {
            const ang = (r / 28) * Math.PI * 2;
            const rx = pondX + Math.cos(ang) * 5.8;
            const rz = pondZ + Math.sin(ang) * 4.6;
            const ry = this.getTerrainHeight(rx, rz);

            const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, 1.4, 4), reedMat);
            reed.position.set(rx, ry + 0.7, rz);
            reed.rotation.z = (Math.random() - 0.5) * 0.25;
            this.scene.add(reed);
        }
    }

    /**
     * Crooked Gnarled Dead Trees
     * (Twisting bare branches reaching into the mist, as seen in user's nocturnal reference photo)
     */
    createGnarledDeadTrees() {
        const deadMat = new THREE.MeshStandardMaterial({ color: 0x241b12, roughness: 0.95 });

        const snagPositions = [
            { x: -16, z: 7, scale: 1.1 },
            { x: -20, z: -1, scale: 0.95 }
        ];

        snagPositions.forEach(sp => {
            const gy = this.getTerrainHeight(sp.x, sp.z);
            const snag = new THREE.Group();

            // Lower twisted trunk
            const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 3.2, 6), deadMat);
            t1.position.y = 1.6;
            t1.rotation.z = -0.18;
            snag.add(t1);

            // Mid crooked bend
            const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 2.6, 5), deadMat);
            t2.position.set(-0.4, 3.8, 0.1);
            t2.rotation.z = 0.35;
            t2.rotation.y = 0.5;
            snag.add(t2);

            // Gnarled reaching bare branches
            for (let b = 0; b < 3; b++) {
                const bMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.10, 2.2, 4), deadMat);
                bMesh.position.set(-0.2 + (b % 2) * 0.4, 4.8 + b * 0.5, (b - 1) * 0.3);
                bMesh.rotation.z = (b % 2 === 0 ? 0.6 : -0.7);
                bMesh.rotation.x = (b - 1) * 0.45;
                snag.add(bMesh);
            }

            snag.scale.set(sp.scale, sp.scale, sp.scale);
            snag.position.set(sp.x, gy, sp.z);
            this.scene.add(snag);

            this.obstacles.push({
                position: new THREE.Vector3(sp.x, gy, sp.z),
                radius: 0.85
            });
        });
    }

    createDistantMountainRidges() {
        const ridgeMat = new THREE.MeshStandardMaterial({
            color: 0x47636e,
            roughness: 0.95,
            flatShading: true
        });

        const ridgeCount = 14;
        for (let i = 0; i < ridgeCount; i++) {
            const angle = (i / ridgeCount) * Math.PI * 2;
            const dist = 115 + (i % 3) * 15;
            const x = Math.cos(angle) * dist;
            const z = Math.sin(angle) * dist;
            const baseY = this.getTerrainHeight(x, z);

            const height = 45 + Math.random() * 25;
            const width = 38 + Math.random() * 20;

            const mountainGeo = new THREE.ConeGeometry(width, height, 6);
            const mountain = new THREE.Mesh(mountainGeo, ridgeMat);
            mountain.position.set(x, baseY + height * 0.35, z);
            mountain.scale.set(1 + Math.random() * 0.4, 1, 0.8 + Math.random() * 0.4);
            this.scene.add(mountain);
        }
    }

    generateTimberStumpsAndLogs() {
        const ringCanvas = document.createElement('canvas');
        ringCanvas.width = 128;
        ringCanvas.height = 128;
        const rCtx = ringCanvas.getContext('2d');

        rCtx.fillStyle = '#cf9f65';
        rCtx.fillRect(0, 0, 128, 128);

        for (let r = 8; r < 64; r += 2 + Math.random() * 2) {
            rCtx.strokeStyle = (r < 22) ? '#7a4e25' : '#9c6f3d';
            rCtx.lineWidth = 1.2;
            rCtx.beginPath();
            rCtx.arc(64, 64, r, 0, Math.PI * 2);
            rCtx.stroke();
        }

        for (let c = 0; c < 4; c++) {
            const ang = (c / 4) * Math.PI * 2 + Math.random() * 0.4;
            rCtx.strokeStyle = 'rgba(45, 28, 14, 0.75)';
            rCtx.lineWidth = 1.8;
            rCtx.beginPath();
            rCtx.moveTo(64, 64);
            rCtx.lineTo(64 + Math.cos(ang) * (35 + Math.random() * 25), 64 + Math.sin(ang) * (35 + Math.random() * 25));
            rCtx.stroke();
        }

        const ringTex = new THREE.CanvasTexture(ringCanvas);
        const barkMat = new THREE.MeshStandardMaterial({ color: 0x483220, roughness: 0.9 });
        const cutWoodMat = new THREE.MeshStandardMaterial({ map: ringTex, roughness: 0.7 });
        const stumpMaterials = [barkMat, cutWoodMat, barkMat];

        // 24 Cut Timber Stumps dotted across the central meadow
        for (let s = 0; s < 24; s++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 5.0 + Math.random() * 28.0;
            const x = Math.cos(angle) * dist;
            const z = Math.sin(angle) * dist;

            if (Math.hypot(x, z) < 3.2) continue;
            // Avoid pond area
            if (Math.hypot(x - (-9), z - 3.5) < 7.0) continue;

            const y = this.getTerrainHeight(x, z);
            const radius = 0.38 + Math.random() * 0.35;
            const height = 0.5 + Math.random() * 0.45;

            const stumpGeo = new THREE.CylinderGeometry(radius * 0.9, radius * 1.15, height, 7);
            const stumpMesh = new THREE.Mesh(stumpGeo, barkMat);
            stumpMesh.position.set(x, y + height * 0.5 - 0.05, z);
            stumpMesh.rotation.y = Math.random() * Math.PI * 2;
            this.scene.add(stumpMesh);

            const topCapGeo = new THREE.CircleGeometry(radius * 0.89, 7);
            topCapGeo.rotateX(-Math.PI / 2);
            const topCapMesh = new THREE.Mesh(topCapGeo, cutWoodMat);
            topCapMesh.position.set(x, y + height - 0.045, z);
            this.scene.add(topCapMesh);

            this.obstacles.push({
                position: new THREE.Vector3(x, y, z),
                radius: radius * 1.2
            });
        }

        // 14 Fallen logs
        const logMat = new THREE.MeshStandardMaterial({ color: 0x453120, roughness: 0.88 });
        for (let l = 0; l < 14; l++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 8.0 + Math.random() * 32.0;
            const x = Math.cos(angle) * dist;
            const z = Math.sin(angle) * dist;

            if (Math.hypot(x - (-9), z - 3.5) < 7.0) continue;

            const y = this.getTerrainHeight(x, z);
            const logLength = 3.5 + Math.random() * 3.5;
            const logRadius = 0.28 + Math.random() * 0.15;
            const logGeo = new THREE.CylinderGeometry(logRadius * 0.85, logRadius, logLength, 6);
            logGeo.rotateZ(Math.PI / 2);

            const log = new THREE.Mesh(logGeo, logMat);
            log.position.set(x, y + logRadius * 0.8, z);
            log.rotation.y = Math.random() * Math.PI * 2;
            this.scene.add(log);

            this.obstacles.push({
                position: new THREE.Vector3(x, y, z),
                radius: logRadius * 1.4
            });
        }
    }

    generateTrees() {
        const pineTrunkMat = new THREE.MeshStandardMaterial({ color: 0x4d321d, roughness: 0.9 });
        const pineFoliageMat1 = new THREE.MeshStandardMaterial({ color: 0x1e3f22, roughness: 0.75, flatShading: true });
        const pineFoliageMat2 = new THREE.MeshStandardMaterial({ color: 0x2b522e, roughness: 0.75, flatShading: true });
        
        const oakTrunkMat = new THREE.MeshStandardMaterial({ color: 0x513824, roughness: 0.9 });
        const oakFoliageMat = new THREE.MeshStandardMaterial({ color: 0x3d682a, roughness: 0.7, flatShading: true });

        const birchTrunkMat = new THREE.MeshStandardMaterial({ color: 0xd6cfbf, roughness: 0.8 });
        const birchFoliageMat = new THREE.MeshStandardMaterial({ color: 0x6e8732, roughness: 0.75, flatShading: true });

        const treeCount = 175;
        for (let i = 0; i < treeCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 7.0 + Math.random() * (this.arenaRadius - 6.0);
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;

            // Clear sightline to rock monolith from central meadow
            const distToMonolith = Math.hypot(x - 38, z - (-14));
            if (distToMonolith < 22.0) continue;
            if (x > 4 && x < 36 && z > -24 && z < 4) continue;

            // Clear cabin area and pond
            if (Math.hypot(x - (-28), z - 12) < 10.0) continue;
            if (Math.hypot(x - (-9), z - 3.5) < 8.0) continue;

            const y = this.getTerrainHeight(x, z);
            const treeType = Math.random();
            let treeMesh, trunkRadius;

            if (treeType < 0.65) {
                treeMesh = this.buildAlpinePineTree(pineTrunkMat, (i % 2 === 0 ? pineFoliageMat1 : pineFoliageMat2));
                trunkRadius = 0.55;
            } else if (treeType < 0.85) {
                treeMesh = this.buildOakTree(oakTrunkMat, oakFoliageMat);
                trunkRadius = 0.75;
            } else {
                treeMesh = this.buildBirchTree(birchTrunkMat, birchFoliageMat);
                trunkRadius = 0.45;
            }

            const scale = 0.85 + Math.random() * 0.45;
            treeMesh.scale.set(scale, scale, scale);
            treeMesh.position.set(x, y, z);
            treeMesh.rotation.y = Math.random() * Math.PI * 2;
            this.scene.add(treeMesh);

            this.obstacles.push({
                position: new THREE.Vector3(x, y, z),
                radius: Math.max(0.85, trunkRadius * scale * 1.6)
            });
        }
    }

    buildAlpinePineTree(trunkMat, foliageMat) {
        const group = new THREE.Group();
        const trunkHeight = 10.5 + Math.random() * 3.5;
        const trunkGeo = new THREE.CylinderGeometry(0.18, 0.48, trunkHeight, 6);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = trunkHeight / 2;
        group.add(trunk);

        if (!this._deadBranchMat) {
            this._deadBranchMat = new THREE.MeshStandardMaterial({ color: 0x3d2816, roughness: 0.95 });
        }
        const deadBranchMat = this._deadBranchMat;
        for (let d = 0; d < 3; d++) {
            const dGeo = new THREE.CylinderGeometry(0.04, 0.08, 1.4, 4);
            const dMesh = new THREE.Mesh(dGeo, deadBranchMat);
            dMesh.position.set(0, trunkHeight * 0.28 + d * 0.7, 0);
            dMesh.rotation.z = 1.1 * (d % 2 === 0 ? 1 : -1);
            dMesh.rotation.y = d * 1.8;
            group.add(dMesh);
        }

        const tiers = 5;
        const startY = trunkHeight * 0.42;
        for (let t = 0; t < tiers; t++) {
            const coneHeight = 3.6 - t * 0.45;
            const coneRadius = 3.0 - t * 0.48;
            const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 7);
            const cone = new THREE.Mesh(coneGeo, foliageMat);
            cone.position.y = startY + t * 1.7;
            cone.rotation.y = t * 0.75;
            group.add(cone);
        }

        return group;
    }

    buildOakTree(trunkMat, foliageMat) {
        const group = new THREE.Group();
        const trunkHeight = 6.0 + Math.random() * 2;
        const trunkGeo = new THREE.CylinderGeometry(0.35, 0.75, trunkHeight, 8);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = trunkHeight / 2;
        group.add(trunk);

        for (let f = 0; f < 5; f++) {
            const sphereGeo = new THREE.DodecahedronGeometry(1.7 + Math.random() * 0.7, 1);
            const fol = new THREE.Mesh(sphereGeo, foliageMat);
            fol.position.set(
                (Math.random() - 0.5) * 2.4,
                trunkHeight - 0.5 + Math.random() * 2.5,
                (Math.random() - 0.5) * 2.4
            );
            group.add(fol);
        }
        return group;
    }

    buildBirchTree(trunkMat, foliageMat) {
        const group = new THREE.Group();
        const trunkHeight = 8.5 + Math.random() * 2;
        const trunkGeo = new THREE.CylinderGeometry(0.18, 0.35, trunkHeight, 7);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = trunkHeight / 2;
        group.add(trunk);

        const folGeo = new THREE.ConeGeometry(1.9, 4.5, 7);
        const fol = new THREE.Mesh(folGeo, foliageMat);
        fol.position.y = trunkHeight * 0.85;
        group.add(fol);
        return group;
    }

    generateFoliageAndProps() {
        const grassCanvas = document.createElement('canvas');
        grassCanvas.width = 64;
        grassCanvas.height = 64;
        const gCtx = grassCanvas.getContext('2d');
        gCtx.clearRect(0, 0, 64, 64);

        for (let b = 0; b < 14; b++) {
            const bx = 10 + b * 3.5;
            const h = 32 + Math.random() * 28;
            const bend = (Math.random() - 0.5) * 16;
            gCtx.strokeStyle = Math.random() > 0.4 ? '#4a852b' : '#396b20';
            gCtx.lineWidth = 2.0;
            gCtx.beginPath();
            gCtx.moveTo(bx, 64);
            gCtx.quadraticCurveTo(bx + bend * 0.5, 64 - h * 0.6, bx + bend, 64 - h);
            gCtx.stroke();
        }

        const grassTex = new THREE.CanvasTexture(grassCanvas);
        const grassMat = new THREE.MeshStandardMaterial({
            map: grassTex,
            transparent: true,
            alphaTest: 0.25,
            side: THREE.DoubleSide,
            roughness: 0.75
        });

        // 175 Grass Clumps
        for (let i = 0; i < 175; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 2.5 + Math.random() * (this.arenaRadius - 10);
            const x = Math.cos(angle) * dist;
            const z = Math.sin(angle) * dist;
            const y = this.getTerrainHeight(x, z);

            const tuft = new THREE.Group();
            const quadGeo = new THREE.PlaneGeometry(1.1, 1.0);
            quadGeo.translate(0, 0.5, 0);

            const p1 = new THREE.Mesh(quadGeo, grassMat);
            const p2 = new THREE.Mesh(quadGeo, grassMat);
            p2.rotation.y = Math.PI / 2;
            tuft.add(p1);
            tuft.add(p2);

            const scale = 0.8 + Math.random() * 0.5;
            tuft.scale.set(scale, scale, scale);
            tuft.position.set(x, y, z);
            tuft.rotation.y = Math.random() * Math.PI;
            this.scene.add(tuft);
        }

        // 140 Leafy Clover Patches
        const cloverMat = new THREE.MeshStandardMaterial({ color: 0x3d7a28, roughness: 0.75, side: THREE.DoubleSide });
        for (let i = 0; i < 140; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 3.0 + Math.random() * (this.arenaRadius - 8);
            const x = Math.cos(angle) * dist;
            const z = Math.sin(angle) * dist;
            const y = this.getTerrainHeight(x, z);

            const cloverGroup = new THREE.Group();
            const leafGeo = new THREE.CircleGeometry(0.24, 5);
            leafGeo.rotateX(-Math.PI / 2);

            for (let l = 0; l < 4; l++) {
                const leaf = new THREE.Mesh(leafGeo, cloverMat);
                leaf.position.set(
                    (Math.random() - 0.5) * 0.6,
                    0.05 + Math.random() * 0.08,
                    (Math.random() - 0.5) * 0.6
                );
                leaf.rotation.y = Math.random() * Math.PI;
                cloverGroup.add(leaf);
            }
            cloverGroup.position.set(x, y, z);
            this.scene.add(cloverGroup);
        }

        // 90 Wild Bracken Ferns
        const fernMat = new THREE.MeshStandardMaterial({ color: 0x2e6320, roughness: 0.7, side: THREE.DoubleSide });
        for (let i = 0; i < 90; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 3.5 + Math.random() * (this.arenaRadius - 8);
            const x = Math.cos(angle) * dist;
            const z = Math.sin(angle) * dist;
            const y = this.getTerrainHeight(x, z);

            const fern = new THREE.Group();
            const frondGeo = new THREE.PlaneGeometry(0.45, 1.1);
            frondGeo.translate(0, 0.55, 0);

            for (let f = 0; f < 5; f++) {
                const frond = new THREE.Mesh(frondGeo, fernMat);
                frond.rotation.y = (f / 5) * Math.PI * 2;
                frond.rotation.x = 0.48;
                fern.add(frond);
            }
            const s = 0.8 + Math.random() * 0.45;
            fern.scale.set(s, s, s);
            fern.position.set(x, y, z);
            this.scene.add(fern);
        }

        // 45 Granite Field Rocks
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x5a564d, roughness: 0.9, flatShading: true });
        for (let i = 0; i < 45; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 4.0 + Math.random() * (this.arenaRadius - 7);
            const x = Math.cos(angle) * dist;
            const z = Math.sin(angle) * dist;
            const y = this.getTerrainHeight(x, z);

            const baseRadius = 0.5 + Math.random() * 0.9;
            const rockGeo = new THREE.DodecahedronGeometry(baseRadius, 1);
            const rock = new THREE.Mesh(rockGeo, rockMat);
            rock.position.set(x, y + 0.2, z);
            rock.scale.set(1 + Math.random() * 0.5, 0.7 + Math.random() * 0.5, 1 + Math.random() * 0.5);
            rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
            this.scene.add(rock);

            this.obstacles.push({
                position: new THREE.Vector3(x, y + 0.2, z),
                radius: baseRadius * 1.2
            });
        }

        // 40 Forest Mushrooms
        const stemMat = new THREE.MeshStandardMaterial({ color: 0xf0e9d5, roughness: 0.6 });
        const capMatRed = new THREE.MeshStandardMaterial({ color: 0xba2426, roughness: 0.4 });
        const capMatBrown = new THREE.MeshStandardMaterial({ color: 0x825226, roughness: 0.6 });

        for (let i = 0; i < 40; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 2.5 + Math.random() * (this.arenaRadius - 8);
            const x = Math.cos(angle) * dist;
            const z = Math.sin(angle) * dist;
            const y = this.getTerrainHeight(x, z);

            const mushroom = new THREE.Group();
            const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.3, 6), stemMat);
            stem.position.y = 0.15;
            const cap = new THREE.Mesh(
                new THREE.SphereGeometry(0.16, 8, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
                (i % 3 === 0 ? capMatRed : capMatBrown)
            );
            cap.position.y = 0.28;
            mushroom.add(stem);
            mushroom.add(cap);

            const scale = 0.7 + Math.random() * 0.8;
            mushroom.scale.set(scale, scale, scale);
            mushroom.position.set(x, y, z);
            this.scene.add(mushroom);
        }
    }

    createAtmosphericMist() {
        const mistCanvas = document.createElement('canvas');
        mistCanvas.width = 128;
        mistCanvas.height = 128;
        const mCtx = mistCanvas.getContext('2d');
        const mGrad = mCtx.createRadialGradient(64, 64, 8, 64, 64, 62);
        mGrad.addColorStop(0, 'rgba(235, 245, 255, 0.35)');
        mGrad.addColorStop(0.5, 'rgba(220, 238, 250, 0.18)');
        mGrad.addColorStop(1.0, 'rgba(210, 235, 245, 0.0)');
        mCtx.fillStyle = mGrad;
        mCtx.fillRect(0, 0, 128, 128);

        const mistTex = new THREE.CanvasTexture(mistCanvas);
        const mistMat = new THREE.MeshBasicMaterial({
            map: mistTex,
            transparent: true,
            opacity: 0.40,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const dist = 12.0 + Math.random() * 35.0;
            const x = Math.cos(angle) * dist;
            const z = Math.sin(angle) * dist;
            const y = this.getTerrainHeight(x, z) + 1.2 + Math.random() * 1.5;

            const mistMesh = new THREE.Mesh(new THREE.PlaneGeometry(18 + Math.random() * 10, 6), mistMat);
            mistMesh.position.set(x, y, z);
            mistMesh.rotation.y = Math.random() * Math.PI * 2;
            this.scene.add(mistMesh);
            this.mistPlanes.push(mistMesh);
        }
    }

    createAtmosphericParticles() {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(this.particleCount * 3);
        const velocities = [];

        for (let i = 0; i < this.particleCount; i++) {
            const idx = i * 3;
            positions[idx] = (Math.random() - 0.5) * 90;
            positions[idx + 1] = 0.5 + Math.random() * 12;
            positions[idx + 2] = (Math.random() - 0.5) * 90;

            velocities.push({
                x: (Math.random() - 0.5) * 0.25,
                y: -0.08 + (Math.random() - 0.5) * 0.15,
                z: (Math.random() - 0.5) * 0.25
            });
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.particleVelocities = velocities;

        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        grad.addColorStop(0, 'rgba(255, 255, 220, 1.0)');
        grad.addColorStop(0.4, 'rgba(215, 245, 170, 0.45)');
        grad.addColorStop(1, 'rgba(215, 245, 170, 0.0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 32, 32);

        const particleTex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.PointsMaterial({
            size: 0.35,
            map: particleTex,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.particles = new THREE.Points(geo, mat);
        this.scene.add(this.particles);
    }

    update(dt, playerPos = new THREE.Vector3(0, 2, 0)) {
        // Update Rain & Storm dynamics
        if (this.currentMode === 'rain') {
            this.updateRain(dt, playerPos);
            this.updateLightning(dt);
        }

        if (this.particles) {
            const pos = this.particles.geometry.attributes.position;
            const positions = pos.array;
            for (let i = 0; i < this.particleCount; i++) {
                const idx = i * 3;
                let px = positions[idx] + this.particleVelocities[i].x * dt;
                let py = positions[idx + 1] + this.particleVelocities[i].y * dt;
                let pz = positions[idx + 2] + this.particleVelocities[i].z * dt;

                if (py < 0.2) py = 12.0;
                if (Math.abs(px) > 85) px = -px * 0.9;
                if (Math.abs(pz) > 85) pz = -pz * 0.9;

                positions[idx] = px;
                positions[idx + 1] = py;
                positions[idx + 2] = pz;
            }
            pos.needsUpdate = true;
        }

        for (let i = 0; i < this.mistPlanes.length; i++) {
            this.mistPlanes[i].rotation.y += dt * 0.02 * (i % 2 === 0 ? 1 : -1);
        }
    }

    createArenaBoundaries() {
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x484b42, roughness: 0.92 });
        for (let i = 0; i < 56; i++) {
            const angle = (i / 56) * Math.PI * 2;
            const x = Math.cos(angle) * (this.arenaRadius + 2);
            const z = Math.sin(angle) * (this.arenaRadius + 2);
            const y = this.getTerrainHeight(x, z);

            const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(4.4, 1), wallMat);
            rock.position.set(x, y + 1.2, z);
            rock.scale.set(1.5, 2.3, 1.5);
            this.scene.add(rock);

            this.obstacles.push({
                position: new THREE.Vector3(x, y + 1.2, z),
                radius: 4.8
            });
        }
    }
}
