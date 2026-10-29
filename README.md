# ðŸª° KILL THE FLY: Neural Hunter

<p align="center">
  <a href="https://cbagh0819-ctrl.github.io/kill-the-fly-neural-hunter/landing.html#magic">
    <img src="https://img.shields.io/badge/ðŸŽ®_PLAY_LIVE_DEMO-Kill_The_Fly-00C853?style=for-the-badge&logo=github&logoColor=white" alt="Play KILL THE FLY Live Demo" />
  </a>
</p>

<p align="center">
  <strong>A High-Performance 3D First-Person Shooter Web Game</strong>
  <br />
  Powered by Three.js and a neuro-computational model inspired by the <em>Drosophila melanogaster</em> escape and flight connectome.
  <br /><br />
  ðŸŽ® <strong>Play Now:</strong>
  <a href="https://cbagh0819-ctrl.github.io/kill-the-fly-neural-hunter/landing.html#magic">Launch KILL THE FLY: Neural Hunter</a>
  <br />
  ðŸŒ Runs in your browser â€” no installation required for the live demo.
</p>

---

## ðŸŽ® How to Play

### ðŸš€ Quick Launch

**Play online:** [KILL THE FLY: Neural Hunter â€” Live Demo](https://cbagh0819-ctrl.github.io/kill-the-fly-neural-hunter/landing.html#magic)

**Run locally:**
- Double-click `run_game.bat`, or
- Run `python run_game.py` in your terminal.
- The game will launch at `http://localhost:8000/index.html`.

### ðŸ•¹ï¸ Controls

| Key / Input | Action |
| :--- | :--- |
| **Mouse** | Look around and aim the crosshair |
| **Left Click** | Swing or fire weapon |
| **Right Click** | Aim Down Sights (ADS) / zoom |
| **W, A, S, D** | Move |
| **Shift** | Sprint |
| **Space** | Jump |
| **T** | Reload firearm |
| **1â€“8** | Switch to an unlocked weapon; all weapons are available in Endless Mode |
| **Z, X, C, V, B** | Cast magic spells (unlocked from Level 2) |
| **M** | Toggle 3D spatial audio mute |

---

## ðŸ”¬ Biological Fly Brain Model (Connectome Circuit)

Unlike typical game bots that dodge using pseudo-random timers, the flies in **KILL THE FLY** use a biologically inspired computational model of the fruit fly's escape circuit.

### 1. LC4 & LPLC2 â€” Visual Looming Detection

- Detects approaching visual stimuli using angular size \(\theta\) and angular expansion rate \(d\theta/dt\).
- Estimates time-to-collision and relative approach velocity.
- Models a wide field of view inspired by the fruit fly's compound eyes, with a blind zone behind and below the abdomen.

### 2. Central Complex (EB, FB, PB)

- Uses a ring-attractor-inspired compass to maintain directional orientation.
- Generates exploratory flight paths and spontaneous saccadic turns approximately every 0.8â€“2.0 seconds.
- Uses optic-flow-inspired steering to navigate around forest obstacles.

### 3. Giant Fiber (GF) Descending Command Neuron

The escape response is modeled using Leaky Integrate-and-Fire membrane dynamics:

C dV_GF/dt = -(V_GF - V_rest) + I_synaptic(LC4, LPLC2) + noise

- Resting potential: **âˆ’70.0 mV**
- Spike threshold: **âˆ’48.0 mV** (adjustable by level)
- Simulated action potential peak: **+30.0 mV**

When the membrane potential crosses its threshold, the model triggers an escape response.

### 4. Thoracic Ganglion Motor Outputs

- **TTM (Tergotrochanteral Motor Neuron):** Models a rapid leg-powered jump away from a threat.
- **DLM (Dorsal Longitudinal Muscles):** Models wing-powered evasive maneuvers, including rapid acceleration and banking turns.

*Note: These are game simulation mechanics inspired by biological concepts, not a validated, full biological connectome simulation.*

---

## ðŸ“Š Real-Time Fly Brain HUD, Radar & Oscilloscope

The telemetry interface provides real-time combat feedback.

- **ðŸª° Fly Proximity Radar:** Tracks nearby flies and displays directional indicators such as `â†‘ AHEAD`, `â†— RIGHT-FRONT`, `â† LEFT`, and `â†“ BEHIND`.
- **Swatting Range Indicator:** Pulses green when a fly enters the modeled swatting range of **3.8 m or less**.
- **Connectome Diagram:** Visualizes signal flow from the eyes through LC4, the central complex, and giant-fiber-inspired escape outputs.
- **Membrane Oscilloscope:** Displays a rolling voltage trace and simulated action potentials.
- **LC4 Looming Rate:** Displays the modeled retinal expansion rate.
- **Flight Frequency:** Displays simulated wing-beat frequency in Hz.
- **TTM Status:** Shows whether the jump reflex is armed or has fired.

---

## ðŸŒ² 8-Level Campaign & Complete Arsenal

| Level | Level Name | Weapon | Type | Fly Speed | Chaos / Reflex | Goal |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: |
| **1** | Woodland Canopy | Badminton Racket | Melee Swat | 7.5 m/s | 1.0 (âˆ’46 mV) | 3 |
| **2** | Pine Thicket | Tactical Handgun | Semi-Auto Pistol | 9.0 m/s | 1.3 (âˆ’49 mV) | 5 |
| **3** | Bramble Hollow | MAC-10 Submachine Gun | 800 RPM SMG | 10.5 m/s | 1.6 (âˆ’52 mV) | 7 |
| **4** | Mist Valley | Pump Action Shotgun | 8-Pellet Buckshot | 12.0 m/s | 1.9 (âˆ’55 mV) | 8 |
| **5** | Deep Forest | AK-47 Assault Rifle | 7.62 mm Auto Rifle | 13.5 m/s | 2.2 (âˆ’58 mV) | 10 |
| **6** | Old Lumber Mill | Heavy Squad LMG | 75-Round Belt Box | 15.0 m/s | 2.5 (âˆ’61 mV) | 12 |
| **7** | Eagle's Ridge | Tactical Sniper Rifle | 4Ã— Optic Scope ADS | 16.5 m/s | 2.8 (âˆ’64 mV) | 10 |
| **8** | The Hive Core | RPG-7 Rocket Launcher | Explosive 12 m AOE | 18.5 m/s | 3.3 (âˆ’67 mV) | 15 |

*Fly speeds, reflex thresholds, and level goals represent the game's configured difficulty parameters.*

---

## ðŸ•¹ï¸ Weapon Controls

- Press **1â€“8** or use the **mouse scroll wheel** to select an unlocked weapon.
- Starting at Level 2, press **Z, X, C, V, or B** to cast the five magic spells.
- The spell hotbar displays the corresponding key for each spell.
- **Hold Left Mouse Button:** Continuous fire for supported automatic weapons, including the SMG, AK-47, and Heavy LMG.
- **Right Mouse Button:**
  - **Sniper Rifle:** Activates the modeled 4Ã— telescopic zoom with a rangefinder reticle.
  - **Other firearms:** Aligns the tactical sights for more precise aiming.
- **RPG Rocket Launcher:** Fires propelled rockets with exhaust smoke trails. On impact, rockets create an explosion with a modeled **12 m area of effect**, allowing multiple flies to be eliminated in one blast.

---

## âš¡ Progressive Biological Fly Difficulty

With each level, the simulated fly behavior becomes more challenging.

- **Flight Speed:** Increases from 7.5 m/s to 18.5 m/s.
- **Unpredictability and Saccades:** Higher levels introduce more frequent 3D zigzags, vertical jinks, and sharp multi-axis evasive maneuvers.
- **Escape Reflex Sensitivity:** The configured spike threshold changes with difficulty, influencing how readily flies trigger evasive responses.
- **Threat Response:** Higher-tier flies react more quickly to modeled threats such as muzzle flashes and rapid visual expansion.

These parameters are game-balancing settings inspired by insect neurobiology rather than exact measurements of real fruit fly behavior.

---

## ðŸ”Š Procedural 3D Audio â€” Web Audio API

The game uses procedural audio effects to create an immersive hunting experience.

- **3D Spatial Fly Buzz:** Dual-harmonic oscillator synthesis, pitch jitter, simulated Doppler shift, and HRTF-based positional panning.
- **Weapon Audio:** Dynamic swooshes for the racket, sharp impact sounds for the pistol, and rapid-fire audio for machine guns.
- **Biofeedback:** A synaptic-style audio chirp plays when the simulated Giant Fiber circuit fires an action potential.
- **Forest Ambience:** Procedural wind generation and intermittent woodland bird sounds.
- **Audio Toggle:** Press **M** to mute or unmute spatial audio.

---

## ðŸ› ï¸ Technology Stack

- **Three.js** â€” 3D graphics and rendering.
- **JavaScript** â€” Game logic, weapon systems, movement, and AI behavior.
- **Web Audio API** â€” Procedural audio and spatial sound effects.
- **HTML5 & CSS3** â€” User interface, HUD, and menus.
- **Python** â€” Optional local development server through `run_game.py`.

---

## ðŸš€ Play the Game

Ready to hunt?

<p align="center">
  <a href="https://cbagh0819-ctrl.github.io/kill-the-fly-neural-hunter/landing.html#magic">
    <img src="https://img.shields.io/badge/â–¶_LAUNCH_GAME-PLAY_NOW-00C853?style=for-the-badge" alt="Launch Game" />
  </a>
</p>

**Live Demo:** https://cbagh0819-ctrl.github.io/kill-the-fly-neural-hunter/landing.html#magic

---

## ðŸ“Œ Project Information

**Project:** KILL THE FLY: Neural Hunter  
**Genre:** 3D First-Person Shooter (FPS)  
**Platform:** Web Browser  
**Graphics Engine:** Three.js  
**Audio Engine:** Web Audio API  
**Game Modes:** 8-Level Campaign and Endless Mode  

---

<p align="center">
  <strong>ðŸª° KILL THE FLY: Neural Hunter</strong>
  <br />
  <em>Aim fast. Think faster. Outsmart the swarm.</em>
  <br /><br />
  <a href="https://cbagh0819-ctrl.github.io/kill-the-fly-neural-hunter/landing.html#magic">ðŸŽ® PLAY THE LIVE DEMO</a>
</p>
