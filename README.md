# KILL THE FLY: Neural Hunter (3D FPS Web Game)

A high-performance 3D First-Person Shooter web game powered by **Three.js** and a neuro-computational model of the **Drosophila melanogaster (Fruit Fly)** escape and flight connectome.

---

## 🎮 How to Play

### Quick Launch
- **Double click**: `run_game.bat` (or run `python run_game.py` in your terminal).
- The game will automatically launch at `http://localhost:8000/index.html`.

### Controls
| Key / Input | Action |
| :--- | :--- |
| **Mouse** | Look around & Aim crosshair |
| **Left Click** | Swing / Fire weapon |
| **Right Click** | Aim Down Sights (ADS zoom) |
| **W, A, S, D** | Move locomotion |
| **Shift** | Sprint |
| **Space** | Jump |
| **T** | Reload firearm clip |
| **1–8** | Switch to an unlocked weapon (all weapons in Endless Mode) |
| **Z, X, C, V, B** | Cast magic spells (unlocked from Level 2) |
| **M** | Toggle 3D spatial audio mute |

---

## 🔬 Biological Fly Brain Model (Connectome Circuit)

Unlike typical game bots that dodge using pseudo-random timers, the flies in **KILL THE FLY** run a biophysical simulation of the fruit fly escape circuit:

1. **LC4 & LPLC2 (Lobula Columnar Neurons)**:
   - Detects visual looming stimuli (angular size $\theta$ and angular expansion rate $\frac{d\theta}{dt}$).
   - Computes time-to-collision and relative approach velocity.
   - The fly compound eye covers ~330°, with a blind zone directly behind/below the abdomen.

2. **Central Complex (EB, FB, PB)**:
   - Contains a ring attractor compass maintaining head direction.
   - Generates spontaneous exploratory flight paths and random saccadic turns every 0.8–2.0 seconds.
   - Optic flow (HS/VS tangential cells) steers the fly around forest tree obstacles.

3. **Giant Fiber (GF) Descending Command Neuron**:
   - Modeled with **Leaky Integrate-and-Fire** membrane dynamics:
     $$\tau_m \frac{dV_{GF}}{dt} = -(V_{GF} - V_{rest}) + I_{synaptic}(LC4, LPLC2) + noise$$
   - Resting potential: $-70.0\text{ mV}$.
   - Spike threshold: $-48.0\text{ mV}$ (dynamic per level).
   - When membrane potential crosses threshold, an **Action Potential** spikes to $+30.0\text{ mV}$!

4. **Thoracic Ganglion Motor Outputs**:
   - **TTM (Tergotrochanteral Motor Neuron)**: Fires first (<10ms), driving an explosive leg jump launch away from the threat vector.
   - **DLM (Dorsal Longitudinal Muscles)**: Engages full-power wing depressors, elevating wing beat frequency from ~185 Hz to >230 Hz and executing an evasive banking barrel roll.

---

## 📊 Real-Time Fly Brain HUD, Radar & Oscilloscope

The telemetry interface provides real-time combat guidance:
- **🪰 Fly Proximity Sonar / Radar Tracker**: Centered below the crosshair, shows live distance and directional arrows (`↑ AHEAD`, `↗ RIGHT-FRONT`, `← LEFT`, `↓ BEHIND`). Pulses green when a fly enters swatting reach ($\le 3.8\text{m}$).
- **Connectome Diagram**: Visualizes active signal flow (Eyes $\rightarrow$ LC4 $\rightarrow$ Central Complex $\rightarrow$ Giant Fiber $\rightarrow$ TTM/DLM).
- **Membrane Oscilloscope**: Rolling live voltage trace showing real-time action potentials.
- **LC4 Looming Rate**: Retinal expansion percentage.
- **Flight Frequency**: Wing beat frequency in Hz.
- **TTM Status**: Armed vs. Jump reflex fired.

---

## 🌲 8-Level Campaign & Complete Arsenal

| Level | Level Name | Weapon | Type | Fly Speed | Chaos / Reflex | Goal |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: |
| **1** | Woodland Canopy | **Badminton Racket** | Melee Swat | 7.5 m/s | 1.0 ($-46\text{mV}$) | 3 |
| **2** | Pine Thicket | **Tactical Handgun** | Semi-Auto Pistol | 9.0 m/s | 1.3 ($-49\text{mV}$) | 5 |
| **3** | Bramble Hollow | **MAC-10 Submachine Gun** | 800 RPM SMG | 10.5 m/s | 1.6 ($-52\text{mV}$) | 7 |
| **4** | Mist Valley | **Pump Action Shotgun** | 8-Pellet Buckshot | 12.0 m/s | 1.9 ($-55\text{mV}$) | 8 |
| **5** | Deep Forest | **AK-47 Assault Rifle** | 7.62mm Auto Rifle | 13.5 m/s | 2.2 ($-58\text{mV}$) | 10 |
| **6** | Old Lumber Mill | **Heavy Squad LMG** | 75-Round Belt Box | 15.0 m/s | 2.5 ($-61\text{mV}$) | 12 |
| **7** | Eagle's Ridge | **Tactical Sniper Rifle** | 4x Optic Scope ADS | 16.5 m/s | 2.8 ($-64\text{mV}$) | 10 |
| **8** | The Hive Core | **RPG-7 Rocket Launcher** | Explosive 12m AOE | 18.5 m/s | 3.3 ($-67\text{mV}$) | 15 |

---

### 🕹️ Weapon Controls
- Press **`1` through `8`** or use the **Mouse Scroll Wheel** to select unlocked weapons.
- From Level 2 onward, press **`Z`**, **`X`**, **`C`**, **`V`**, or **`B`** to cast the five spells. The hotbar also shows each spell key.
- **Holding Left Mouse Button**: Full automatic continuous fire for SMG, AK-47, and Heavy LMG.
- **Right Mouse Button**:
  - Sniper Rifle: Activates high-power **4x Telescopic Zoom Scope** with rangefinder reticle overlay.
  - Firearms: Aligns tactical iron sights for tight ADS precision.
- **RPG Rocket Launcher**: Launches high-velocity propelled rockets with exhaust smoke trails that detonate on impact in a 12-meter fireball blast, wiping out entire swarms at once.

---

### ⚡ Progressive Biological Fly Difficulty
With each level, the simulated *Drosophila* connectome evolves:
- **Flight Speed**: Scales from a gentle $7.5\text{ m/s}$ up to a blistering $18.5\text{ m/s}$ ($66\text{ km/h}$).
- **Unpredictability & Saccades**: Saccade frequency increases over 300%, triggering erratic 3D zigzags, vertical jinks, and sharp multi-axis barrel rolls.
- **Giant Fiber Sensitivity**: The escape spike threshold drops from $-46\text{ mV}$ down to a hyper-sensitive $-67\text{ mV}$, causing high-tier flies to fire evasive jump kicks at the slightest muzzle flash or visual expansion within 15 milliseconds.

---

## 🔊 100% Procedural 3D Audio (Web Audio API)
- **3D Spatial Fly Buzz**: Dual-harmonic oscillator with pitch jitter, real-time Doppler shift, and HRTF 3D positional panning.
- **Weapons**: Dynamic swoosh for racket, explosive crack + sub-bass kick for pistol, and high-cadence rattle for machine gun.
- **Bio-feedback**: Synaptic audio chirp whenever the fly's Giant Fiber discharges an action potential.
- **Forest Ambience**: Procedural wind generator and intermittent woodland bird tweets.
