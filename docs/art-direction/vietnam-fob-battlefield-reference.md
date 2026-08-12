# Vietnam FOB & battlefield photo reference

2026-08-12. Owner directive: "get some photos of actual Vietnam War FOBs and recreate
that, and battlefields too." Public-domain US Army/USMC photographs (NARA via Wikimedia
Commons) live in `docs/art-direction/reference/vietnam-fob/`. This document is the
distillation: what the photographs actually show, and the concrete deltas they demand
from Camp Ember and the corridor. Renderer target stays the house illustrative style
([[art-direction-tf2]] doctrine) — we recreate STRUCTURE, MASSING and PALETTE, not
photorealism.

## What the photographs show (only claims from frames actually reviewed)

**FSB Sedgwick, aerial (flat country).** A near-perfect pale CIRCLE punched out of dark
cultivated paddies. The bulldozed-earth scar IS the base: almost nothing green survives
inside the wire. A continuous outer berm ring with vehicles and bunkers along its inner
face; an inner ring road; five-plus artillery positions as sandbag ROSETTES (a circular
pit with radiating blast-wall lobes, clover/star-shaped from the air); a dense center
cluster (TOC, tents, antenna farm); wheel tracks radiating outward through the fields
like cracks; a large burn scar just outside the wire. Shape language: circle, rosettes,
radial tracks, pale-scar-on-dark-country.

**Firebase Granite, aerial (riverside lowland — Camp Ember's real-world twin).** An
IRREGULAR red-brown laterite scar carved out of jungle beside a dark river. Black burned
patches inside and beside the scar. Gun pits read as dark rings scattered across the red
earth. Track spaghetti loops everywhere — nothing moves in straight lines. The jungle
edge is RAGGED: a defoliated/thinned fringe, then dense canopy. Palette: red-brown earth,
black burns, dark olive canopy, near-black water.

**1/502 firebase near the A Shau Valley, 1969, aerial-oblique (mountain variant).** A
red-earth saddle bulldozed along a ridge crest, connected by a crest road. The slopes
falling away are burned BLACK with skeletal defoliated trees. Bunkers are low mounds
with bare-metal (PSP/culvert) roofs glinting silver. Troops mustered on the pad spell
out unit numerals — the pad doubles as the parade ground/helipad.

**B-52 craters near Dak To, 1967, aerial.** Pale blast circles punched through dark
canopy in loose overlapping STICKS (bomb-train lines), each crater a bright scar ringed
by blown-down trees. Craters cluster and overlap; they never appear alone.

**Downloaded, not yet reviewed frame-by-frame** (kept for the corridor-slice artist
pass): FSB Tess aerial, Firebase Cork (Nov 1968) aerial, Firebase Normandy (Jul 1968)
aerial, Firebase Black Hawk bunker close-up.

## The deltas these photos demand

### Camp Ember (nearest builds — the FOB already has 74 authored parts + spawn safety volume)

1. **The scar is the base.** Replace "neat pads on green terrain" with an irregular
   laterite APRON — a large bare-earth blob (Granite's read) whose ragged edge, not a
   rectangle, meets the jungle. The existing terrain-apron machinery (flatten/blend as
   the LAST terrain op) already supports this; the delta is mostly the surface material
   region and its irregular boundary.
2. **Berm ring with an inner ring road** around the core, revetments and bunkers hugging
   the berm's INNER face (Sedgwick). Our current revetments float in open space.
3. **Rosette positions.** At least two sandbag rosettes (circular pit + radiating lobes)
   — they are the single most recognizable firebase signature from the air, even without
   artillery gameplay. Mortar-pit scale is fine.
4. **Track spaghetti.** Worn wheel-track ribbons looping between pads, gates and the
   berm; tracks radiating out the departure mouth. Reuses the road-ribbon system with
   narrower, fainter, laterite-toned ribbons.
5. **Burn scars + defoliated fringe.** One or two black burn patches inside/near the
   wire; a thinned, ragged tree ring before dense canopy (kills our current clean
   green-to-pad transition).
6. **Bunker read.** Low mounds with sandbag sides and glinting PSP roofs (A Shau), not
   crisp boxes. The Build C parked Cobras belong in berm-side revetments per Sedgwick's
   vehicle line.

### The corridor battlefield (Camp Ember → Long Fang → Iron Bell)

7. **Crater sticks, not lone craters** (Dak To): overlapping pale circles in short lines
   through the canopy, with blown-down fringes; cluster them near contested ground.
8. **Defoliated swathes**: dead-gray/black skeletal-tree bands along parts of the river
   flanks — instant "this valley is being fought over" read, and honest era texture.
9. **Burned patches** near hostile positions and along the road (Granite's black blobs).
10. **Palette discipline**: red-brown laterite, sandbag tan, olive drab, burned black,
    dark water — the photographs contain almost NO saturated color. Our current
    control-green/hazard-orange accents should survive only as HUD/instrument colors,
    never terrain ([[colour-fitting-is-the-wrong-axis]] still applies: geometry and
    coverage first, palette follows).

## Sources

All images US federal government work (public domain), via Wikimedia Commons
"[Category:Vietnam War fire support bases](https://commons.wikimedia.org/wiki/Category:Vietnam_War_fire_support_bases)":
Aerial_view_of_Fire_Support_Base_Sedgwick.jpg; Aerial_view_of_Firebase_Granite.jpg;
1-502_infantry_Firebase_in_I_Corps_near_the_A_Shau_Valley_1969.jpg;
[B-52_bomb_craters_near_Dak_To_1967.jpg](https://commons.wikimedia.org/wiki/File:B-52_bomb_craters_near_Dak_To_1967.jpg);
plus Tess/Cork/Normandy/Black Hawk (unreviewed, listed above).
