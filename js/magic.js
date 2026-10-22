/**
 * magic.js
 * Elemental Magic System for "KILL THE FLY".
 * Unlocked from Level 2 onward.
 * Spells:
 *  [1] SUMMON LIGHTNING - Celestial electric thunderbolt strike
 *  [2] FIREBALL THROW   - Explosive fiery projectile detonation
 *  [3] SMOKE CONFUSE    - Mystical suffocating disorientation cloud
 *  [4] ECHO ATTACK      - Ultrasonic acoustic shockwave resonance
 *  [5] EARTH CRUST      - Seismic stalagmite rock spike eruption
 *
 * CRITICAL RULE: Magic spells ONLY damage and affect Red Angry Flies (fly.isAngry).
 * Regular peaceful Drosophila flies are unaffected by magic.
 */

class MagicManager {
    constructor(camera, scene, game) {
        this.camera = camera;
        this.scene = scene;
        this.game = game;

        // Spell metadata & cooldown timers
        this.spells = {
            1: {
                id: 'lightning',
                name: 'SUMMON LIGHTNING',
                key: 'Z',
                icon: '⚡',
                cooldown: 2.2,
                currentCooldown: 0.0,
                color: '#00e5ff'
            },
            2: {
                id: 'fireball',
                name: 'FIREBALL THROW',
                key: 'X',
                icon: '🔥',
                cooldown: 1.6,
                currentCooldown: 0.0,
                color: '#ff5500'
            },
            3: {
                id: 'smoke',
                name: 'SMOKE CONFUSE',
                key: 'C',
                icon: '💨',
                cooldown: 3.5,
                currentCooldown: 0.0,
                color: '#aa66ff'
            },
            4: {
                id: 'echo',
                name: 'ECHO ATTACK',
                key: 'V',
                icon: '🔊',
                cooldown: 2.8,
                currentCooldown: 0.0,
                color: '#00ffaa'
            },
            5: {
                id: 'earthCrust',
                name: 'EARTH CRUST',
                key: 'B',
                icon: '🪨',
                cooldown: 3.2,
                currentCooldown: 0.0,
                color: '#d4aa55'
            }
        };

        // Active visual effect entities
        this.activeProjectiles = []; // Fireballs, shockwaves
        this.activeVFX = [];         // Lightning bolts, smoke clouds, rock spikes

        // Pre-create shared materials & single persistent spell light (avoids WebGL shader recompile stalls!)
        this.initMaterials();
        this.spellLight = new THREE.PointLight(0x66ddff, 0, 26, 1.8);
        this.spellLight.position.set(0, -100, 0);
        this.scene.add(this.spellLight);
        this.spellLightTimer = 0;
        this.spellLightMaxTime = 0.4;
        this.spellLightPeak = 0;
        this._hudDirty = true;
    }

    triggerSpellLight(pos, colorHex, intensity, duration) {
        if (!this.spellLight) return;
        this.spellLight.position.copy(pos);
        this.spellLight.color.setHex(colorHex);
        this.spellLight.intensity = intensity;
        this.spellLightPeak = intensity;
        this.spellLightTimer = duration;
        this.spellLightMaxTime = Math.max(0.05, duration);
    }

