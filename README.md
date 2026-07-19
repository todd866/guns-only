# Guns Only

A browser flight sim about the two hardest things a fighter pilot does: **win a turning gunfight**, and
**land the jet back on the carrier**.

**▶ Play: [guns-only.vercel.app](https://guns-only.vercel.app)** — desktop or mobile, nothing to install.

You fly a Korean-War-era swept-wing fighter — the F-86 Sabre and its carrier-going cousin, the **FJ-2
Fury** — off a straight-deck carrier: get airborne, turn and burn with a bandit, then bring it back
aboard and catch a wire. The flight model is tuned to the **real Sabre's energy envelope**, so the fight
is a genuine energy fight and the approach is a genuine back-side-of-the-power-curve carrier approach.

## What makes it different

**It's a decision-making sim, not a switchology sim.** The augmentation is your reflexes — it flies the
jet's motor skills — so your attention goes to the *decisions*: where to point, when to shoot, when to
break, when you're bingo fuel and have to come home. Situational awareness is the whole game; the HUD's
job is to give it to you, not bury you in text.

- **Real energy model** — corner speed, sustained-G, turn rate, climb, ceiling, and energy bleed are
  tuned to documented F-86 figures, so a turning fight reads like real BFM instead of an arcade spiral.
- **A gun that's actually a gun** — .50-cal ballistics with time-of-flight and a computed lead pipper.
  You have to lead the target, and you can miss.
- **A reactive adversary** — the bandit turns into the fight, breaks when you're gunning it, jinks, and
  manages its own energy.
- **The carrier recovery** — a paddles LSO and the ball, the burble behind the boat, and a real
  arrestment: catch a wire and roll to a stop. Axial or angled deck (press **C**).
- **Variable difficulty** — clean traps make the sea rougher and start the deck moving; a bolter eases
  off. It varies like weather, around a rising skill baseline.
- **Every flight recorded** — the sim captures each sortie, which is how the flight model gets tuned
  against what people actually fly instead of guesswork.

## Controls

| Action | Desktop | |
|---|---|---|
| Pitch | **↓** pull / **↑** push | back-stick = nose up |
| Roll | **← →** | |
| Throttle | **W / S** | past MIL = afterburner |
| Guns | **F** | |
| Padlock the bandit | **V** | keep tally through a turn |
| Restart · beats | **R** · **1–5** | |

On mobile: on-screen throttle, tilt-to-roll, and a fire button.

## How it's built

A single deterministic **C# 6DOF flight kernel** (float64, RK4 at 120 Hz) compiled to WebAssembly via
Blazor, rendered with **three.js** and a canvas-2D glass HUD. The exact same kernel runs headless under
an **outcome-level test harness** that flies the real carrier beat end-to-end — finals → firewall →
intercept → guns → recover — because code gates aren't gameplay gates; the bugs that matter get caught
by flying it, not by unit tests alone.

```
web/          Blazor WASM shell — three.js render, canvas HUD, JS input
sim/          the deterministic kernel (aero, 6DOF, gun, carrier, doctrine)
sim.Tests/    the outcome-level flight harness + physics/accuracy tests
```

## Status

Playable prototype, under active development. Rough edges expected — it's being flown and fixed daily.
