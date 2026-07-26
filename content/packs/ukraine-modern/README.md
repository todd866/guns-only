# Ukraine 2030s — one fictional theatre

This pack defines the single synthetic Ukraine theatre used by `guns-only`. It is a fictional
2030s setting, not a reconstruction of a real locality. It contains no real-world coordinates,
formations, bases, or current operational data and is unsuitable for real navigation or planning.

`environment/terrain/soniachne-steppe.*` is one nested terrain product:

- `soniachne-region.truth` covers a 262.144 km square regional frame at 256 m spacing for
  high-altitude continuity, collision, AGL, Auto-GCAS, and long mission routes;
- `soniachne-steppe.truth` preserves the original 16.384 km square Soniachne detail cell at 32 m
  spacing, byte-for-byte, with no vertical exaggeration;
- `soniachne-steppe.terrain` carries both regional macro chunks and the four detailed
  32/64/128/256 m LOD chunks in the same fictional datum;
- the two generated previews and manifest hashes make both fidelity bands reviewable.

Macro terrain is always required. Mission contracts request micro scenery for the low-level detail
cell; regional sorties suppress ambient fields, buildings, and vegetation at high altitude and
restore them on descent with hysteresis. The result is one theatre that supports both low-level
visual reference and the Rapier's regional climb/intercept route without loading ground-level
density where it cannot contribute to the picture.

The Rapier mission uses a stationary, fictional catapult-and-arresting strip bound to a fixed
regional corridor. It is a land installation in both simulation and presentation, not a ship or a
representation of a real facility.

All current missions are local instances of this same physical theatre. They ignore multiplayer
room-origin translations, and the browser does not place remote aircraft or bogeys into their
flight scenes. Presence protocol v2 lacks per-contact world-frame/mission-instance identity and
terrain-aware sector assignment, so treating a common theatre ID as spatial compatibility would be
unsafe. Shared flight presentation remains disabled until protocol v3 carries those identities and
assignment can guarantee that simulation terrain sampling and rendered placement agree.

Current combat remains guns-only. The detail cell's procedural buildings and infrastructure are
ambient and non-targetable. Future combat and medevac work will add authored hero cells inside this
same theatre: first stable feature/collider truth, then 1–2 m landing-zone surfaces and individual
obstacles. Until those layers exist, no broad terrain sample or decorative prop may imply a safe
LZ, a medical facility, or an authoritative target.

Regenerate the pack from the repository root:

```sh
python3 tools/terrain/build_ukraine_training_sector.py
```
