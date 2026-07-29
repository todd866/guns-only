# Ship C — Catshot light story Implementation Plan

> **For agentic workers:** Execute after Ship B. Stage explicit paths only.

**Goal:** Gallery→portal→sky light story + short post-airborne quiet fade.

**Architecture:** Extend `rapier_launch_fx.js`; warm daylight portal sheet; amber rail cue; post-handoff fade while `update` still called.

## Tasks

1. Portal/rail warmth + earlier sheet
2. Post-handoff fade (~1.2 s)
3. Tests + stamp + push
