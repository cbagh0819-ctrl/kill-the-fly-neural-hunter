/**
 * Game.js
 * Core Controller for "KILL THE FLY".
 * Manages Three.js scene, PointerLock FPS player locomotion, levels progression,
 * fly spawning and AI updates, weapons, collisions, and HUD integration.
 */

class GameEngine {
    constructor() {
        this.container = document.getElementById('gameContainer');
        this.level = 1;
        this.maxLevel = 8;
        this.fliesKilledThisLevel = 0;
        this.totalKills = 0;
        this.shotsFired = 0;
        this.hitsLanded = 0;
        this.startTime = 0;
        this.isGameOver = false;
        this.isPaused = false;
        this.isEndless = false;
        this.weaponHudTimer = 0;

        // Level requirements: target kills per level
        this.levelGoals = {
            1: 3,  // Badminton Racket
            2: 5,  // Tactical Pistol
            3: 7,  // MAC-10 SMG
            4: 8,  // Pump Action Shotgun
            5: 10, // AK-47 Rifle
            6: 12, // Heavy Squad LMG
            7: 10, // Tactical Sniper Rifle
            8: 15  // RPG-7 Rocket Launcher
        };

        // Active flies array
        this.flies = [];
        this.flyIdCounter = 1;

        // Input state
        this.keys = {};
        this.mouse = { x: 0, y: 0, isDown: false, rightDown: false };
        this.isPointerLocked = false;
        this.fpsFrames = 0;
        this.fpsTimer = 0;
        this.currentFps = 60;

        // Player physics
        this.player = {
            position: new THREE.Vector3(0, 1.7, 0),
            velocity: new THREE.Vector3(),
            speed: 7.0,
            sprintSpeed: 11.5,
            jumpVelocity: 7.5,
            isGrounded: false,
            pitch: 0,
            yaw: 0,
            height: 1.7,
            radius: 0.65, // Solid player collision cylinder
            bobbingTimer: 0,
            maxHealth: 100,
            health: 100,
            isDead: false
        };

        // Platform Play Modes: 'windows' (Desktop PC) or 'android' (Mobile Phone Landscape)
        const isLikelyMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.innerWidth <= 1024) || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
        const savedMode = localStorage.getItem('ktf_game_mode');
        this.gameMode = 'android';
        this.isTouchDevice = true; this.isMobileActive = true; this.isPointerLocked = true;
        this.isOrientationBlocked = false;

        // Initialize Three.js
        this.initThree();
        this.initEnvironment();
        this.initWeapons();
        this.initMagic();
        this.initNeuralHUD();
        this.setupEventListeners();
        this.setupUI();
        this.setupMobileControls();

        // Pre-compile all WebGL shaders up front to eliminate first-frame or mid-game shader stutter
        try {
            this.renderer.compile(this.scene, this.camera);
        } catch (e) {}

        // Level 1 launch
        this.startLevel(1);

        // Apply initial mode configuration
        this.setPlatformMode(this.gameMode, false);

