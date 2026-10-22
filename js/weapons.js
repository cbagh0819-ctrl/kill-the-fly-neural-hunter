/**
 * Weapons.js
 * Comprehensive 8-Tier Arsenal for "KILL THE FLY: Neural Hunter".
 * Faithful procedural 3D models matching user weapon reference sheet:
 * Level 1: Badminton Racket / Fly Swatter (Melee)
 * Level 2: Tactical Handgun (Semi-Auto Pistol)
 * Level 3: MAC-10 Submachine Gun (High-RPM SMG)
 * Level 4: Pump Action Shotgun (Multi-Pellet Buckshot Spread)
 * Level 5: AK-47 Assault Rifle (7.62mm Banana Mag Rifle)
 * Level 6: Heavy Belt-Fed LMG (Squad Automatic Weapon with Ammo Box)
 * Level 7: Tactical Sniper Rifle (Long-Range Telescopic 4x Scope)
 * Level 8: RPG-7 Rocket Launcher (Explosive Projectile Swarm Obliterator)
 */

class WeaponManager {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;

        // Weapon container anchored to camera
        this.weaponHolder = new THREE.Group();
        this.camera.add(this.weaponHolder);

        // 8 Weapon Definitions
        this.weapons = {
            1: {
                id: 1,
                name: "BADMINTON RACKET",
                type: "melee",
                range: 3.8,
                hitRadius: 0.95,
                cooldown: 0.28,
                ammo: Infinity,
                maxAmmo: Infinity,
                threatWidth: 0.42
            },
            2: {
                id: 2,
                name: "TACTICAL HANDGUN",
                type: "pistol",
                range: 75.0,
                hitRadius: 0.28,
                cooldown: 0.22,
                ammo: 12,
                maxAmmo: 12,
                reloadTime: 1.1,
                threatWidth: 0.18
            },
            3: {
                id: 3,
                name: "MAC-10 SUBMACHINE GUN",
                type: "smg",
                range: 65.0,
                hitRadius: 0.32,
                cooldown: 0.075, // 800 RPM
                ammo: 32,
                maxAmmo: 32,
                reloadTime: 1.3,
                threatWidth: 0.25
            },
            4: {
                id: 4,
                name: "PUMP ACTION SHOTGUN",
                type: "shotgun",
                range: 45.0,
                hitRadius: 0.45,
                cooldown: 0.65,
                ammo: 6,
                maxAmmo: 6,
                reloadTime: 2.0,
                threatWidth: 0.50
            },
            5: {
                id: 5,
                name: "AK-47 ASSAULT RIFLE",
                type: "rifle",
                range: 85.0,
                hitRadius: 0.35,
                cooldown: 0.10, // 600 RPM
                ammo: 30,
                maxAmmo: 30,
                reloadTime: 1.6,
                threatWidth: 0.35
            },
            6: {
                id: 6,
                name: "HEAVY SQUAD LMG",
                type: "lmg",
                range: 95.0,
                hitRadius: 0.38,
                cooldown: 0.09, // 660 RPM
                ammo: 75,
                maxAmmo: 75,
                reloadTime: 2.4,
                threatWidth: 0.45
            },
            7: {
                id: 7,
                name: "TACTICAL SNIPER RIFLE",
                type: "sniper",
                range: 160.0,
                hitRadius: 0.50,
                cooldown: 0.85,
                ammo: 5,
                maxAmmo: 5,
                reloadTime: 2.2,
                threatWidth: 0.22
            },
            8: {
                id: 8,
                name: "RPG-7 ROCKET LAUNCHER",
                type: "rpg",
                range: 120.0,
                hitRadius: 0.8,
                cooldown: 1.5,
                ammo: 1,
                maxAmmo: 1,
                reloadTime: 2.5,
                threatWidth: 0.65
            }
        };

        this.currentLevel = 1;
        this.currentWeapon = null;
        this.lastFireTime = 0;
        this.isReloading = false;
        this.reloadTimer = 0;

        // Aim-down-sights (ADS)
        this.isAiming = false;
        this.aimProgress = 0.0;

        // Active RPG Rockets flying in world
        this.activeRockets = [];

        // Build all 8 3D weapon models
        this.meshes = {};
        this.meshes[1] = this.buildBadmintonRacket();
        this.meshes[2] = this.buildPistol();
        this.meshes[3] = this.buildMAC10();
        this.meshes[4] = this.buildShotgun();
        this.meshes[5] = this.buildAK47();
        this.meshes[6] = this.buildLMG();
        this.meshes[7] = this.buildSniperRifle();
        this.meshes[8] = this.buildRPG();

        // Add to camera weapon container
        for (let id = 1; id <= 8; id++) {
            if (this.meshes[id]) {
                this.weaponHolder.add(this.meshes[id]);
            }
        }