    initMaterials() {
        // Lightning bolt glowing blue electric material
        this.lightningMat = new THREE.MeshBasicMaterial({
            color: 0x88ffff,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending
        });

        // Fireball glowing core & shell
        this.fireCoreMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.95
        });
        this.fireShellMat = new THREE.MeshBasicMaterial({
            color: 0xff4400,
            transparent: true,
            opacity: 0.75,
            blending: THREE.AdditiveBlending
        });

        // Sonic echo shockwave ring material
        this.echoMat = new THREE.MeshBasicMaterial({
            color: 0x00ffcc,
            transparent: true,
            opacity: 0.8,
            wireframe: true,
            blending: THREE.AdditiveBlending
        });

        // Earth rock spike material
        this.rockMat = new THREE.MeshStandardMaterial({
            color: 0x4a3c2c,
            roughness: 0.85,
            metalness: 0.15,
            flatShading: true
        });
    }

    /**
     * Magic features unlock after Level 1 (available from Level 2 onward)
     */
    isUnlocked() {
        return (this.game.level >= 2 || this.game.isEndless);
    }

    /**
     * Cast spell by slot number (1 to 5)
     */
    castSpell(slot) {
        const spell = this.spells[slot];
        if (!spell) return false;

        // Check level unlock requirement
        if (!this.isUnlocked()) {
            this.game.showNotification("✨ MAGIC UNLOCKS AT LEVEL 2!");
            return false;
        }

        // Check cooldown
        if (spell.currentCooldown > 0) {
            return false;
        }

        // Set cooldown timer
        spell.currentCooldown = spell.cooldown;

        // Execute spell logic
        switch (spell.id) {
            case 'lightning':
                this.castLightning();
                break;
            case 'fireball':
                this.castFireball();
                break;
            case 'smoke':
                this.castSmoke();
                break;
            case 'echo':
                this.castEcho();
                break;
            case 'earthCrust':
                this.castEarthCrust();
                break;
        }

        this.updateHUD();
        return true;
    }

    /**
     * SPELL 1: SUMMON LIGHTNING (Key Z)
     * Calls down electric lightning bolts striking target location.
     * Instantly kills Red Angry Flies in area.
     */
    castLightning() {
        soundSystem.playLightningSpell();

        const camDir = new THREE.Vector3();
        this.camera.getWorldDirection(camDir);

        // Find strike target: look for closest angry fly in forward cone, or point on terrain ahead
        let targetPos = null;
        let closestDist = Infinity;
        const angryFlies = this.game.flies.filter(f => f.isAlive && f.isAngry);

        angryFlies.forEach(f => {
            const toFly = f.position.clone().sub(this.camera.position);
            const dist = toFly.length();
            if (dist < 45.0) {
                const angle = camDir.angleTo(toFly.normalize());
                if (angle < 0.65 && dist < closestDist) {
                    closestDist = dist;
                    targetPos = f.position.clone();
                }
            }
        });

        if (!targetPos) {
            targetPos = this.camera.position.clone().addScaledVector(camDir, 22.0);
            const groundY = this.game.forest.getTerrainHeight(targetPos.x, targetPos.z);
            targetPos.y = groundY + 1.2;
        }

        // Create 3D jagged branching lightning bolt geometry
        const boltGroup = new THREE.Group();
        const startY = targetPos.y + 45.0;
        let cur = new THREE.Vector3(targetPos.x + (Math.random() - 0.5) * 4, startY, targetPos.z + (Math.random() - 0.5) * 4);
        const steps = 14;

        for (let s = 0; s < steps; s++) {
            const progress = (s + 1) / steps;
            const next = new THREE.Vector3(
                THREE.MathUtils.lerp(cur.x, targetPos.x, progress) + (Math.random() - 0.5) * 2.8,
                THREE.MathUtils.lerp(startY, targetPos.y, progress),
                THREE.MathUtils.lerp(cur.z, targetPos.z, progress) + (Math.random() - 0.5) * 2.8
            );
            if (s === steps - 1) next.copy(targetPos);

            const segVec = next.clone().sub(cur);
            const segLen = segVec.length();
            const cylinderGeo = new THREE.CylinderGeometry(0.18, 0.28, segLen, 6);
            cylinderGeo.translate(0, segLen / 2, 0);
            cylinderGeo.rotateX(Math.PI / 2);

            const segMesh = new THREE.Mesh(cylinderGeo, this.lightningMat);
            segMesh.position.copy(cur);
            segMesh.lookAt(next);
            boltGroup.add(segMesh);

            cur.copy(next);
        }

        // Use persistent spellLight (zero shader recompilation!)
        this.triggerSpellLight(targetPos.clone().add(new THREE.Vector3(0, 2.5, 0)), 0x66ddff, 4.5, 0.35);
        const flashLight = null;

        this.scene.add(boltGroup);

        this.activeVFX.push({
            mesh: boltGroup,
            light: flashLight,
            life: 0.35,
            maxLife: 0.35,
            update: (dt, item) => {
                const alpha = item.life / item.maxLife;
                if (item.light) item.light.intensity = alpha * 4.5;
                boltGroup.traverse(child => {
                    if (child.material) child.material.opacity = alpha;
                });
            }
        });

        // Lethal damage to RED ANGRY FLIES within strike radius (11m)
        const hitRadius = 11.0;
        let killedCount = 0;
        [...this.game.flies].forEach(fly => {
            if (fly.isAlive && fly.isAngry) {
                const d = fly.position.distanceTo(targetPos);
                if (d <= hitRadius) {
                    this.game.onFlyKilled(fly);
                    fly.createSplat(fly.position.clone());
                    killedCount++;
                }
            }
        });

        if (killedCount > 0) {
            this.game.showHitmarker();
            this.game.showNotification(`⚡ LIGHTNING STRUCK ${killedCount} RED ANGRY ${killedCount === 1 ? 'FLY' : 'FLIES'}!`);
        }
    }

    /**
     * SPELL 2: FIREBALL THROW (Key X)
     * Throws a blazing fiery projectile forward that detonates on impact.
     * Burns and incinerates Red Angry Flies in blast radius.
     */
    castFireball() {
        soundSystem.playFireballSpell();

        const camDir = new THREE.Vector3();
        this.camera.getWorldDirection(camDir);

        const spawnPos = this.camera.position.clone().addScaledVector(camDir, 1.2);
        spawnPos.y -= 0.25;

        // Fireball mesh
        const fbGroup = new THREE.Group();
        const coreGeo = new THREE.SphereGeometry(0.35, 10, 10);
        const coreMesh = new THREE.Mesh(coreGeo, this.fireCoreMat);
        fbGroup.add(coreMesh);

        const shellGeo = new THREE.SphereGeometry(0.55, 10, 10);
        const shellMesh = new THREE.Mesh(shellGeo, this.fireShellMat);
        fbGroup.add(shellMesh);

        this.triggerSpellLight(spawnPos, 0xff6600, 3.0, 0.6);

        fbGroup.position.copy(spawnPos);
        this.scene.add(fbGroup);

        const velocity = camDir.clone().multiplyScalar(32.0); // 32 m/s forward throw

        this.activeProjectiles.push({
            mesh: fbGroup,
            velocity: velocity,
            life: 1.8,
            blastRadius: 9.0,
            update: (dt, proj) => {
                proj.mesh.position.addScaledVector(proj.velocity, dt);

                // Small pulsation animation
                const s = 1.0 + Math.sin(proj.life * 25.0) * 0.15;
                proj.mesh.scale.set(s, s, s);

                // Check collision with Red Angry Flies
                let detonated = false;
                for (let i = 0; i < this.game.flies.length; i++) {
                    const fly = this.game.flies[i];
                    if (fly.isAlive && fly.isAngry) {
                        if (fly.position.distanceTo(proj.mesh.position) <= 1.8) {
                            detonated = true;
                            break;
                        }
                    }
                }

                // Check collision with ground
                const groundY = this.game.forest.getTerrainHeight(proj.mesh.position.x, proj.mesh.position.z);
                if (proj.mesh.position.y <= groundY + 0.3) {
                    detonated = true;
                }

                if (detonated) {
                    this.detonateFireball(proj.mesh.position.clone(), proj.blastRadius);
                    return false; // remove projectile
                }
                return true;
            }
        });
    }

    /**
     * Fireball detonation explosion
     */
    detonateFireball(detonatePos, radius) {
        soundSystem.playFireballSpell();

        // Explosion visual flare
        const expGroup = new THREE.Group();
        const expGeo = new THREE.SphereGeometry(radius * 0.7, 12, 12);
        const expMat = new THREE.MeshBasicMaterial({
            color: 0xff3300,
            transparent: true,
            opacity: 0.9,
            wireframe: true,
            blending: THREE.AdditiveBlending
        });
        const expMesh = new THREE.Mesh(expGeo, expMat);
        expGroup.add(expMesh);

        this.triggerSpellLight(detonatePos, 0xff4400, 5.0, 0.5);
        const expLight = null;

        expGroup.position.copy(detonatePos);
        this.scene.add(expGroup);

        this.activeVFX.push({
            mesh: expGroup,
            life: 0.5,
            maxLife: 0.5,
            update: (dt, item) => {
                const alpha = item.life / item.maxLife;
                const scale = (1.0 - alpha) * 1.6 + 0.8;
                item.mesh.scale.set(scale, scale, scale);
                expMat.opacity = alpha * 0.9;
                if (expLight) expLight.intensity = alpha * 5.0;
            }
        });

        // Kill only RED ANGRY FLIES within radius
        let killedCount = 0;
        [...this.game.flies].forEach(fly => {
            if (fly.isAlive && fly.isAngry) {
                if (fly.position.distanceTo(detonatePos) <= radius) {
                    this.game.onFlyKilled(fly);
                    fly.createSplat(fly.position.clone());
                    killedCount++;
                }
            }
        });

        if (killedCount > 0) {
            this.game.showHitmarker();
            this.game.showNotification(`🔥 FIREBALL INCINERATED ${killedCount} RED ANGRY ${killedCount === 1 ? 'FLY' : 'FLIES'}!`);
        }
    }

    /**
     * SPELL 3: SMOKE CONFUSE (Key C)
     * Billows a dense mystic suffocating cloud.
     * Stuns, disorients, and kills Red Angry Flies caught inside.
     */
    castSmoke() {
        soundSystem.playSmokeSpell();

        const camDir = new THREE.Vector3();
        this.camera.getWorldDirection(camDir);

        // Center cloud 4m ahead of player
        const cloudPos = this.camera.position.clone().addScaledVector(camDir, 4.0);
        const groundY = this.game.forest.getTerrainHeight(cloudPos.x, cloudPos.z);
        cloudPos.y = groundY + 1.8;

        const smokeGroup = new THREE.Group();
        const puffCount = 10;
        const puffMeshes = [];

        for (let i = 0; i < puffCount; i++) {
            const pGeo = new THREE.DodecahedronGeometry(1.8 + Math.random() * 1.2, 1);
            const pMat = new THREE.MeshBasicMaterial({
                color: (i % 2 === 0) ? 0x9944dd : 0x552277,
                transparent: true,
                opacity: 0.65,
                depthWrite: false
            });
            const pMesh = new THREE.Mesh(pGeo, pMat);
            pMesh.position.set(
                (Math.random() - 0.5) * 5.0,
                (Math.random() - 0.5) * 2.5,
                (Math.random() - 0.5) * 5.0
            );
            smokeGroup.add(pMesh);
            puffMeshes.push({ mesh: pMesh, rotSpeed: (Math.random() - 0.5) * 1.5 });
        }

        this.triggerSpellLight(cloudPos, 0xaa55ff, 2.5, 1.2);
        const smokeLight = null;

        smokeGroup.position.copy(cloudPos);
        this.scene.add(smokeGroup);

        const radius = 14.0;
        let killedCount = 0;

        // Disorient and eliminate Red Angry Flies within smoke zone
        [...this.game.flies].forEach(fly => {
            if (fly.isAlive && fly.isAngry) {
                if (fly.position.distanceTo(cloudPos) <= radius) {
                    // Confuse behavior: break dive attack and recoil
                    fly.attackState = 'RECOIL';
                    fly.recoilTimer = 2.5;
                    fly.velocity.set((Math.random() - 0.5) * 3, 2.0, (Math.random() - 0.5) * 3);

                    // Suffocate angry fly
                    setTimeout(() => {
                        if (fly.isAlive && fly.isAngry) {
                            this.game.onFlyKilled(fly);
                            fly.createSplat(fly.position.clone());
                        }
                    }, 400 + Math.random() * 500);

                    killedCount++;
                }
            }
        });

        this.activeVFX.push({
            mesh: smokeGroup,
            life: 2.2,
            maxLife: 2.2,
            update: (dt, item) => {
                const alpha = item.life / item.maxLife;
                const scale = (1.0 - alpha) * 1.2 + 0.8;
                smokeGroup.scale.set(scale, scale, scale);
                puffMeshes.forEach(p => {
                    p.mesh.rotation.y += p.rotSpeed * dt;
                    p.mesh.material.opacity = alpha * 0.65;
                });
                if (smokeLight) smokeLight.intensity = alpha * 2.5;
            }
        });

        if (killedCount > 0) {
            this.game.showHitmarker();
            this.game.showNotification(`💨 SMOKE CONFUSED & SUFFOCATED ${killedCount} RED ANGRY ${killedCount === 1 ? 'FLY' : 'FLIES'}!`);
        }
    }

    /**
     * SPELL 4: ECHO ATTACK (Key V)
     * Projects expanding ultrasonic sound rings.
     * Ruptures the nervous system of Red Angry Flies in a forward cone.
     */
    castEcho() {
        soundSystem.playEchoSpell();

        const camDir = new THREE.Vector3();
        this.camera.getWorldDirection(camDir);

        const echoGroup = new THREE.Group();
        const rings = [];

        for (let r = 0; r < 3; r++) {
            const ringGeo = new THREE.RingGeometry(0.8, 1.4, 24);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0x00ffcc,
                transparent: true,
                opacity: 0.85,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending
            });
            const ringMesh = new THREE.Mesh(ringGeo, ringMat);
            echoGroup.add(ringMesh);
            rings.push({ mesh: ringMesh, offset: r * 0.12 });
        }

        echoGroup.position.copy(this.camera.position);
        echoGroup.lookAt(this.camera.position.clone().add(camDir));
        this.scene.add(echoGroup);

        const maxRange = 22.0;
        let killedCount = 0;

        // Ruptures acoustic sensory organs of RED ANGRY FLIES
        [...this.game.flies].forEach(fly => {
            if (fly.isAlive && fly.isAngry) {
                const toFly = fly.position.clone().sub(this.camera.position);
                const d = toFly.length();
                if (d <= maxRange) {
                    const angle = camDir.angleTo(toFly.normalize());
                    if (angle <= 0.85) { // Forward ultrasonic cone
                        this.game.onFlyKilled(fly);
                        fly.createSplat(fly.position.clone());
                        killedCount++;
                    }
                }
            }
        });

        this.activeVFX.push({
            mesh: echoGroup,
            life: 0.7,
            maxLife: 0.7,
            update: (dt, item) => {
                const progress = 1.0 - (item.life / item.maxLife);
                echoGroup.position.copy(this.camera.position).addScaledVector(camDir, progress * 14.0);
                const currentScale = 1.0 + progress * 9.0;
                echoGroup.scale.set(currentScale, currentScale, 1.0);

                rings.forEach(ring => {
                    ring.mesh.material.opacity = (1.0 - progress) * 0.85;
                });
            }
        });

        if (killedCount > 0) {
            this.game.showHitmarker();
            this.game.showNotification(`🔊 ULTRASONIC ECHO SHATTERED ${killedCount} RED ANGRY ${killedCount === 1 ? 'FLY' : 'FLIES'}!`);
        }
    }

    /**
     * SPELL 5: EARTH CRUST (Key B)
     * Erupts sharp rocky stalagmites / earth crust monoliths from the terrain.
     * Impales and crushes Red Angry Flies in area.
     */
    castEarthCrust() {
        soundSystem.playEarthCrustSpell();

        const camDir = new THREE.Vector3();
        this.camera.getWorldDirection(camDir);

        // Center eruption 8m ahead of player
        const centerPos = this.camera.position.clone().addScaledVector(camDir, 8.5);
        const groundY = this.game.forest.getTerrainHeight(centerPos.x, centerPos.z);
        centerPos.y = groundY;

        const crustGroup = new THREE.Group();
        const spikeCount = 9;
        const spikes = [];

        for (let i = 0; i < spikeCount; i++) {
            const h = 4.2 + Math.random() * 3.5;
            const r = 0.5 + Math.random() * 0.45;
            const coneGeo = new THREE.ConeGeometry(r, h, 6);
            coneGeo.translate(0, h / 2, 0);

            const spikeMesh = new THREE.Mesh(coneGeo, this.rockMat);
            const ox = (Math.random() - 0.5) * 8.0;
            const oz = (Math.random() - 0.5) * 8.0;
            const spikeGround = this.game.forest.getTerrainHeight(centerPos.x + ox, centerPos.z + oz);

            spikeMesh.position.set(ox, -h, oz); // start subterranean
            spikeMesh.rotation.y = Math.random() * Math.PI * 2;
            spikeMesh.rotation.x = (Math.random() - 0.5) * 0.25;
            spikeMesh.rotation.z = (Math.random() - 0.5) * 0.25;

            crustGroup.add(spikeMesh);
            spikes.push({ mesh: spikeMesh, maxH: h, baseGround: spikeGround - groundY });
        }

        crustGroup.position.copy(centerPos);
        this.scene.add(crustGroup);

        const radius = 12.0;
        let killedCount = 0;

        // Impales and crushes RED ANGRY FLIES within seismic zone
        [...this.game.flies].forEach(fly => {
            if (fly.isAlive && fly.isAngry) {
                const d = fly.position.distanceTo(centerPos);
                if (d <= radius) {
                    this.game.onFlyKilled(fly);
                    fly.createSplat(fly.position.clone());
                    killedCount++;
                }
            }
        });

        this.activeVFX.push({
            mesh: crustGroup,
            life: 2.5,
            maxLife: 2.5,
            update: (dt, item) => {
                const elapsed = item.maxLife - item.life;
                spikes.forEach(sp => {
                    if (elapsed < 0.25) {
                        // Rapid violent upward eruption
                        const t = elapsed / 0.25;
                        sp.mesh.position.y = THREE.MathUtils.lerp(-sp.maxH, sp.baseGround, t);
                    } else if (item.life < 0.8) {
                        // Sinking back into earth
                        const t = item.life / 0.8;
                        sp.mesh.position.y = THREE.MathUtils.lerp(-sp.maxH, sp.baseGround, t);
                    }
                });
            }
        });

        if (killedCount > 0) {
            this.game.showHitmarker();
            this.game.showNotification(`🪨 EARTH CRUST CRUSHED ${killedCount} RED ANGRY ${killedCount === 1 ? 'FLY' : 'FLIES'}!`);
        }
    }

    /**
     * Update active magic effects and cooldowns
     */
    update(dt) {
        if (this.spellLightTimer > 0) {
            this.spellLightTimer = Math.max(0, this.spellLightTimer - dt);
            if (this.spellLight) {
                this.spellLight.intensity = (this.spellLightTimer / this.spellLightMaxTime) * this.spellLightPeak;
            }
        }
        let anyCooldownActive = false;
        // Update cooldowns
        for (const key in this.spells) {
            const spell = this.spells[key];
            if (spell.currentCooldown > 0) {
                spell.currentCooldown = Math.max(0, spell.currentCooldown - dt);
                anyCooldownActive = true;
                this._hudDirty = true;
            }
        }

        // Update active projectiles (Fireballs)
        for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
            const proj = this.activeProjectiles[i];
            proj.life -= dt;
            const keep = (proj.life > 0) && proj.update(dt, proj);
            if (!keep) {
                this.scene.remove(proj.mesh);
                this.activeProjectiles.splice(i, 1);
            }
        }

        // Update active VFX (Lightning, Smoke, Echo, Earth Crust)
        for (let i = this.activeVFX.length - 1; i >= 0; i--) {
            const vfx = this.activeVFX[i];
            vfx.life -= dt;
            if (vfx.update) vfx.update(dt, vfx);

            if (vfx.life <= 0) {
                this.scene.remove(vfx.mesh);
                this.activeVFX.splice(i, 1);
            }
        }

        if (anyCooldownActive || this._hudDirty) {
            this.updateHUD();
            if (!anyCooldownActive) this._hudDirty = false;
        }
    }

    /**
     * Updates Magic Spell Hotbar UI
     */
    updateHUD() {
        const bar = document.getElementById('magicHotbar');
        if (!bar) return;

        const unlocked = this.isUnlocked();
        bar.style.display = unlocked ? 'flex' : 'none';
        if (!unlocked) return;

        for (const slot in this.spells) {
            const spell = this.spells[slot];
            const slotElem = document.getElementById(`magicSlot${slot}`);
            const cdFill = document.getElementById(`magicCd${slot}`);
            const cdText = document.getElementById(`magicCdText${slot}`);

            if (slotElem && cdFill && cdText) {
                if (spell.currentCooldown > 0) {
                    slotElem.classList.add('on-cooldown');
                    const pct = (spell.currentCooldown / spell.cooldown) * 100;
                    cdFill.style.height = `${pct}%`;
                    cdText.textContent = spell.currentCooldown.toFixed(1) + 's';
                    cdText.style.display = 'block';
                } else {
                    slotElem.classList.remove('on-cooldown');
                    cdFill.style.height = '0%';
                    cdText.style.display = 'none';
                }
            }
        }
    }
}