        // Listen for orientation and viewport changes
        window.addEventListener('resize', () => this.checkOrientation());
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.checkOrientation(), 250);
        });

        // Game Loop
        this.clock = new THREE.Clock();
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    initThree() {
        // Scene
        this.scene = new THREE.Scene();

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            300
        );
        this.camera.position.set(0, this.player.height, 0);
        this.scene.add(this.camera);

        // Head-Mounted Torch / Flashlight (Keep visible=true permanently with intensity=0 when off to prevent WebGL shader recompile stalls!)
        this.flashlightOn = false;
        this.flashlight = new THREE.SpotLight(0xfff6df, 0, 65, Math.PI / 6.0, 0.42, 1.1);
        this.flashlight.position.set(0, 0, 0);
        this.flashlight.visible = true;
        this.flashlight.castShadow = false;
        this.camera.add(this.flashlight);

        // Near-field subtle ambient bulb on the headgear
        this.flashlightBulb = new THREE.PointLight(0xffeed0, 0, 6.0, 2.0);
        this.flashlightBulb.position.set(0, 0, 0);
        this.flashlightBulb.visible = true;
        this.camera.add(this.flashlightBulb);

        // Beam target placed in front of camera in world space
        this.flashlightTarget = new THREE.Object3D();
        this.flashlightTarget.position.set(0, 0, -25);
        this.scene.add(this.flashlightTarget);
        this.flashlight.target = this.flashlightTarget;

        // Renderer - Locked 1.0 pixel ratio & disabled stencil/MSAA for rock-solid 60+ FPS on all GPUs & Android WebViews
        this.renderer = new THREE.WebGLRenderer({
            antialias: false,
            powerPreference: 'high-performance',
            stencil: false,
            depth: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(1.0);
        this.renderer.shadowMap.enabled = false; // Disable heavy multi-pass shadow cascades
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.25;

        this.container.appendChild(this.renderer.domElement);

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    initEnvironment() {
        this.forest = new ForestEnvironment(this.scene);
    }

    initWeapons() {
        this.weaponManager = new WeaponManager(this.camera, this.scene);
    }

    initMagic() {
        this.magicManager = new MagicManager(this.camera, this.scene, this);
    }

    initNeuralHUD() {
        this.neuralHUD = new NeuralHUD();
    }

    setupEventListeners() {
        // Pointer Lock & Audio resume on click
        document.addEventListener('click', (e) => {
            if (this.isGameOver || this.player.isDead) return;
            soundSystem.init();
            soundSystem.resume();

            // Ignore click if clicking interactive UI buttons
            if (e.target.closest('#hudContainer') && !e.target.closest('#centerCrosshair')) {
                if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
            }

            // NEVER request pointer lock on Android / Phone mode (prevents Chrome mouse capture toast)
            if (this.gameMode === 'windows' && !this.isPointerLocked) {
                try {
                    const lockPromise = document.body.requestPointerLock();
                    if (lockPromise && lockPromise.catch) {
                        lockPromise.catch(() => {});
                    }
                } catch (err) {}
            }
        });

        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = (document.pointerLockElement === document.body);
            const overlay = document.getElementById('pauseOverlay');
            if (overlay && !this.player.isDead) {
                overlay.style.display = this.isPointerLocked ? 'none' : 'flex';
            }
        });

        // Mouse look
        document.addEventListener('mousemove', (e) => {
            if (!this.isPointerLocked || this.player.isDead) return;
            const sensitivity = 0.0022;
            this.player.yaw -= e.movementX * sensitivity;
            this.player.pitch -= e.movementY * sensitivity;

            // Clamp vertical pitch to avoid backflips
            const maxPitch = Math.PI / 2 - 0.08;
            this.player.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.player.pitch));
        });

        // Mouse buttons (attack & ADS)
        document.addEventListener('mousedown', (e) => {
            if (!this.isPointerLocked || this.player.isDead) return;
            if (e.button === 0) {
                this.mouse.isDown = true;
                this.handleAttack();
            } else if (e.button === 2) {
                this.mouse.rightDown = true;
                this.weaponManager.setAiming(true);
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this.mouse.isDown = false;
            } else if (e.button === 2) {
                this.mouse.rightDown = false;
                this.weaponManager.setAiming(false);
            }
        });

        // Disable context menu on right click
        document.addEventListener('contextmenu', (e) => e.preventDefault());

        // Keyboard inputs
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;

            if (e.code === 'KeyR') {
                this.toggleRain();
            } else if (e.code === 'KeyT') {
                this.weaponManager.reload();
            } else if (e.code === 'KeyM') {
                const muted = soundSystem.toggleMute();
                this.showNotification(muted ? "AUDIO MUTED" : "AUDIO UNMUTED");
            } else if (e.code === 'KeyF') {
                this.toggleFlashlight();
            } else if (e.code === 'KeyN') {
                this.toggleDayNight();
            }

            // Weapon selection uses 1-8; Z/X/C/V/B cast spells after they unlock.
            if (e.code === 'KeyZ') {
                this.magicManager.castSpell(1);
            } else if (e.code === 'KeyX') {
                this.magicManager.castSpell(2);
            } else if (e.code === 'KeyC') {
                this.magicManager.castSpell(3);
            } else if (e.code === 'KeyV') {
                this.magicManager.castSpell(4);
            } else if (e.code === 'KeyB') {
                this.magicManager.castSpell(5);
            } else if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' ||
                       e.code === 'Digit4' || e.code === 'Digit5' || e.code === 'Digit6' ||
                       e.code === 'Digit7' || e.code === 'Digit8' ||
                       e.code === 'Numpad1' || e.code === 'Numpad2' || e.code === 'Numpad3' ||
                       e.code === 'Numpad4' || e.code === 'Numpad5' || e.code === 'Numpad6' ||
                       e.code === 'Numpad7' || e.code === 'Numpad8') {
                const num = parseInt(e.code.replace('Digit', '').replace('Numpad', ''));
                if (this.level >= num || this.isEndless) {
                    this.weaponManager.setWeapon(num);
                    this.updateWeaponHUD();
                }
            }
        });

        // Mouse scroll wheel to cycle through unlocked weapons
        document.addEventListener('wheel', (e) => {
            if (!this.isPointerLocked) return;
            const maxUnlocked = this.isEndless ? 8 : this.level;
            let next = this.weaponManager.currentLevel + (e.deltaY > 0 ? 1 : -1);
            if (next < 1) next = maxUnlocked;
            if (next > maxUnlocked) next = 1;
            this.weaponManager.setWeapon(next);
            this.updateWeaponHUD();
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
    }

    setupUI() {
        // Buttons & Mode Selectors
        const resumeBtn = document.getElementById('resumeBtn');
        if (resumeBtn) {
            const handleResume = (e) => {
                e.stopPropagation();
                soundSystem.init();
                soundSystem.resume();
                const overlay = document.getElementById('pauseOverlay');
                if (overlay) overlay.style.display = 'none';
                if (this.gameMode === 'android') {
                    this.isMobileActive = true;
                    this.isPointerLocked = true;
                    this.checkOrientation();
                } else {
                    this.isMobileActive = false;
                    try {
                        const p = document.body.requestPointerLock();
                        if (p && p.catch) p.catch(() => {});
                    } catch (_) {}
                }
                this.updateMobileWeaponBar();
            };
            resumeBtn.addEventListener('click', handleResume);
            resumeBtn.addEventListener('touchstart', handleResume, { passive: false });
        }

        // --- Option 1: Play in Windows Button ---
        const winBtn = document.getElementById('launchWindowsBtn');
        if (winBtn) {
            winBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.setPlatformMode('windows', true);
            });
        }
        const cardWin = document.getElementById('modeCardWindows');
        if (cardWin) {
            cardWin.addEventListener('click', (e) => {
                if (e.target.tagName !== 'BUTTON') {
                    this.setPlatformMode('windows', false);
                }
            });
        }

        // --- Option 2: Play in Android Phones Button ---
        const andBtn = document.getElementById('launchAndroidBtn');
        if (andBtn) {
            const handleAndroidLaunch = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.setPlatformMode('android', true);
            };
            andBtn.addEventListener('click', handleAndroidLaunch);
            andBtn.addEventListener('touchstart', handleAndroidLaunch, { passive: false });
        }
        const cardAnd = document.getElementById('modeCardAndroid');
        if (cardAnd) {
            cardAnd.addEventListener('click', (e) => {
                if (e.target.tagName !== 'BUTTON') {
                    this.setPlatformMode('android', false);
                }
            });
        }

        // --- Force Fullscreen Landscape Button from Blocker ---
        const forceBtn = document.getElementById('forceLandscapeBtn');
        if (forceBtn) {
            const handleForceLandscape = (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                    if (document.documentElement.requestFullscreen) {
                        document.documentElement.requestFullscreen().catch(() => {});
                    }
                    if (screen.orientation && screen.orientation.lock) {
                        screen.orientation.lock('landscape').catch(() => {});
                    }
                } catch (_) {}
                setTimeout(() => this.checkOrientation(), 250);
            };
            forceBtn.addEventListener('click', handleForceLandscape);
            forceBtn.addEventListener('touchstart', handleForceLandscape, { passive: false });
        }

        // --- Switch to Windows from Blocker ---
        const switchFromBlocker = document.getElementById('switchToWindowsFromBlocker');
        if (switchFromBlocker) {
            switchFromBlocker.addEventListener('click', (e) => {
                e.stopPropagation();
                this.setPlatformMode('windows', true);
            });
        }

        // --- Mobile Top Bar Quick Switch Mode Pill ---
        const mobileModeSwitchBtn = document.getElementById('mobileModeSwitchBtn');
        if (mobileModeSwitchBtn) {
            mobileModeSwitchBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleMobilePause();
            }, { passive: false });
        }

        const restartBtn = document.getElementById('restartBtn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                this.restartGame();
            });
        }

        const endlessBtn = document.getElementById('endlessBtn');
        if (endlessBtn) {
            endlessBtn.addEventListener('click', () => {
                this.startEndlessMode();
            });
        }

        // Flashlight & Day/Night Toggle Buttons
        const torchBtn = document.getElementById('hudTorchBtn');
        if (torchBtn) {
            torchBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleFlashlight();
            });
        }

        const dayNightBtn = document.getElementById('hudDayNightBtn');
        if (dayNightBtn) {
            dayNightBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDayNight();
            });
        }

        const rainBtn = document.getElementById('hudRainBtn');
        if (rainBtn) {
            rainBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleRain();
            });
        }

        this.updateTorchHUD();
        this.updateDayNightHUD();
        this.updateRainHUD();

        // Magic Hotbar Slot Clicks
        for (let s = 1; s <= 5; s++) {
            const slot = document.getElementById(`magicSlot${s}`);
            if (slot) {
                slot.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.magicManager.castSpell(s);
                });
            }
        }

        // YOU DIED modal buttons
        const deathPlayAgainBtn = document.getElementById('deathPlayAgainBtn');
        if (deathPlayAgainBtn) {
            deathPlayAgainBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.restartFromLevelOne();
            });
        }

        const deathExitBtn = document.getElementById('deathExitBtn');
        if (deathExitBtn) {
            deathExitBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const deathOverlay = document.getElementById('deathOverlay');
                if (deathOverlay) deathOverlay.style.display = 'none';
                const pauseOverlay = document.getElementById('pauseOverlay');
                if (pauseOverlay) pauseOverlay.style.display = 'flex';
            });
        }
    }

    handleAttack() {
        this.shotsFired++;
        const result = this.weaponManager.attack(this.flies);

        if (result && result.fired) {
            if (result.hit) {
                this.hitsLanded++;
                this.onFlyKilled(result.fly);
                this.showHitmarker();
            }
        }
        this.updateWeaponHUD();
    }

    showHitmarker() {
        const hm = document.getElementById('hitmarker');
        if (hm) {
            hm.classList.remove('active');
            void hm.offsetWidth; // Trigger reflow
            hm.classList.add('active');
        }
    }

    onFlyKilled(fly) {
        this.fliesKilledThisLevel++;
        this.totalKills++;
        this.updateSwarmRage();

        // Remove from active list
        const idx = this.flies.indexOf(fly);
        if (idx !== -1) {
            this.flies.splice(idx, 1);
        }

        this.updateStatsHUD();

        // Check level completion
        const goal = this.levelGoals[this.level] || 10;
        if (this.fliesKilledThisLevel >= goal && !this.isEndless) {
            if (this.level < this.maxLevel) {
                this.advanceToLevel(this.level + 1);
            } else {
                this.triggerVictory();
            }
        } else {
            // Maintain active population across the forest map
            const minFlies = Math.min(14, 6 + this.level);
            if (this.flies.length < minFlies) {
                setTimeout(() => this.spawnFly(false), 300);
            }
        }
    }

    startLevel(lvl) {
        this.level = lvl;
        this.fliesKilledThisLevel = 0;
        this.startTime = performance.now();

        // Restore operative health
        this.player.health = this.player.maxHealth;
        this.player.isDead = false;
        this.updateHealthHUD();

        // Clear existing flies
        this.flies.forEach(f => f.destroy());
        this.flies = [];

        // Equip matching weapon for level
        this.weaponManager.setWeapon(lvl);
        this.updateWeaponHUD();
        this.updateStatsHUD();

        if (this.magicManager) {
            this.magicManager.updateHUD();
        }
        if (lvl === 2) {
            this.showNotification("âœ¨ MAGIC UNLOCKED! KEYS [Z][X][C][V][B] CAST SPELLS!");
        }

        // 8-Level Mission Briefings
        const levelData = {
            1: { title: "LEVEL 1: WOODLAND CANOPY", weapon: "BADMINTON RACKET", note: "SQUASH 3 DROSOPHILA FLIES (MELEE)" },
            2: { title: "LEVEL 2: PINE THICKET", weapon: "TACTICAL HANDGUN", note: "âœ¨ MAGIC UNLOCKED! CAST SPELLS WITH [Z][X][C][V][B]" },
            3: { title: "LEVEL 3: BRAMBLE HOLLOW", weapon: "MAC-10 SUBMACHINE GUN", note: "SPRAY 7 HIGH-SPEED DROSOPHILA" },
            4: { title: "LEVEL 4: MIST VALLEY", weapon: "PUMP ACTION SHOTGUN", note: "BUCKSHOT 8 SCATTERING FLIES" },
            5: { title: "LEVEL 5: DEEP FOREST", weapon: "AK-47 ASSAULT RIFLE", note: "HUNT 10 ELUSIVE FRUIT FLIES" },
            6: { title: "LEVEL 6: OLD LUMBER MILL", weapon: "HEAVY SQUAD LMG", note: "SUPPRESS 12 ERRATIC SWARM FLIES" },
            7: { title: "LEVEL 7: EAGLE'S RIDGE", weapon: "TACTICAL SNIPER RIFLE", note: "SNIPE 10 LONG-RANGE FLIES (4X SCOPE)" },
            8: { title: "LEVEL 8: THE HIVE CORE", weapon: "RPG-7 ROCKET LAUNCHER", note: "OBLITERATE 15 SUPER-SONIC MUTANT FLIES!" }
        };

        const data = levelData[lvl] || levelData[8];
        let goal = this.levelGoals[lvl];
        this.showLevelBanner(data.title, `WEAPON: ${data.weapon} | GOAL: ${goal} FLIES`);

        // Spawn initial population of fruit flies scattered across the entire forest map
        const count = Math.min(16, 7 + lvl);
        for (let i = 0; i < count; i++) {
            // First 2 flies in forward clearings (10-15m), rest roaming across whole map
            this.spawnFly(i < 2);
        }
    }

    advanceToLevel(nextLvl) {
        soundSystem.playVictoryFanfare();
        this.showNotification(`LEVEL ${this.level} COMPLETE! ADVANCING TO LEVEL ${nextLvl}...`);
        setTimeout(() => {
            this.startLevel(nextLvl);
        }, 2200);
    }

    spawnFly(initialSightline = false) {
        const lvl = this.level;

        // Progressive difficulty: Each level flies are faster, more erratic, and dodge earlier!
        const configTable = {
            1: { threshold: -46.0, sensitivity: 1.00, dodgeAgility: 0.95, maxSpeed: 7.5,  hoverSpeed: 3.5, chaosFactor: 1.0,  scale: 0.85, refractory: 90 },
            2: { threshold: -49.0, sensitivity: 1.25, dodgeAgility: 1.20, maxSpeed: 9.0,  hoverSpeed: 4.2, chaosFactor: 1.3,  scale: 0.80, refractory: 80 },
            3: { threshold: -52.0, sensitivity: 1.45, dodgeAgility: 1.40, maxSpeed: 10.5, hoverSpeed: 5.0, chaosFactor: 1.6,  scale: 0.75, refractory: 70 },
            4: { threshold: -55.0, sensitivity: 1.65, dodgeAgility: 1.60, maxSpeed: 12.0, hoverSpeed: 5.8, chaosFactor: 1.9,  scale: 0.70, refractory: 60 },
            5: { threshold: -58.0, sensitivity: 1.85, dodgeAgility: 1.85, maxSpeed: 13.5, hoverSpeed: 6.6, chaosFactor: 2.2,  scale: 0.65, refractory: 50 },
            6: { threshold: -61.0, sensitivity: 2.10, dodgeAgility: 2.10, maxSpeed: 15.0, hoverSpeed: 7.4, chaosFactor: 2.5,  scale: 0.62, refractory: 40 },
            7: { threshold: -64.0, sensitivity: 2.35, dodgeAgility: 2.35, maxSpeed: 16.5, hoverSpeed: 8.2, chaosFactor: 2.8,  scale: 0.58, refractory: 32 },
            8: { threshold: -67.0, sensitivity: 2.65, dodgeAgility: 2.65, maxSpeed: 18.5, hoverSpeed: 9.2, chaosFactor: 3.3,  scale: 0.54, refractory: 22 }
        };

        const baseConfig = configTable[lvl] || configTable[8];

        // Kills raise the swarm's rage throughout the run, in addition to level scaling.
        const rageTier = Math.min(8, Math.floor(this.totalKills / 2));
        const rage = Math.min(1, this.totalKills / 16);
        const attackDamage = 10 + (lvl - 1) * 5 + rageTier * 2;
        const diveSpeed = 12.5 + lvl * 1.2 + rageTier * 0.55;
        const stalkTimeScale = 1 - rage * 0.35;
        const attackCooldown = Math.max(0.65, 1.6 - rageTier * 0.1);

        let angryRatio;
        let minAngryWanted;
        if (lvl === 1) {
            angryRatio = 0.20;
            minAngryWanted = 1;
        } else if (lvl === 2) {
            // Level 2: Substantially INCREASED RED ANGRY FLIES (User Request)
            angryRatio = 0.78;
            minAngryWanted = 6;
        } else {
            angryRatio = Math.min(0.85, 0.70 + (lvl - 2) * 0.05);
            minAngryWanted = Math.min(10, 4 + lvl);
        }

        angryRatio = Math.min(0.97, angryRatio + rage * 0.18);
        minAngryWanted = Math.min(14, minAngryWanted + Math.floor(this.totalKills / 6));
        const activeAngryCount = this.flies.filter(f => f.isAlive && f.isAngry).length;
        const isAngry = (activeAngryCount < minAngryWanted) ? true : (Math.random() < angryRatio);

        const options = {
            ...baseConfig,
            isAngry: isAngry,
            attackDamage: attackDamage,
            diveSpeed: diveSpeed,
            rage: rage,
            stalkTimeScale: stalkTimeScale,
            attackCooldown: attackCooldown
        };

        // Create authentic Drosophila fruit fly (peaceful or red angry attacker)
        const fly = new Fly(this.scene, this.flyIdCounter++, options);

        let x, z;
        if (initialSightline) {
            // A couple of initial flies in clearings ahead of player (10m - 16m) so the hunt begins
            const forwardYaw = this.player.yaw;
            const spread = (Math.random() - 0.5) * 1.6;
            const angle = forwardYaw + spread;
            const dist = 10.0 + Math.random() * 6.0;
            x = this.player.position.x - Math.sin(angle) * dist;
            z = this.player.position.z - Math.cos(angle) * dist;
        } else {
            // Distributed across the entire forest map (14m to 60m from center)
            const angle = Math.random() * Math.PI * 2;
            const dist = 14.0 + Math.random() * 46.0;
            x = Math.cos(angle) * dist;
            z = Math.sin(angle) * dist;
        }

        const groundY = this.forest.getTerrainHeight(x, z);
        const y = groundY + 1.2 + Math.random() * 2.2;

        fly.position.set(x, y, z);
        fly.mesh.position.set(x, y, z);

        this.flies.push(fly);
        this.updateStatsHUD();
    }

    updateSwarmRage() {
        // Existing red flies grow more dangerous immediately after every kill.
        const rageTier = Math.min(8, Math.floor(this.totalKills / 2));
        const rage = Math.min(1, this.totalKills / 16);
        const attackDamage = 10 + (this.level - 1) * 5 + rageTier * 2;
        const diveSpeed = 12.5 + this.level * 1.2 + rageTier * 0.55;
        const stalkTimeScale = 1 - rage * 0.35;
        const attackCooldown = Math.max(0.65, 1.6 - rageTier * 0.1);

        for (const fly of this.flies) {
            if (!fly.isAlive || !fly.isAngry) continue;
            fly.rage = rage;
            fly.attackDamage = attackDamage;
            fly.diveSpeed = diveSpeed;
            fly.stalkTimeScale = stalkTimeScale;
            fly.attackCooldownDuration = attackCooldown;
            if (fly.angryLight) {
                fly.angryLight.intensity = 1.35 + rage * 1.1;
                fly.angryLight.distance = 4.2 + rage * 1.5;
            }
        }
    }

    triggerVictory() {
        this.isGameOver = true;
        soundSystem.playVictoryFanfare();
        if (document.exitPointerLock) {
            document.exitPointerLock();
        }

        const modal = document.getElementById('victoryModal');
        if (modal) {
            modal.style.display = 'flex';
        }

        const statsElem = document.getElementById('victoryStats');
        if (statsElem) {
            const acc = this.shotsFired > 0 ? Math.round((this.hitsLanded / this.shotsFired) * 100) : 100;
            const timeSec = Math.round((performance.now() - this.startTime) / 1000);
            statsElem.innerHTML = `
                <div class="stat-row"><span>Fruit Flies Squashed:</span><strong>${this.totalKills}</strong></div>
                <div class="stat-row"><span>Accuracy:</span><strong>${acc}%</strong></div>
                <div class="stat-row"><span>Shots Fired:</span><strong>${this.shotsFired}</strong></div>
                <div class="stat-row"><span>Mission Time:</span><strong>${timeSec}s</strong></div>
                <div class="stat-row"><span>Neural Circuit:</span><strong style="color: #00ffcc;">DROSOPHILA GF MASTERED</strong></div>
            `;
        }
    }

    startEndlessMode() {
        this.isEndless = true;
        this.isGameOver = false;
        const modal = document.getElementById('victoryModal');
        if (modal) modal.style.display = 'none';

        this.showLevelBanner("ENDLESS NEURAL HUNT", "ALL WEAPONS UNLOCKED (1-8) | SPELLS (Z, X, C, V, B)");
        for (let i = 0; i < 5; i++) {
            this.spawnFly();
        }
        if (this.gameMode === 'windows') {
            try {
                document.body.requestPointerLock();
            } catch (_) {}
        }
    }

    restartGame() {
        location.reload();
    }

    updatePlayerPhysics(dt) {
        if (this.player.isDead) return;

        // Camera rotation
        const euler = new THREE.Euler(0, 0, 0, 'YXZ');
        euler.x = this.player.pitch;
        euler.y = this.player.yaw;
        this.camera.quaternion.setFromEuler(euler);

        // Movement directions
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.player.yaw);
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.player.yaw);

        const moveDir = new THREE.Vector3();
        if (this.keys['KeyW']) moveDir.add(forward);
        if (this.keys['KeyS']) moveDir.sub(forward);
        if (this.keys['KeyD']) moveDir.add(right);
        if (this.keys['KeyA']) moveDir.sub(right);
        const isMoving = moveDir.lengthSq() > 0.001;
        if (isMoving) moveDir.normalize();

        // Speed
        const isSprinting = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
        const currentSpeed = isSprinting ? this.player.sprintSpeed : this.player.speed;

        // Accelerate horizontally
        const targetVelX = moveDir.x * currentSpeed;
        const targetVelZ = moveDir.z * currentSpeed;

        this.player.velocity.x += (targetVelX - this.player.velocity.x) * Math.min(1.0, 10.0 * dt);
        this.player.velocity.z += (targetVelZ - this.player.velocity.z) * Math.min(1.0, 10.0 * dt);

        // Jump & Gravity
        if (this.player.isGrounded && this.keys['Space']) {
            this.player.velocity.y = this.player.jumpVelocity;
            this.player.isGrounded = false;
        }

        // Apply gravity
        this.player.velocity.y -= 19.6 * dt;

        // Position integration
        this.player.position.addScaledVector(this.player.velocity, dt);

        // Ground clamping with forest terrain
        const terrainY = this.forest.getTerrainHeight(this.player.position.x, this.player.position.z);
        const minPlayerY = terrainY + this.player.height;

        if (this.player.position.y <= minPlayerY) {
            this.player.position.y = minPlayerY;
            this.player.velocity.y = 0;
            this.player.isGrounded = true;
        }

        // 1. Solid Multi-Pass Obstacle Collision Solver (Trees, Rocks, Boulders)
        const playerRadius = this.player.radius;
        const obstacles = this.forest.obstacles;
        const numObstacles = obstacles.length;

        // 3-pass relaxation solver prevents tunneling, clipping, or multi-object pinching
        for (let pass = 0; pass < 2; pass++) {
            for (let i = 0; i < numObstacles; i++) {
                const obs = obstacles[i];
                const minDist = obs.radius + playerRadius;
                const dx = this.player.position.x - obs.position.x;
                if (dx >= minDist || dx <= -minDist) continue;
                const dz = this.player.position.z - obs.position.z;
                if (dz >= minDist || dz <= -minDist) continue;
                const dSq = dx * dx + dz * dz;

                if (dSq < minDist * minDist) {
                    const d = Math.sqrt(dSq);
                    let nx = 0, nz = 1;

                    if (d > 0.001) {
                        nx = dx / d;
                        nz = dz / d;
                    } else {
                        // Center penetration fallback: push along horizontal velocity reverse or random angle
                        const vLen = Math.hypot(this.player.velocity.x, this.player.velocity.z);
                        if (vLen > 0.1) {
                            nx = -this.player.velocity.x / vLen;
                            nz = -this.player.velocity.z / vLen;
                        } else {
                            nx = Math.cos(i);
                            nz = Math.sin(i);
                        }
                    }

                    // Impenetrable displacement push
                    this.player.position.x = obs.position.x + nx * (minDist + 0.005);
                    this.player.position.z = obs.position.z + nz * (minDist + 0.005);

                    // Velocity projection: wall-sliding physics (cancels normal component, preserves tangent)
                    const vDotN = this.player.velocity.x * nx + this.player.velocity.z * nz;
                    if (vDotN < 0) {
                        this.player.velocity.x -= vDotN * nx;
                        this.player.velocity.z -= vDotN * nz;
                    }
                }
            }
        }

        // 2. Arena Boundary Perimeter Collision (Impenetrable with Velocity Projection)
        const distFromCenter = Math.hypot(this.player.position.x, this.player.position.z);
        const maxBoundaryRadius = this.forest.arenaRadius - 2.8;
        if (distFromCenter > maxBoundaryRadius && distFromCenter > 0.001) {
            const bx = this.player.position.x / distFromCenter;
            const bz = this.player.position.z / distFromCenter;
            this.player.position.x = bx * maxBoundaryRadius;
            this.player.position.z = bz * maxBoundaryRadius;

            // Eliminate outward velocity towards edge of forest
            const bDotV = this.player.velocity.x * bx + this.player.velocity.z * bz;
            if (bDotV > 0) {
                this.player.velocity.x -= bDotV * bx;
                this.player.velocity.z -= bDotV * bz;
            }
        }

        // Head bobbing when walking
        if (isMoving && this.player.isGrounded) {
            this.player.bobbingTimer += dt * (isSprinting ? 15.0 : 10.0);
            const bobOffset = Math.sin(this.player.bobbingTimer) * 0.055;
            this.camera.position.set(
                this.player.position.x,
                this.player.position.y + bobOffset,
                this.player.position.z
            );
        } else {
            this.camera.position.copy(this.player.position);
        }

        // Align Head Torch SpotLight target with camera forward direction
        if (this.flashlight && this.flashlightTarget) {
            const camDir = new THREE.Vector3();
            this.camera.getWorldDirection(camDir);
            this.flashlightTarget.position.copy(this.camera.position).addScaledVector(camDir, 28.0);
        }
    }

    animate() {
        requestAnimationFrame(this.animate);

        // Pause loop if phone is held in portrait mode
        if (this.isOrientationBlocked) {
            return;
        }

        const dt = Math.min(this.clock.getDelta(), 0.05);

        if (!this.isPaused) {
            // 1. Update player physics & camera
            this.updatePlayerPhysics(dt);

            // Live FPS telemetry counter
            this.fpsFrames++;
            this.fpsTimer += dt;
            if (this.fpsTimer >= 0.5) {
                this.currentFps = Math.min(144, Math.round(this.fpsFrames / this.fpsTimer));
                const fpsEl = document.getElementById('hudFps');
                if (fpsEl) fpsEl.textContent = `âš¡ ${this.currentFps} FPS`;
                this.fpsFrames = 0;
                this.fpsTimer = 0;
            }

            // 2. Continuous automatic fire if holding left mouse button for auto weapons (SMG, Rifle, LMG)
            const w = this.weaponManager.currentWeapon;
            if (this.mouse.isDown && this.isPointerLocked && !this.player.isDead && w && (w.type === 'smg' || w.type === 'rifle' || w.type === 'lmg')) {
                this.handleAttack();
            }

            // 3. Update weapons (with active flies list for continuous swing collision)
            this.weaponManager.update(dt, this.flies);
            this.weaponHudTimer += dt;
            if (this.weaponHudTimer >= 0.1) {
                this.updateWeaponHUD();
                this.weaponHudTimer = 0;
            }

            // 4. Update 3D Audio listener position
            soundSystem.updateListener(this.camera);

            // 5. Threat info for fly looming detection
            const threat = this.weaponManager.getThreatInfo();

            // 6. Update all active flies (keep them circling around player)
            let closestFly = null;
            let closestDist = Infinity;

            for (let i = 0; i < this.flies.length; i++) {
                const fly = this.flies[i];
                fly.update(
                    dt,
                    threat.position,
                    threat.velocity,
                    threat.radius,
                    this.forest.obstacles,
                    (x, z) => this.forest.getTerrainHeight(x, z),
                    this.player.position,
                    (damage, attacker) => this.damagePlayer(damage, attacker)
                );

                const d = this.player.position.distanceTo(fly.position);
                if (d < closestDist) {
                    closestDist = d;
                    closestFly = fly;
                }
            }

            // 7. Update Real-time Fly Brain Neural HUD
            this.neuralHUD.update(closestFly, dt);

            // 8. Update Fly Directional Sonar / Radar Tracker
            this.updateRadarHUD(closestFly, closestDist);

            // 9. Update Forest environment (mist, rain, lightning, wind particles)
            this.forest.update(dt, this.player.position);

            // 10. Update Elemental Magic Manager (projectiles, VFX, cooldowns)
            if (this.magicManager) {
                this.magicManager.update(dt);
            }
        }

        // Render 3D Scene
        this.renderer.render(this.scene, this.camera);
    }

    updateRadarHUD(closestFly, dist) {
        const radar = document.getElementById('flyRadar');
        const distElem = document.getElementById('radarDistance');
        const arrowElem = document.getElementById('radarArrow');
        if (!radar || !distElem || !arrowElem) return;

        if (!closestFly || dist === Infinity || !closestFly.isAlive) {
            radar.style.display = 'none';
            return;
        }

        radar.style.display = 'flex';
        distElem.textContent = `${dist.toFixed(1)}m`;

        // Calculate horizontal relative angle to closest fly
        const camDir = new THREE.Vector3();
        this.camera.getWorldDirection(camDir);
        const toFly = new THREE.Vector3().subVectors(closestFly.position, this.camera.position);

        const angleCam = Math.atan2(camDir.x, camDir.z);
        const angleFly = Math.atan2(toFly.x, toFly.z);
        const rawDiff = angleFly - angleCam;
        const relAngle = Number.isFinite(rawDiff) ? Math.atan2(Math.sin(rawDiff), Math.cos(rawDiff)) : 0;

        const deg = (relAngle * 180 / Math.PI);
        let arrow = "â†‘";
        if (deg > -25 && deg <= 25) arrow = "â†‘ AHEAD";
        else if (deg > 25 && deg <= 70) arrow = "â†— RIGHT-FRONT";
        else if (deg > 70 && deg <= 115) arrow = "â†’ RIGHT";
        else if (deg > 115 && deg <= 160) arrow = "â†˜ RIGHT-BEHIND";
        else if (deg > -70 && deg <= -25) arrow = "â†– LEFT-FRONT";
        else if (deg > -115 && deg <= -70) arrow = "â† LEFT";
        else if (deg > -160 && deg <= -115) arrow = "â†™ LEFT-BEHIND";
        else arrow = "â†“ BEHIND";

        arrowElem.textContent = arrow;

        // In swatting reach highlight
        if (dist <= 3.8) {
            radar.classList.add('in-range');
        } else {
            radar.classList.remove('in-range');
        }
    }

    showLevelBanner(title, subtitle) {
        const banner = document.getElementById('levelBanner');
        const titleElem = document.getElementById('bannerTitle');
        const subElem = document.getElementById('bannerSubtitle');

        if (banner && titleElem && subElem) {
            titleElem.textContent = title;
            subElem.textContent = subtitle;
            banner.classList.add('visible');

            setTimeout(() => {
                banner.classList.remove('visible');
            }, 3200);
        }
    }

    showNotification(text) {
        const notif = document.getElementById('notificationBox');
        if (notif) {
            notif.textContent = text;
            notif.classList.add('show');
            setTimeout(() => {
                notif.classList.remove('show');
            }, 2500);
        }
    }

    updateStatsHUD() {
        const lvlElem = document.getElementById('hudLevel');
        const targetElem = document.getElementById('hudGoal');
        const remainingFliesElem = document.getElementById('hudFliesRemaining');

        if (lvlElem) lvlElem.textContent = this.isEndless ? "ENDLESS" : `LEVEL ${this.level}`;
        if (targetElem) {
            const goal = this.levelGoals[this.level] || 10;
            targetElem.textContent = this.isEndless ? `${this.totalKills}` : `${this.fliesKilledThisLevel} / ${goal}`;
        }
        if (remainingFliesElem) {
            remainingFliesElem.textContent = `${this.flies.length}`;
        }
    }

    updateWeaponHUD() {
        const w = this.weaponManager.currentWeapon;
        if (!w) return;

        const nameElem = document.getElementById('weaponName');
        const ammoElem = document.getElementById('weaponAmmo');
        const reloadPrompt = document.getElementById('reloadPrompt');

        if (nameElem) nameElem.textContent = w.name;
        if (ammoElem) {
            if (w.maxAmmo === Infinity) {
                ammoElem.textContent = "âˆž (MELEE)";
                ammoElem.style.color = "#00ffcc";
            } else {
                ammoElem.textContent = `${w.ammo} / ${w.maxAmmo}`;
                ammoElem.style.color = (w.ammo <= 3) ? "#ff3344" : "#ffffff";
            }
        }

        if (reloadPrompt) {
            if (this.weaponManager.isReloading) {
                reloadPrompt.textContent = "RELOADING...";
                reloadPrompt.style.display = "block";
            } else if (w.ammo <= 2 && w.maxAmmo !== Infinity) {
                reloadPrompt.textContent = "PRESS [T] TO RELOAD";
                reloadPrompt.style.display = "block";
            } else {
                reloadPrompt.style.display = "none";
            }
        }
    }

    toggleFlashlight(forceState) {
        this.flashlightOn = (forceState !== undefined) ? !!forceState : !this.flashlightOn;
        if (this.flashlight) {
            this.flashlight.intensity = this.flashlightOn ? 3.8 : 0;
        }
        if (this.flashlightBulb) {
            this.flashlightBulb.intensity = this.flashlightOn ? 0.75 : 0;
        }
        soundSystem.playFlashlightClick();
        this.updateTorchHUD();
        this.showNotification(this.flashlightOn ? "ðŸ”¦ TORCH ON [F]" : "TORCH OFF [F]");
        return this.flashlightOn;
    }

    toggleDayNight() {
        const wasRain = (this.forest && this.forest.currentMode === 'rain');
        if (wasRain) {
            soundSystem.stopRainAmbient();
        }

        const newMode = this.forest.toggleTimeOfDay();
        soundSystem.currentWeatherMode = newMode;

        // If switching to night and torch is off, automatically turn it on
        if (newMode === 'night' && !this.flashlightOn) {
            this.toggleFlashlight(true);
        }
        this.updateDayNightHUD();
        this.updateRainHUD();
        this.showNotification(newMode === 'night' ? "ðŸŒ™ NIGHT MODE [N]" : "â˜€ï¸ DAY MODE [N]");
        return newMode;
    }

    toggleRain(forceState) {
        let newMode;
        if (forceState !== undefined) {
            newMode = forceState ? 'rain' : (this.forest.previousMode || 'day');
            this.forest.setTimeOfDay(newMode);
        } else {
            newMode = this.forest.toggleRain();
        }

        const isRain = (newMode === 'rain');
        soundSystem.currentWeatherMode = newMode;

        if (isRain) {
            soundSystem.startRainAmbient();
            this.showNotification("â›ˆï¸ STORM: NIGHT + RAIN + LIGHTNING [R]");
            // If torch is currently off, illuminate for dark storm
            if (!this.flashlightOn) {
                this.toggleFlashlight(true);
            }
        } else {
            soundSystem.stopRainAmbient();
            this.showNotification(newMode === 'night' ? "ðŸŒ™ NIGHT MODE [N]" : "â˜€ï¸ DAY MODE [N]");
        }

        this.updateRainHUD();
        this.updateDayNightHUD();
        return isRain;
    }

    updateTorchHUD() {
        const btn = document.getElementById('hudTorchBtn');
        if (btn) {
            if (this.flashlightOn) {
                btn.textContent = "ðŸ”¦ TORCH: ON [F]";
                btn.classList.add('active');
            } else {
                btn.textContent = "ðŸ”¦ TORCH: OFF [F]";
                btn.classList.remove('active');
            }
        }
    }

    updateDayNightHUD() {
        const btn = document.getElementById('hudDayNightBtn');
        if (btn) {
            const isNight = (this.forest && this.forest.currentMode === 'night');
            if (isNight) {
                btn.textContent = "ðŸŒ™ NIGHT [N]";
                btn.classList.add('night');
            } else {
                btn.textContent = "â˜€ï¸ DAY [N]";
                btn.classList.remove('night');
            }
        }
    }

    updateRainHUD() {
        const btn = document.getElementById('hudRainBtn');
        if (btn) {
            const isRain = (this.forest && this.forest.currentMode === 'rain');
            if (isRain) {
                btn.textContent = "â›ˆï¸ RAIN: ON [R]";
                btn.classList.add('rain-active');
            } else {
                btn.textContent = "â›ˆï¸ RAIN: OFF [R]";
                btn.classList.remove('rain-active');
            }
        }
    }

    damagePlayer(amount, fly = null) {
        if (this.player.isDead || this.isGameOver) return;
        this.player.health = Math.max(0, this.player.health - amount);
        soundSystem.playPlayerHurt();
        this.showDamageVignette();
        this.updateHealthHUD();

        if (this.player.health <= 0) {
            this.handlePlayerDeath(fly);
        }
    }

    showDamageVignette() {
        const overlay = document.getElementById('damageOverlay');
        if (overlay) {
            overlay.classList.remove('active');
            void overlay.offsetWidth; // Trigger reflow
            overlay.classList.add('active');
            setTimeout(() => {
                overlay.classList.remove('active');
            }, 260);
        }
    }

    updateHealthHUD() {
        const fill = document.getElementById('hudHealthFill');
        const text = document.getElementById('hudHealthText');
        const panel = document.getElementById('healthPanel');

        const pct = Math.max(0, Math.min(100, (this.player.health / this.player.maxHealth) * 100));
        if (fill) {
            // Keep the fill's box full width and scale its visible portion from the left.
            // This is reliable inside the clipped HUD container at every screen size.
            fill.style.setProperty('--health-scale', `${pct / 100}`);
            fill.setAttribute('aria-valuenow', `${Math.ceil(this.player.health)}`);
        }
        if (text) text.textContent = `${Math.ceil(this.player.health)} / ${this.player.maxHealth} HP`;

        if (panel) {
            if (pct <= 30) {
                panel.classList.add('low-health');
                panel.classList.remove('warning-health');
            } else if (pct <= 60) {
                panel.classList.remove('low-health');
                panel.classList.add('warning-health');
            } else {
                panel.classList.remove('low-health');
                panel.classList.remove('warning-health');
            }
        }
    }

    handlePlayerDeath(killerFly = null) {
        this.player.isDead = true;
        this.isGameOver = true;
        soundSystem.playPlayerDeath();

        // Release pointer lock on death
        if (document.exitPointerLock) {
            try { document.exitPointerLock(); } catch (e) {}
        }

        // Show "YOU DIED" dramatic red screen overlay
        const deathOverlay = document.getElementById('deathOverlay');
        if (deathOverlay) {
            deathOverlay.style.display = 'flex';
        }

        const pauseOverlay = document.getElementById('pauseOverlay');
        if (pauseOverlay) {
            pauseOverlay.style.display = 'none';
        }

        // Update death statistics
        const lvlElem = document.getElementById('deathLevelReached');
        const killsElem = document.getElementById('deathFliesKilled');
        const shotsElem = document.getElementById('deathShotsFired');
        const subElem = document.getElementById('deathSubtitle');

        if (lvlElem) lvlElem.textContent = `LEVEL ${this.level}`;
        if (killsElem) killsElem.textContent = `${this.totalKills}`;
        if (shotsElem) shotsElem.textContent = `${this.shotsFired}`;
        if (subElem) {
            const dmg = 10 + (this.level - 1) * 5;
            subElem.textContent = `SLAIN BY ANGRY RED DROSOPHILA SWARM (STING: -${dmg} HP)`;
        }
    }

    restartFromLevelOne() {
        // Hide death screen
        const deathOverlay = document.getElementById('deathOverlay');
        if (deathOverlay) deathOverlay.style.display = 'none';

        // Reset player progression back to Level 1
        this.player.isDead = false;
        this.isGameOver = false;
        this.player.health = this.player.maxHealth;
        this.totalKills = 0;
        this.shotsFired = 0;
        this.hitsLanded = 0;

        // Restart from Level 1
        this.startLevel(1);

        // Re-engage pointer lock only on Windows PC
        if (this.gameMode === 'windows') {
            try {
                const p = document.body.requestPointerLock();
                if (p && p.catch) p.catch(() => {});
            } catch (e) {}
        }
    }

    setupMobileControls() {
        const controlsLayer = document.getElementById('mobileControlsLayer');
        if (!controlsLayer) return;

        // Auto-enable touch controls on touch devices or small screens
        if (this.isTouchDevice) {
            document.body.classList.add('touch-enabled');
        }

        // --- Left Virtual Movement Joystick ---
        const joyZone = document.getElementById('mobileJoystickZone');
        const joyBase = document.getElementById('mobileJoystickBase');
        const joyThumb = document.getElementById('mobileJoystickThumb');
        const maxRadius = 45;

        if (joyZone && joyBase && joyThumb) {
            // Ensure joystick base is visibly anchored in bottom left
            joyBase.style.display = 'block';

            const handleJoyStart = (e) => {
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const touch = e.changedTouches[i];
                    if (this.joystickTouchId === null) {
                        this.joystickTouchId = touch.identifier;
                        const rect = joyBase.getBoundingClientRect();
                        this.joystickCenter = { 
                            x: rect.left + rect.width / 2, 
                            y: rect.top + rect.height / 2 
                        };
                        
                        const dx = touch.clientX - this.joystickCenter.x;
                        const dy = touch.clientY - this.joystickCenter.y;
                        const dist = Math.hypot(dx, dy);
                        const angle = Math.atan2(dy, dx);
                        const clampedDist = Math.min(dist, maxRadius);
                        const thumbX = Math.cos(angle) * clampedDist;
                        const thumbY = Math.sin(angle) * clampedDist;
                        joyThumb.style.transform = `translate(calc(-50% + ${thumbX}px), calc(-50% + ${thumbY}px))`;

                        this.touchMoveVector.x = thumbX / maxRadius;
                        this.touchMoveVector.y = thumbY / maxRadius;
                        break;
                    }
                }
            };

            const handleJoyMove = (e) => {
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const touch = e.changedTouches[i];
                    if (touch.identifier === this.joystickTouchId) {
                        const dx = touch.clientX - this.joystickCenter.x;
                        const dy = touch.clientY - this.joystickCenter.y;
                        const dist = Math.hypot(dx, dy);
                        const angle = Math.atan2(dy, dx);
                        const clampedDist = Math.min(dist, maxRadius);

                        const thumbX = Math.cos(angle) * clampedDist;
                        const thumbY = Math.sin(angle) * clampedDist;
                        joyThumb.style.transform = `translate(calc(-50% + ${thumbX}px), calc(-50% + ${thumbY}px))`;

                        this.touchMoveVector.x = thumbX / maxRadius;
                        this.touchMoveVector.y = thumbY / maxRadius;
                        break;
                    }
                }
            };

            const handleJoyEnd = (e) => {
                for (let i = 0; i < e.changedTouches.length; i++) {
                    if (e.changedTouches[i].identifier === this.joystickTouchId) {
                        this.joystickTouchId = null;
                        this.touchMoveVector = { x: 0, y: 0 };
                        joyThumb.style.transform = 'translate(-50%, -50%)';
                        break;
                    }
                }
            };

            joyZone.addEventListener('touchstart', handleJoyStart, { passive: false });
            joyZone.addEventListener('touchmove', handleJoyMove, { passive: false });
            joyZone.addEventListener('touchend', handleJoyEnd, { passive: false });
            joyZone.addEventListener('touchcancel', handleJoyEnd, { passive: false });
        }

        // --- Right Touch Look Zone ---
        const lookZone = document.getElementById('mobileLookZone');
        if (lookZone) {
            const handleLookStart = (e) => {
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const touch = e.changedTouches[i];
                    if (this.lookTouchId === null) {
                        this.lookTouchId = touch.identifier;
                        this.lastLookPos = { x: touch.clientX, y: touch.clientY };
                        break;
                    }
                }
            };

            const handleLookMove = (e) => {
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const touch = e.changedTouches[i];
                    if (touch.identifier === this.lookTouchId) {
                        const dx = touch.clientX - this.lastLookPos.x;
                        const dy = touch.clientY - this.lastLookPos.y;
                        this.lastLookPos = { x: touch.clientX, y: touch.clientY };

                        const sensitivity = 0.0042;
                        this.player.yaw -= dx * sensitivity;
                        this.player.pitch -= dy * sensitivity;

                        const maxPitch = Math.PI / 2 - 0.08;
                        this.player.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.player.pitch));
                        break;
                    }
                }
            };

            const handleLookEnd = (e) => {
                for (let i = 0; i < e.changedTouches.length; i++) {
                    if (e.changedTouches[i].identifier === this.lookTouchId) {
                        this.lookTouchId = null;
                        break;
                    }
                }
            };

            lookZone.addEventListener('touchstart', handleLookStart, { passive: false });
            lookZone.addEventListener('touchmove', handleLookMove, { passive: false });
            lookZone.addEventListener('touchend', handleLookEnd, { passive: false });
            lookZone.addEventListener('touchcancel', handleLookEnd, { passive: false });
        }

        // --- Mobile Action Buttons ---
        const attackBtn = document.getElementById('mobileAttackBtn');
        if (attackBtn) {
            attackBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.player.isDead) return;
                this.mouse.isDown = true;
                this.handleAttack();
            }, { passive: false });

            attackBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.mouse.isDown = false;
            }, { passive: false });

            attackBtn.addEventListener('touchcancel', () => {
                this.mouse.isDown = false;
            });
        }

        const jumpBtn = document.getElementById('mobileJumpBtn');
        if (jumpBtn) {
            jumpBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.touchJumpRequested = true;
            }, { passive: false });
        }

        const reloadBtn = document.getElementById('mobileReloadBtn');
        if (reloadBtn) {
            reloadBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.weaponManager.reload();
                this.updateWeaponHUD();
            }, { passive: false });
        }

        const aimBtn = document.getElementById('mobileAimBtn');
        if (aimBtn) {
            aimBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.isAimingTouch = !this.isAimingTouch;
                aimBtn.classList.toggle('active', this.isAimingTouch);
                this.weaponManager.setAiming(this.isAimingTouch);
            }, { passive: false });
        }

        const sprintBtn = document.getElementById('mobileSprintBtn');
        if (sprintBtn) {
            sprintBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.isTouchSprinting = !this.isTouchSprinting;
                sprintBtn.classList.toggle('active', this.isTouchSprinting);
            }, { passive: false });
        }

        // --- Mobile Top Strip Actions ---
        const pauseBtn = document.getElementById('mobilePauseBtn');
        if (pauseBtn) {
            pauseBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleMobilePause();
            }, { passive: false });
        }

        const neuralToggleBtn = document.getElementById('mobileNeuralToggleBtn');
        if (neuralToggleBtn) {
            neuralToggleBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const np = document.querySelector('.neural-panel');
                if (np) {
                    const isHidden = np.classList.toggle('mobile-hidden');
                    np.classList.toggle('mobile-open', !isHidden);
                    neuralToggleBtn.classList.toggle('active', !isHidden);
                }
            }, { passive: false });
        }

        const torchBtn = document.getElementById('mobileTorchBtn');
        if (torchBtn) {
            torchBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleFlashlight();
            }, { passive: false });
        }

        const dayNightBtn = document.getElementById('mobileDayNightBtn');
        if (dayNightBtn) {
            dayNightBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleDayNight();
            }, { passive: false });
        }

        const stormBtn = document.getElementById('mobileStormBtn');
        if (stormBtn) {
            stormBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleStorm();
            }, { passive: false });
        }
    }

    updateMobileWeaponBar() {
        const bar = document.getElementById('mobileWeaponBar');
        if (!bar) return;
        const maxUnlocked = this.isEndless ? 8 : this.level;
        const icons = ['ðŸ¸', 'ðŸª°', 'ðŸ”«', 'âš¡', 'ðŸŽ¯', 'ðŸ’£', 'ðŸ”¥', 'ðŸ’¥'];
        const names = ['RACKET', 'SWATTER', 'GLOCK', 'LASER', 'SNIPER', 'GRENADE', 'FLAME', 'ROCKET'];

        let html = '';
        for (let i = 1; i <= 8; i++) {
            const isUnlocked = i <= maxUnlocked;
            const isActive = this.weaponManager && this.weaponManager.currentLevel === i;
            html += `
                <button class="m-weap-btn ${isActive ? 'active' : ''} ${!isUnlocked ? 'locked' : ''}" 
                        data-weapon="${i}" ${!isUnlocked ? 'disabled' : ''}>
                    <span class="m-weap-num">${i}</span>
                    <span class="m-weap-icon">${icons[i - 1]}</span>
                    <span class="m-weap-name">${names[i - 1]}</span>
                </button>
            `;
        }
        bar.innerHTML = html;

        bar.querySelectorAll('.m-weap-btn:not(.locked)').forEach(btn => {
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const num = parseInt(btn.dataset.weapon);
                if (num) {
                    this.weaponManager.setWeapon(num);
                    this.updateWeaponHUD();
                    this.updateMobileWeaponBar();
                }
            }, { passive: false });
        });
    }

    toggleMobilePause() {
        const overlay = document.getElementById('pauseOverlay');
        if (!overlay) return;
        const isOpen = overlay.style.display !== 'none';
        if (isOpen) {
            overlay.style.display = 'none';
            this.isPointerLocked = true;
            this.isMobileActive = true;
        } else {
            overlay.style.display = 'flex';
            this.isPointerLocked = false;
            this.isMobileActive = false;
            this.mouse.isDown = false;
            this.touchMoveVector = { x: 0, y: 0 };
        }
    }

    setPlatformMode(mode, autoLaunch = false) {
        this.gameMode = mode;
        try {
            localStorage.setItem('ktf_game_mode', mode);
        } catch (_) {}

        const cardWin = document.getElementById('modeCardWindows');
        const cardAnd = document.getElementById('modeCardAndroid');
        const badgeWin = document.getElementById('badgeWindows');
        const badgeAnd = document.getElementById('badgeAndroid');
        const neuralPanel = document.querySelector('.neural-panel');

        if (mode === 'windows') {
            document.body.classList.add('platform-windows');
            document.body.classList.remove('platform-android', 'touch-enabled');

            if (cardWin) cardWin.classList.add('active');
            if (cardAnd) cardAnd.classList.remove('active');

            // Show full desktop Connectome panel
            if (neuralPanel) {
                neuralPanel.classList.remove('mobile-hidden', 'mobile-open');
            }

            // Hide landscape blocker in Windows mode
            const blocker = document.getElementById('landscapeBlocker');
            if (blocker) blocker.style.display = 'none';
            this.isOrientationBlocked = false;

            if (autoLaunch) {
                soundSystem.init();
                soundSystem.resume();
                const overlay = document.getElementById('pauseOverlay');
                if (overlay) overlay.style.display = 'none';
                this.isMobileActive = false;
                try {
                    const p = document.body.requestPointerLock();
                    if (p && p.catch) p.catch(() => {});
                } catch (_) {}
            }
        } else {
            // Android / Phone Mode
            document.body.classList.add('platform-android', 'touch-enabled');
            document.body.classList.remove('platform-windows');

            if (cardAnd) cardAnd.classList.add('active');
            if (cardWin) cardWin.classList.remove('active');

            // Collapse huge Connectome panel on phones by default to free 80% screen!
            if (neuralPanel) {
                neuralPanel.classList.add('mobile-hidden');
                neuralPanel.classList.remove('mobile-open');
            }

            // Ensure mobile controls are visible and active
            const controlsLayer = document.getElementById('mobileControlsLayer');
            if (controlsLayer) controlsLayer.style.display = 'block';

            // Attempt Fullscreen and Landscape Orientation lock on Android devices
            if (autoLaunch) {
                try {
                    if (document.documentElement.requestFullscreen) {
                        document.documentElement.requestFullscreen().catch(() => {});
                    }
                    if (screen.orientation && screen.orientation.lock) {
                        screen.orientation.lock('landscape').catch(() => {});
                    }
                } catch (_) {}

                soundSystem.init();
                soundSystem.resume();
                const overlay = document.getElementById('pauseOverlay');
                if (overlay) overlay.style.display = 'none';
                this.isMobileActive = true;
                this.isPointerLocked = true;
                this.updateMobileWeaponBar();
                this.checkOrientation();
            }
        }

        // Show resume button once mode has been established
        const resumeBtn = document.getElementById('resumeBtn');
        if (resumeBtn) {
            resumeBtn.style.display = 'inline-block';
            resumeBtn.textContent = `RESUME (${mode === 'windows' ? 'WINDOWS' : 'ANDROID LANDSCAPE'})`;
        }

        // Pre-highlight recommended mode based on user device
        const isMobileDevice = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (window.innerWidth <= 1024 && navigator.maxTouchPoints > 0);
        if (badgeWin && badgeAnd) {
            if (isMobileDevice) {
                badgeAnd.textContent = 'â˜… RECOMMENDED FOR YOUR PHONE';
                badgeWin.textContent = 'WINDOWS PC';
            } else {
                badgeWin.textContent = 'â˜… RECOMMENDED FOR YOUR PC';
                badgeAnd.textContent = 'ANDROID PHONES';
            }
        }
    }

    checkOrientation() {
        if (this.gameMode !== 'android') {
            const blocker = document.getElementById('landscapeBlocker');
            if (blocker) blocker.style.display = 'none';
            this.isOrientationBlocked = false;
            return;
        }

        // In Android Mode: Enforce Landscape Mode Only
        const isPortrait = window.innerHeight > window.innerWidth;
        const blocker = document.getElementById('landscapeBlocker');

        if (isPortrait) {
            this.isOrientationBlocked = true;
            if (blocker) blocker.style.display = 'flex';
        } else {
            this.isOrientationBlocked = false;
            if (blocker) blocker.style.display = 'none';

            // Resize camera aspect ratio and renderer to fit landscape screen
            if (this.camera && this.renderer) {
                this.camera.aspect = window.innerWidth / window.innerHeight;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(window.innerWidth, window.innerHeight);
            }
        }
    }
}

// Instantiate game on page load
window.addEventListener('DOMContentLoaded', () => {
    window.gameInstance = new GameEngine();
});
