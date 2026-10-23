# Saucer Springs design pack

- [Interactive design map](index.html): 16 MK64 course counterparts, four battle arenas, 27 base places and shared systems. Self-contained; open the HTML file directly, including offline.
- [Master design](master-design.md): world contract, all course and venue briefs, alien marshal, portal, items, race rules, vehicles, assets and build sequence.
- [Concept sheet](concept-sheet-v1.png): alien marshal, Wavepool Beach and Dreamland portal. Generated with the built-in image tool; [exact prompt](concept-prompt.txt). This is a visual target, not a screenshot of the game.
- [Request ledger](../../rc-design-request-ledger.md): recovered owner direction and later corrections.

Current direction: the friendly alien/saucer replaces the robot MP; Rainbow Road is reached through a drive-through Dreamland portal. The wavepool is the Koopa Troopa Beach counterpart. The rest of the base remains physically connected and driveable. Course references describe the mechanical correspondence; proposed locations and unfinished assets are labelled.

## Editing and rebuilding

`build-data.py` owns the place/course/battle catalogue. It writes `design.json` and refreshes the marked catalogue sections of `master-design.md`; edit the master document outside those markers for shared rules. `atlas-template.html` owns presentation. From the repository root:

```sh
python3 docs/design/saucer-springs/build-data.py
node tools/rc/build-design-atlas.mjs
```

The generator embeds the current source-derived road overview and runway coordinates. They are already in world XZ coordinates. Dashed atlas links express desired connections; they are not navigation paths or verified driving routes. The HTML includes OpenStreetMap attribution, and the underlying data licensing is in [the world asset licence](../../../web/wwwroot/rc/assets/world/LICENSE.md).

## Verification, 23 October 2026

`tools/rc/check-design-atlas.cjs` passed 13 viewport states: all four views at 1280×720, 390×844 and 667×375, plus 200% text at phone portrait. It exercised every course and place, map keyboard navigation, dialog focus/escape, offline reload and arena selection. Zero browser errors or HTTP requests. Browser cleanup is in `finally`. It uses the repository’s Playwright install and Ian’s reusable viewport helper.

Actual dark/light laptop, portrait/landscape phone and enlarged-text screenshots were inspected. Parent review corrected overlapping map pins, a clipped landscape reader, invisible labels and an incorrectly inverted runway coordinate. The final regenerated map and repeated checker passed. [Preview](atlas-preview.png); detailed evidence is in `evidence/rc-open-world/design-atlas/`.

Adversarial review found no remaining material design contradiction. Its distinction between specification and implemented game remains explicit; no proposed venue is represented as constructed. The separate verified RC production release is recorded in [the release checkpoint](../../rc-release-2026-10-23.md).