        // Muzzle flash point light
        this.muzzleLight = new THREE.PointLight(0xffcc44, 0, 16);
        this.scene.add(this.muzzleLight);

        // Animation states
        this.swingProgress = 0;
        this.isSwinging = false;
        this.hasHitThisSwing = false;
        this.recoilOffset = 0;
        this.recoilRot = 0;

        this.setWeapon(1);
    }

    // -----------------------------------------------------------------
    // 3D WEAPON BUILDERS (Procedural models matching reference image)
    // -----------------------------------------------------------------

    /**
     * Level 1: Badminton Racket / Fly Swatter
     */
    buildBadmintonRacket() {
        const root = new THREE.Group();
        const hoopMat = new THREE.MeshStandardMaterial({ color: 0x0099dd, metalness: 0.8, roughness: 0.25 });
        const shaftMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9, roughness: 0.2 });
        const gripMat = new THREE.MeshStandardMaterial({ color: 0x111618, roughness: 0.9 });
        const wrapMat = new THREE.MeshStandardMaterial({ color: 0x00ccaa, roughness: 0.6 });
        const stringMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 });

        // Grip handle
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.26, 10), gripMat);
        handle.position.y = -0.32;
        root.add(handle);

        const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 10), wrapMat);
        butt.position.y = -0.45;
        root.add(butt);

        for (let i = 0; i < 4; i++) {
            const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.015, 10), wrapMat);
            ring.position.y = -0.40 + i * 0.055;
            root.add(ring);
        }

        // Shaft & T-joint
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.42, 8), shaftMat);
        shaft.position.y = 0.01;
        root.add(shaft);

        const tJoint = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.009, 0.045, 8), hoopMat);
        tJoint.position.y = 0.22;
        root.add(tJoint);

        // Oval Head Frame
        const radiusA = 0.17;
        const radiusB = 0.24;
        const tubeRadius = 0.008;
        const frameGeo = new THREE.TorusGeometry(radiusA, tubeRadius, 10, 36);
        frameGeo.scale(1.0, radiusB / radiusA, 1.0);
        const frame = new THREE.Mesh(frameGeo, hoopMat);
        frame.position.y = 0.22 + radiusB;
        root.add(frame);

        // Clamped elliptical strings
        const stringLines = [];
        const numV = 16, numH = 20;
        for (let i = 1; i < numV; i++) {
            const x = -radiusA + (2 * radiusA * i) / numV;
            const normX = x / (radiusA - tubeRadius);
            if (Math.abs(normX) < 0.98) {
                const yMax = (radiusB - tubeRadius) * Math.sqrt(1 - normX * normX);
                stringLines.push(new THREE.Vector3(x, (0.22 + radiusB) - yMax, 0));
                stringLines.push(new THREE.Vector3(x, (0.22 + radiusB) + yMax, 0));
            }
        }
        for (let j = 1; j < numH; j++) {
            const y = -radiusB + (2 * radiusB * j) / numH;
            const normY = y / (radiusB - tubeRadius);
            if (Math.abs(normY) < 0.98) {
                const xMax = (radiusA - tubeRadius) * Math.sqrt(1 - normY * normY);
                stringLines.push(new THREE.Vector3(-xMax, 0.22 + radiusB + y, 0));
                stringLines.push(new THREE.Vector3(xMax, 0.22 + radiusB + y, 0));
            }
        }
        const stringMesh = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(stringLines), stringMat);
        root.add(stringMesh);

        // Swing Whoosh Trail
        const trailGeo = new THREE.RingGeometry(0.55, 0.85, 16, 1, 0, Math.PI * 0.7);
        const trailMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0, side: THREE.DoubleSide });
        const trail = new THREE.Mesh(trailGeo, trailMat);
        trail.position.set(-0.1, 0.2, -0.2);
        trail.rotation.set(0.4, 0.2, -0.6);
        root.add(trail);
        this.swingTrail = trail;

        root.position.set(0.32, -0.32, -0.52);
        root.rotation.set(-0.25, -0.35, 0.18);
        return root;
    }

    /**
     * Level 2: Tactical Handgun (Pistol)
     */
    buildPistol() {
        const root = new THREE.Group();
        const slideMat = new THREE.MeshStandardMaterial({ color: 0x22262a, metalness: 0.85, roughness: 0.25 });
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x14181a, metalness: 0.5, roughness: 0.6 });
        const sightMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa });

        // Grip & Body
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.075), frameMat);
        grip.position.set(0, -0.09, 0.03);
        grip.rotation.x = 0.2;
        root.add(grip);

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.045, 0.24), frameMat);
        body.position.set(0, 0, -0.04);
        root.add(body);

        const slide = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.048, 0.26), slideMat);
        slide.position.set(0, 0.04, -0.04);
        root.add(slide);
        this.pistolSlide = slide;

        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 8), slideMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.038, -0.17);
        root.add(barrel);

        const sight = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.01, 0.008), sightMat);
        sight.position.set(0, 0.07, -0.16);
        root.add(sight);

        root.position.set(0.24, -0.22, -0.45);
        return root;
    }

    /**
     * Level 3: MAC-10 / UZI Submachine Gun
     */
    buildMAC10() {
        const root = new THREE.Group();
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x202426, metalness: 0.8, roughness: 0.3 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x101314, metalness: 0.6, roughness: 0.5 });

        // Boxy Upper Receiver
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.08, 0.28), metalMat);
        receiver.position.set(0, 0.02, -0.05);
        root.add(receiver);

        // Extended straight magazine through grip
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.22, 0.065), darkMat);
        grip.position.set(0, -0.12, 0.0);
        grip.rotation.x = 0.08;
        root.add(grip);

        // Threaded Short Barrel
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.12, 8), metalMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.03, -0.24);
        root.add(barrel);

        // Top charging handle knob
        const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 6), metalMat);
        knob.position.set(0, 0.07, -0.06);
        root.add(knob);

        root.position.set(0.24, -0.22, -0.45);
        return root;
    }

    /**
     * Level 4: Pump Action Shotgun
     */
    buildShotgun() {
        const root = new THREE.Group();
        const steelMat = new THREE.MeshStandardMaterial({ color: 0x22282c, metalness: 0.85, roughness: 0.2 });
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x80381e, roughness: 0.7, metalness: 0.1 });

        // Long shotgun barrel
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.68, 8), steelMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.03, -0.34);
        root.add(barrel);

        // Under-barrel tubular magazine
        const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.52, 8), steelMat);
        magTube.rotation.x = Math.PI / 2;
        magTube.position.set(0, 0.0, -0.28);
        root.add(magTube);

        // Grooved wooden pump slide
        const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.18, 8), woodMat);
        pump.rotation.x = Math.PI / 2;
        pump.position.set(0, 0.0, -0.32);
        root.add(pump);
        this.shotgunPump = pump;

        // Receiver
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.075, 0.22), steelMat);
        receiver.position.set(0, 0.01, 0.05);
        root.add(receiver);

        // Ergonomic wooden buttstock
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.11, 0.32), woodMat);
        stock.position.set(0, -0.06, 0.30);
        stock.rotation.x = 0.14;
        root.add(stock);

        root.position.set(0.24, -0.24, -0.48);
        return root;
    }

    /**
     * Level 5: AK-47 Assault Rifle
     */
    buildAK47() {
        const root = new THREE.Group();
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a2f32, metalness: 0.8, roughness: 0.35 });
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x944018, roughness: 0.65, metalness: 0.15 });

        // Stamped steel receiver
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.082, 0.36), metalMat);
        receiver.position.set(0, 0, 0);
        root.add(receiver);

        // Wooden handguard
        const handguard = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.22, 8), woodMat);
        handguard.rotation.x = Math.PI / 2;
        handguard.position.set(0, 0.01, -0.28);
        root.add(handguard);

        // Long barrel & front sight post
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.014, 0.42, 8), metalMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.01, -0.56);
        root.add(barrel);

        const sightPost = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.04, 0.02), metalMat);
        sightPost.position.set(0, 0.05, -0.68);
        root.add(sightPost);

        // Curved "banana" magazine
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.24, 0.08), metalMat);
        mag.position.set(0, -0.14, -0.06);
        mag.rotation.x = 0.32;
        root.add(mag);

        // Wooden pistol grip & buttstock
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.13, 0.06), woodMat);
        grip.position.set(0, -0.10, 0.10);
        grip.rotation.x = 0.25;
        root.add(grip);

        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.32), woodMat);
        stock.position.set(0, -0.03, 0.32);
        stock.rotation.x = 0.08;
        root.add(stock);

        root.position.set(0.24, -0.24, -0.48);
        return root;
    }

    /**
     * Level 6: Heavy Squad Machine Gun (LMG)
     */
    buildLMG() {
        const root = new THREE.Group();
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x1d2124, metalness: 0.85, roughness: 0.3 });
        const boxMat = new THREE.MeshStandardMaterial({ color: 0x475338, roughness: 0.7, metalness: 0.3 }); // Olive ammo box

        // Heavy receiver with top carry handle
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.095, 0.45), metalMat);
        receiver.position.set(0, 0, 0);
        root.add(receiver);

        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 6, 12, Math.PI), metalMat);
        handle.position.set(0, 0.08, -0.10);
        handle.rotation.z = Math.PI;
        root.add(handle);

        // Heavy Fluted Barrel with Heat Shield
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.52, 8), metalMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.01, -0.48);
        root.add(barrel);

        // Olive-drab 100-round Ammo Box hanging below receiver
        const ammoBox = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.18, 0.16), boxMat);
        ammoBox.position.set(0.02, -0.16, -0.04);
        root.add(ammoBox);

        // Heavy skeletal stock
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.28), metalMat);
        stock.position.set(0, -0.02, 0.34);
        root.add(stock);

        root.position.set(0.24, -0.26, -0.52);
        return root;
    }

    /**
     * Level 7: Tactical High-Caliber Sniper Rifle (with Scope)
     */
    buildSniperRifle() {
        const root = new THREE.Group();
        const steelMat = new THREE.MeshStandardMaterial({ color: 0x181c1e, metalness: 0.9, roughness: 0.15 });
        const chassisMat = new THREE.MeshStandardMaterial({ color: 0x6e7774, metalness: 0.4, roughness: 0.6 });
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, metalness: 0.9, roughness: 0.1, emissive: 0x003333 });

        // Long Precision Barrel with Large Muzzle Brake
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.88, 8), steelMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.02, -0.58);
        root.add(barrel);

        const muzzleBrake = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.08), steelMat);
        muzzleBrake.position.set(0, 0.02, -1.04);
        root.add(muzzleBrake);

        // Receiver Chassis
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.075, 0.48), chassisMat);
        body.position.set(0, 0, 0.02);
        root.add(body);

        // Telescopic Optical Scope
        const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.36, 12), steelMat);
        scopeTube.rotation.x = Math.PI / 2;
        scopeTube.position.set(0, 0.085, -0.04);
        root.add(scopeTube);

        const scopeLens = new THREE.Mesh(new THREE.CircleGeometry(0.024, 12), glassMat);
        scopeLens.position.set(0, 0.085, -0.22);
        scopeLens.rotation.y = Math.PI;
        root.add(scopeLens);

        // Stock with Cheek-Rest Pad
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.12, 0.36), chassisMat);
        stock.position.set(0, -0.04, 0.42);
        root.add(stock);

        root.position.set(0.24, -0.24, -0.52);
        return root;
    }

    /**
     * Level 8: RPG-7 Rocket Launcher
     */
    buildRPG() {
        const root = new THREE.Group();
        const tubeMat = new THREE.MeshStandardMaterial({ color: 0x364332, metalness: 0.6, roughness: 0.4 });
        const gripMat = new THREE.MeshStandardMaterial({ color: 0x7a3a1d, roughness: 0.7 });
        const warheadMat = new THREE.MeshStandardMaterial({ color: 0x586b3e, roughness: 0.4, metalness: 0.3 });

        // Main cylindrical launcher tube
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.95, 12), tubeMat);
        tube.rotation.x = Math.PI / 2;
        tube.position.set(0, 0.04, -0.15);
        root.add(tube);

        // Rear cone exhaust nozzle
        const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.18, 12), tubeMat);
        nozzle.rotation.x = -Math.PI / 2;
        nozzle.position.set(0, 0.04, 0.40);
        root.add(nozzle);

        // Dual wood-finished grips
        const grip1 = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.14, 0.05), gripMat);
        grip1.position.set(0, -0.09, -0.08);
        root.add(grip1);

        const grip2 = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.14, 0.05), gripMat);
        grip2.position.set(0, -0.09, 0.16);
        root.add(grip2);

        // Iconic Conical Rocket Warhead seated in muzzle
        const warheadGroup = new THREE.Group();
        warheadGroup.position.set(0, 0.04, -0.68);

        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.18, 12), warheadMat);
        cone.rotation.x = -Math.PI / 2;
        cone.position.z = -0.12;
        warheadGroup.add(cone);

        const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.042, 0.16, 12), warheadMat);
        mid.rotation.x = Math.PI / 2;
        warheadGroup.add(mid);

        root.add(warheadGroup);
        this.rpgWarheadMesh = warheadGroup;

        root.position.set(0.24, -0.22, -0.48);
        return root;
    }

    /**
     * Switch equipped weapon (Level 1 to 8)
     */
    setWeapon(level) {
        if (!this.weapons[level]) return;
        this.currentLevel = level;
        this.currentWeapon = this.weapons[level];
        this.isReloading = false;
        this.lastFireTime = 0; // Ready to fire immediately upon equipping

        // Toggle mesh visibility
        for (let id = 1; id <= 8; id++) {
            if (this.meshes[id]) {
                this.meshes[id].visible = (id === level);
            }
        }

        // Show warhead if RPG has rocket loaded
        if (this.rpgWarheadMesh) {
            this.rpgWarheadMesh.visible = (this.currentWeapon.ammo > 0);
        }

        this.recoilOffset = 0;
        this.recoilRot = 0;
        this.swingProgress = 0;
        this.isSwinging = false;
        this.hasHitThisSwing = false;
    }

    /**
     * Primary attack trigger (swing, bullet fire, pellet blast, or rocket launch)
     */
    attack(flies = []) {
        const now = performance.now() / 1000.0;
        if (now - this.lastFireTime < this.currentWeapon.cooldown) {
            return { fired: false, reason: "cooldown" };
        }
        if (this.isReloading) {
            return { fired: false, reason: "reloading" };
        }

        if (this.currentWeapon.ammo <= 0) {
            soundSystem.playDryFire();
            this.reload();
            return { fired: false, reason: "empty" };
        }

        this.lastFireTime = now;

        const w = this.currentWeapon;

        // Level 1: Badminton Swat
        if (w.type === "melee") {
            this.isSwinging = true;
            this.swingProgress = 0.0;
            this.hasHitThisSwing = false;
            soundSystem.playSwatSwing();
            return this.checkMeleeHits(flies);
        }

        // Firearms consume ammo
        w.ammo--;

        // Level 2: Tactical Handgun
        if (w.type === "pistol") {
            soundSystem.playPistolShot();
            this.recoilOffset = 0.16;
            this.recoilRot = 0.20;
            return this.performHitscanShot(flies, 1, 0.002);
        }

        // Level 3: MAC-10 Rapid SMG
        if (w.type === "smg") {
            soundSystem.playSMGShot();
            this.recoilOffset = 0.09;
            this.recoilRot = 0.12;
            return this.performHitscanShot(flies, 1, 0.022); // slight spray spread
        }

        // Level 4: Pump Action Shotgun (8 buckshot pellets!)
        if (w.type === "shotgun") {
            soundSystem.playShotgunShot();
            this.recoilOffset = 0.26;
            this.recoilRot = 0.32;
            return this.performShotgunBlast(flies);
        }

        // Level 5: AK-47 Assault Rifle
        if (w.type === "rifle") {
            soundSystem.playAK47Shot();
            this.recoilOffset = 0.14;
            this.recoilRot = 0.18;
            return this.performHitscanShot(flies, 1, 0.012);
        }

        // Level 6: Heavy Squad LMG
        if (w.type === "lmg") {
            soundSystem.playLMGShot();
            this.recoilOffset = 0.13;
            this.recoilRot = 0.16;
            return this.performHitscanShot(flies, 1, 0.028);
        }

        // Level 7: High-Caliber Sniper Rifle
        if (w.type === "sniper") {
            soundSystem.playSniperShot();
            this.recoilOffset = 0.32;
            this.recoilRot = 0.38;
            return this.performHitscanShot(flies, 1, 0.0); // 100% pin-point precision
        }

        // Level 8: RPG-7 Rocket Launcher
        if (w.type === "rpg") {
            soundSystem.playRocketLaunch();
            this.recoilOffset = 0.22;
            this.recoilRot = 0.18;
            if (this.rpgWarheadMesh) this.rpgWarheadMesh.visible = false;
            return this.launchRocket(flies);
        }

        return { fired: false };
    }

    checkMeleeHits(flies) {
        if (this.hasHitThisSwing) return { fired: true, hit: false };

        const origin = new THREE.Vector3();
        this.camera.getWorldPosition(origin);
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);

        let hitFly = null;
        let closestDist = this.currentWeapon.range;

        flies.forEach(fly => {
            if (!fly.isAlive) return;
            const toFly = new THREE.Vector3().subVectors(fly.position, origin);
            const dist = toFly.length();

            if (dist <= this.currentWeapon.range) {
                const angle = forward.angleTo(toFly);
                if (angle < 1.35 && dist < closestDist) {
                    closestDist = dist;
                    hitFly = fly;
                }
            }
        });

        if (hitFly) {
            this.hasHitThisSwing = true;
            hitFly.kill(hitFly.position, forward.clone().multiplyScalar(22.0));
            return { fired: true, hit: true, fly: hitFly };
        }

        return { fired: true, hit: false };
    }

    /**
     * Hitscan raycast shot with optional spread
     */
    performHitscanShot(flies, damage = 1, spread = 0.0) {
        const origin = new THREE.Vector3();
        this.camera.getWorldPosition(origin);
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);

        // Apply spread deviation
        if (spread > 0) {
            forward.x += (Math.random() - 0.5) * spread;
            forward.y += (Math.random() - 0.5) * spread;
            forward.z += (Math.random() - 0.5) * spread;
            forward.normalize();
        }

        // Flash light
        this.flashMuzzle(origin, forward);

        let hitFly = null;
        let closestDist = this.currentWeapon.range;

        flies.forEach(fly => {
            if (!fly.isAlive) return;
            const toFly = new THREE.Vector3().subVectors(fly.position, origin);
            const projDist = toFly.dot(forward);

            if (projDist > 0 && projDist < this.currentWeapon.range) {
                const closestPoint = origin.clone().addScaledVector(forward, projDist);
                const perpDist = fly.position.distanceTo(closestPoint);
                const tolerance = fly.hitRadius + this.currentWeapon.hitRadius;

                if (perpDist <= tolerance && projDist < closestDist) {
                    closestDist = projDist;
                    hitFly = fly;
                }
            }
        });

        this.spawnTracer(origin, forward, (hitFly ? closestDist : this.currentWeapon.range));

        if (hitFly) {
            hitFly.kill(hitFly.position, forward.clone().multiplyScalar(28.0));
            return { fired: true, hit: true, fly: hitFly };
        }

        return { fired: true, hit: false };
    }

    /**
     * Shotgun blast: fires 8 simultaneous buckshot pellets in a conical spread!
     */
    performShotgunBlast(flies) {
        const origin = new THREE.Vector3();
        this.camera.getWorldPosition(origin);
        const baseForward = new THREE.Vector3();
        this.camera.getWorldDirection(baseForward);

        this.flashMuzzle(origin, baseForward);

        let hitAnyFly = false;
        const pellets = 8;
        const spreadRadius = 0.085;

        for (let p = 0; p < pellets; p++) {
            const forward = baseForward.clone();
            forward.x += (Math.random() - 0.5) * spreadRadius;
            forward.y += (Math.random() - 0.5) * spreadRadius;
            forward.z += (Math.random() - 0.5) * spreadRadius;
            forward.normalize();

            let pelletHitFly = null;
            let closestDist = this.currentWeapon.range;

            flies.forEach(fly => {
                if (!fly.isAlive) return;
                const toFly = new THREE.Vector3().subVectors(fly.position, origin);
                const projDist = toFly.dot(forward);

                if (projDist > 0 && projDist < this.currentWeapon.range) {
                    const closestPoint = origin.clone().addScaledVector(forward, projDist);
                    const perpDist = fly.position.distanceTo(closestPoint);
                    if (perpDist <= (fly.hitRadius + this.currentWeapon.hitRadius) && projDist < closestDist) {
                        closestDist = projDist;
                        pelletHitFly = fly;
                    }
                }
            });

            this.spawnTracer(origin, forward, (pelletHitFly ? closestDist : 35.0), 0xffaa33);

            if (pelletHitFly) {
                pelletHitFly.kill(pelletHitFly.position, forward.clone().multiplyScalar(30.0));
                hitAnyFly = true;
                if (window.gameInstance) {
                    window.gameInstance.hitsLanded++;
                    window.gameInstance.onFlyKilled(pelletHitFly);
                    window.gameInstance.showHitmarker();
                }
            }
        }

        return { fired: true, hit: hitAnyFly };
    }

    /**
     * Level 8 RPG Rocket Launch
     */
    launchRocket(flies) {
        const origin = new THREE.Vector3();
        this.camera.getWorldPosition(origin);
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);

        // Spawn 3D flying rocket mesh
        const rocket = this.createRocketEntity(origin.clone().addScaledVector(forward, 0.8), forward);
        this.activeRockets.push(rocket);

        return { fired: true, hit: false };
    }

    createRocketEntity(pos, dir) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x586b3e, roughness: 0.4 });
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.18, 8), mat);
        cone.rotation.x = -Math.PI / 2;
        group.add(cone);

        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.28, 8), mat);
        body.rotation.x = Math.PI / 2;
        body.position.z = 0.14;
        group.add(body);

        group.position.copy(pos);
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);

        this.scene.add(group);

        return {
            mesh: group,
            position: pos,
            velocity: dir.clone().multiplyScalar(35.0), // 35 m/s high velocity rocket
            lifetime: 4.0
        };
    }

    detonateRocket(rocket, flies) {
        soundSystem.playRocketExplosion();

        const blastRadius = 12.0; // Huge 12m AOE blast radius!
        const blastCenter = rocket.position;

        // Visual Explosion Fireball Sphere
        const explGeo = new THREE.SphereGeometry(2.5, 12, 12);
        const explMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.95 });
        const explMesh = new THREE.Mesh(explGeo, explMat);
        explMesh.position.copy(blastCenter);
        this.scene.add(explMesh);

        // Animate explosion sphere expanding & fading
        let expElapsed = 0;
        const animateExp = () => {
            expElapsed += 0.025;
            const scale = 1.0 + expElapsed * 4.5;
            explMesh.scale.set(scale, scale, scale);
            explMat.opacity = Math.max(0, 0.95 - expElapsed * 2.2);

            if (expElapsed < 0.45) {
                requestAnimationFrame(animateExp);
            } else {
                this.scene.remove(explMesh);
                explGeo.dispose();
                explMat.dispose();
            }
        };
        requestAnimationFrame(animateExp);

        // Squash all flies caught within the 12m blast wave
        let killedCount = 0;
        flies.forEach(fly => {
            if (!fly.isAlive) return;
            const dist = fly.position.distanceTo(blastCenter);
            if (dist <= blastRadius) {
                const impulse = new THREE.Vector3().subVectors(fly.position, blastCenter).normalize().multiplyScalar(35.0);
                fly.kill(fly.position, impulse);
                killedCount++;
                if (window.gameInstance) {
                    window.gameInstance.hitsLanded++;
                    window.gameInstance.onFlyKilled(fly);
                }
            }
        });

        if (killedCount > 0 && window.gameInstance) {
            window.gameInstance.showHitmarker();
        }

        // Cleanup rocket mesh
        this.scene.remove(rocket.mesh);
    }

    flashMuzzle(origin, forward) {
        this.muzzleLight.position.copy(origin).addScaledVector(forward, 0.7);
        this.muzzleLight.intensity = 4.0;
        setTimeout(() => { this.muzzleLight.intensity = 0; }, 40);
    }

    spawnTracer(origin, forward, maxDistance, color = 0xffea78) {
        const tracerGeo = new THREE.BufferGeometry();
        const start = origin.clone().addScaledVector(forward, 0.5);
        const end = origin.clone().addScaledVector(forward, maxDistance);
        tracerGeo.setFromPoints([start, end]);

        const tracerMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
        const line = new THREE.Line(tracerGeo, tracerMat);
        this.scene.add(line);

        setTimeout(() => {
            this.scene.remove(line);
            tracerGeo.dispose();
            tracerMat.dispose();
        }, 32);
    }

    reload() {
        if (this.currentWeapon.ammo >= this.currentWeapon.maxAmmo || this.isReloading) return;
        this.isReloading = true;
        this.reloadTimer = this.currentWeapon.reloadTime;
        soundSystem.playReload();
    }

    setAiming(isAiming) {
        this.isAiming = isAiming;

        // Toggle sniper telescopic scope HUD overlay
        const scopeElem = document.getElementById('sniperScopeOverlay');
        if (scopeElem) {
            scopeElem.style.display = (this.isAiming && this.currentLevel === 7) ? 'flex' : 'none';
        }
    }

    /**
     * Updates weapon position, swing animations, ADS zooms, and in-flight rockets
     */
    update(dt, flies = []) {
        // Reload timer
        if (this.isReloading) {
            this.reloadTimer -= dt;
            if (this.reloadTimer <= 0) {
                this.isReloading = false;
                this.currentWeapon.ammo = this.currentWeapon.maxAmmo;
                if (this.currentLevel === 8 && this.rpgWarheadMesh) {
                    this.rpgWarheadMesh.visible = true;
                }
            }
        }

        // Aim-down-sights smooth interpolation
        const targetAim = this.isAiming ? 1.0 : 0.0;
        this.aimProgress += (targetAim - this.aimProgress) * Math.min(1.0, 14.0 * dt);

        // Adjust camera FOV for 4x sniper scope zoom (only update projection matrix when FOV changes!)
        const targetFOV = (this.currentLevel === 7 && this.isAiming) ? 25.0 : 75.0;
        if (Math.abs(this.camera.fov - targetFOV) > 0.02) {
            this.camera.fov += (targetFOV - this.camera.fov) * Math.min(1.0, 16.0 * dt);
            if (Math.abs(this.camera.fov - targetFOV) <= 0.02) this.camera.fov = targetFOV;
            this.camera.updateProjectionMatrix();
        }

        // Recoil decay
        this.recoilOffset *= Math.exp(-22.0 * dt);
        this.recoilRot *= Math.exp(-20.0 * dt);

        // Update active in-flight RPG rockets
        for (let r = this.activeRockets.length - 1; r >= 0; r--) {
            const rocket = this.activeRockets[r];
            rocket.lifetime -= dt;
            rocket.position.addScaledVector(rocket.velocity, dt);
            rocket.mesh.position.copy(rocket.position);

            // Check collision with ground or flies
            let exploded = false;
            if (rocket.position.y <= 0.3 || rocket.lifetime <= 0) {
                exploded = true;
            } else {
                for (let f = 0; f < flies.length; f++) {
                    if (flies[f].isAlive && rocket.position.distanceTo(flies[f].position) < 1.5) {
                        exploded = true;
                        break;
                    }
                }
            }

            if (exploded) {
                this.detonateRocket(rocket, flies);
                this.activeRockets.splice(r, 1);
            }
        }

        // -------------------------------------------------------------
        // Level 1: Badminton Racket Swing Arc
        // -------------------------------------------------------------
        if (this.currentLevel === 1) {
            const basePos = new THREE.Vector3(0.32, -0.32, -0.52);
            const baseRot = new THREE.Vector3(-0.25, -0.35, 0.18);

            if (this.isSwinging) {
                this.swingProgress += dt * 3.8;

                if (!this.hasHitThisSwing && this.swingProgress >= 0.15 && this.swingProgress <= 0.85) {
                    const hitResult = this.checkMeleeHits(flies);
                    if (hitResult.hit && window.gameInstance) {
                        window.gameInstance.hitsLanded++;
                        window.gameInstance.onFlyKilled(hitResult.fly);
                        window.gameInstance.showHitmarker();
                    }
                }

                if (this.swingProgress < 0.25) {
                    const p = this.swingProgress / 0.25;
                    this.meshes[1].position.set(basePos.x + 0.14 * p, basePos.y + 0.18 * p, basePos.z + 0.08 * p);
                    this.meshes[1].rotation.set(baseRot.x + 0.45 * p, baseRot.y + 0.40 * p, baseRot.z + 0.35 * p);
                } else if (this.swingProgress < 0.70) {
                    const p = (this.swingProgress - 0.25) / 0.45;
                    const easeP = Math.sin(p * Math.PI * 0.5);
                    this.meshes[1].position.set((basePos.x + 0.14) - 0.78 * easeP, (basePos.y + 0.18) - 0.12 * easeP, (basePos.z + 0.08) - 0.32 * Math.sin(p * Math.PI));
                    this.meshes[1].rotation.set((baseRot.x + 0.45) - 1.15 * easeP, (baseRot.y + 0.40) - 1.85 * easeP, (baseRot.z + 0.35) - 1.45 * easeP);
                    if (this.swingTrail) this.swingTrail.material.opacity = 0.55 * Math.sin(p * Math.PI);
                } else if (this.swingProgress < 1.0) {
                    const p = (this.swingProgress - 0.70) / 0.30;
                    this.meshes[1].position.lerpVectors(new THREE.Vector3(basePos.x - 0.64, basePos.y + 0.06, basePos.z), basePos, p);
                    this.meshes[1].rotation.set(THREE.MathUtils.lerp(baseRot.x - 0.7, baseRot.x, p), THREE.MathUtils.lerp(baseRot.y - 1.45, baseRot.y, p), THREE.MathUtils.lerp(baseRot.z - 1.1, baseRot.z, p));
                    if (this.swingTrail) this.swingTrail.material.opacity = 0;
                } else {
                    this.isSwinging = false;
                    this.swingProgress = 0;
                    this.hasHitThisSwing = false;
                    this.meshes[1].position.copy(basePos);
                    this.meshes[1].rotation.set(baseRot.x, baseRot.y, baseRot.z);
                    if (this.swingTrail) this.swingTrail.material.opacity = 0;
                }
            } else {
                this.meshes[1].position.copy(basePos);
                this.meshes[1].rotation.set(baseRot.x, baseRot.y, baseRot.z);
            }
            return;
        }

        // -------------------------------------------------------------
        // Firearms (Levels 2 - 8) ADS & Recoil
        // -------------------------------------------------------------
        const currentMesh = this.meshes[this.currentLevel];
        if (!currentMesh) return;

        const hipPos = new THREE.Vector3(0.24, -0.24, -0.48);
        const adsPos = new THREE.Vector3(0.0, -0.16, -0.38);
        const currentPos = hipPos.clone().lerp(adsPos, this.aimProgress);

        currentPos.z += this.recoilOffset;
        currentPos.y += this.recoilOffset * 0.35;

        currentMesh.position.copy(currentPos);
        currentMesh.rotation.set(this.recoilRot, 0, (Math.random() - 0.5) * this.recoilRot * 0.25);
    }

    getThreatInfo() {
        const origin = new THREE.Vector3();
        this.camera.getWorldPosition(origin);
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);

        let threatVel = forward.clone().multiplyScalar(0.4);
        if (this.isSwinging) {
            threatVel = forward.clone().multiplyScalar(6.5);
        }

        return {
            position: origin,
            velocity: threatVel,
            radius: this.currentWeapon ? this.currentWeapon.threatWidth : 0.3
        };
    }
}
