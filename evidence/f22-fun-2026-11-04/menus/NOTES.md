# Menu Variant Sheet Critique (`?shellTheme=glass|canopy|ink|bezel`)

Rendered at 1280×720 in headless Playwright Chromium (`channel: "chromium"`) over the static `web/wwwroot` server via DOM state driving (`#ready-screen[data-mode]`, `html.run-paused`, `#settings-screen.visible`, and `paintF22ResultInstrument` with `f22_recovered_victory.json` wave/score telemetry).

## 1. `.shell-theme-glass` (`?shellTheme=glass`) — Brushed MFD + Cyan HUD Rule
1. **Material & Depth:** Deep navy/slate MFD glass (`#08121b` dark, `#edf5f9` light) anchored by a 2 px `#38e8ff` cyan top HUD rule instead of diffuse drop-shadow soup.
2. **Typography & Alignment:** Tabular monospace (`tnum`) across all readouts (`1350 · W4 ×2`, `18/480`, `2:14`, `1.00×`) keeps vertical scan columns locked to the pixel across Debrief, Pause, and Settings.
3. **Picker & Pause Discipline:** Preserves exact row counts (cards + 1 primary row + 5 picker actions; 1 status strip + 1 primary row + 7 pause actions) with crisp cyan border rules.
4. **Settings & Keycaps:** All 11 audio/picture/aircraft rows and the 10-row two-column keybinding table fit cleanly inside the 720p viewport with top-lit cyan keycaps (`≥46×25 px`).
5. **Light & Dark Contrast:** Dark mode pairs `#edfaff` ink against `#08121b` (>15:1); light mode pairs `#071926` ink against `#edf5f9` (>14:1) with `#007799` rules and `#007348` nominal status marks.
6. **Tradeoff:** Full-width cyan fill on the primary action (`Fly First Merge` / `Resume` / `Again`) is high-energy MFD styling, which reads colder than the warm Ghibli hangar painting behind the picker.

## 2. `.shell-theme-canopy` (`?shellTheme=canopy`) — Dark Canopy-Tint Sheet + Backlit Keycaps
1. **Material & Depth:** Gold-indium/emerald F-22 canopy tint (`#0e1410` / `#162019` dark, `#eaefe8` light) with physical raised keycap tiles (`inset 0 1px 0` top bevel + `2px` bottom ledge) across utility actions and keybindings.
2. **Typography & Alignment:** Clean geometric sans labels paired with tabular monospace numbers (`1:14`, `1/2`, `+350`, `18/480`); zero wrapping or ellipsis across all four screens.
3. **Picker & Pause Discipline:** Each secondary action (`Practice`, `Logbook`, `Aircraft`, `Restart`, `Settings`, `Report`, `RTB`) sits in its own tactile keycap cell with emerald `#62f294` symbology and amber-gold `#f7d168` primary bar.
4. **Settings & Keycaps:** The 2-column keyboard matrix reads like a physical UFC/ICP keypad while keeping the exact 36 px row height and sticky `Reset keys` / `Done` footer.
5. **Light & Dark Contrast:** High contrast in both schemes (`#f4f7ec` on `#0e1410` dark; `#141f16` on `#eaefe8` light), with colour + symbol (`✓`, `◆`, `×`, `–`) carrying disposition state.
6. **Tradeoff:** The 8 px keycap gap on the 7-button Pause utility bar slightly narrows individual button widths compared to flush-divided strips, though all 44 px+ hit targets remain intact.

## 3. `.shell-theme-ink` (`?shellTheme=ink`) — Paper-and-Ink Ghibli Card + Single Vermilion Accent
1. **Material & Depth:** Warm archival paper (`#f7f2e7` light) and carbon-ink slate (`#1c1916` dark) with a 3 px vermilion (`#d95338` / `#c23b22`) top stamp rule and crisp 1 px hairline dividers.
2. **Typography & Alignment:** Editorial serif (`Iowan Old Style` / `Palatino`) for aircraft names and control labels paired with strict tabular monospace for scores, clocks, and keycaps.
3. **Picker & Pause Discipline:** Bridges ADR-0003's painted Ghibli hangar sky and the cold instrument layout without adding a single word or extra row.
4. **Settings & Keycaps:** Vermilion active switches and flat-bordered manual-style keycaps give the Settings card the clarity of a printed flight-manual checklist.
5. **Light & Dark Contrast:** Exceptional legibility in light mode (`#1f1b17` ink on `#faf6ec` paper) and warm, low-glare dark mode (`#f7f1e3` on `#1c1916`).
6. **Tradeoff:** Vermilion (`#d95338`) on primary buttons and active toggles sits close to aviation caution/warning hues, so in a combat debrief it can momentarily compete with red loss (`×`) indicators.

## 4. `.shell-theme-bezel` (`?shellTheme=bezel`) — Machined Bezel-and-Glass Cluster + Dial Reticles
1. **Material & Depth:** Machined anodized slate (`#12161c` dark, `#e6eaef` light) with double-bezel inset shadows (`inset 0 1px 0 #738294, inset 0 0 0 2px #0b0e12`) and a 2 px structural frame.
2. **Typography & Alignment:** High-contrast neo-grotesque labels (`SF Pro Display`) with bold tabular monospace readouts (`26–28 px` in Pause and Debrief) for instant peripheral scan.
3. **Picker & Pause Discipline:** Each aircraft card in the picker wears a recessed instrument bezel with a top-right dial reticle (`::after`) that illuminates an amber center pip (`#ffaa2b`) when selected.
4. **Settings & Keycaps:** Heavy 1.5 px bordered keycaps and recessed toggle tracks make the Settings card read like an avionics bay panel while keeping all rows aligned.
5. **Light & Dark Contrast:** Brushed-aluminum light mode (`#121820` on `#e6eaef`) and cockpit-grey dark mode (`#f2f5f8` on `#12161c`) hold crisp contrast across every symbol and value.
6. **Tradeoff:** The 2 px borders and double inset rings are the heaviest frame treatment of the four, trading a bit of open air for physical hardware weight.

---

## Recommendation (Pick): **`.shell-theme-canopy`** (`?shellTheme=canopy`) — with **`.shell-theme-glass`** (`?shellTheme=glass`) as close runner-up

- **Why `canopy` wins:** It marries the house F-22 look (gold-indium canopy tint, phosphor-emerald `#62f294` instrument glyphs, and amber-gold `#f7d168` primary action bar) with tactile backlit cockpit keycaps across Picker, Pause, Settings, and Debrief. It feels immediately like an F-22/avionics panel in both dark and light mode, harmonizes with the warm painted hangar backdrop, and preserves amber/red exclusively for primary/loss semantics without colour-channel ambiguity.
