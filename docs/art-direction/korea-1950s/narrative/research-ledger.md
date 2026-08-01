# Armstrong cable-strike research ledger

Status: intake in progress  
Last updated: 2026-07-30  
Mission dossier target:
`content/governance/korea-braided/missions/armstrong-cable-strike.dossier.json`

This file tracks the evidence needed to author the sequence. It is not the final source of truth.
Approved claims and sources move into the governed mission dossier, where strict validation requires
bidirectional source closure.

## Incoming corpora

### PaperLibrary

The active ingestion is acquiring approximately 83 deduplicated books across Armstrong biography,
Korean War history, naval aviation, F9F Panther, carrier operations and adjacent research lanes.
At the current snapshot, 11 mission-relevant works are available, including Hansen's *First Man*,
Thompson's *F9F Panther Units of the Korean War*, Field's official naval history, three additional
Panther studies, two Korean War air histories, Holloway's carrier history, Michener's
*The Bridges at Toko-Ri* and a postwar carrier study. The latter novel is cultural and dramatic
context, never evidence for Armstrong's words or sortie.

The Anna's Archive path now retains EPUB as well as PDF and extracts EPUB text through
`ingest_document`. The current page-level records and PaperLibrary IDs are captured in
[`source-register.json`](source-register.json); that file is a dated snapshot, not a declaration
that the broader intake has finished.

PaperLibrary is private research infrastructure. Copyrighted books may be used to locate facts,
primary sources and short defensible quotations. Their files, extracted text and long passages must
not be copied into the public Guns Only repository or redistributed with the game.

For every promoted claim capture:

- PaperLibrary work and document ID;
- full bibliographic citation;
- edition and publication year;
- page, section or stable locator;
- the claim in our own words;
- quotation only when necessary and within the applicable limit;
- source grade and perspective;
- whether the author cites an earlier primary record;
- any material disagreement with another source.

### Standalone visual and audiovisual archive

Incoming media is stored outside the public repository at:

`/Users/iantodd/Projects/armstrong-korea-research/`

The sweep currently includes:

- large NARA `127-N` image originals retrieved through Wikimedia Commons;
- *Carrier Action Off Korea*;
- VC-61 Panther reconnaissance film;
- two NARA `428` films showing USS *Leyte* straight-deck operations off Korea in December 1950 and
  January 1951;
- additional F9F, carrier and Korean War image/video candidates still undergoing URL and rights
  verification.

The *Leyte* footage is operational analog evidence, not evidence that Armstrong's *Essex* launch or
deck arrangement was identical. Every retained asset needs:

- archive and item identifier;
- original creator and holding institution;
- original date and caption;
- direct source page and download URL;
- rights statement at item level;
- file hash, format, dimensions or duration;
- what the asset supports;
- what it does not support;
- whether it may ship, may guide production only, or must remain research-only.

Do not infer public-domain status merely because an item appears on Wikimedia Commons, YouTube or
an archive mirror. Verify the underlying government-work or rights record.

## Primary source spine already located

| Source ID | Grade | Use | Current limits |
|---|---|---|---|
| `source.armstrong-nasa-sp-2011-4542.v1` | official oral history, pp. 16–18 | Armstrong's first-person account of the cable, six-to-eight-foot wing loss, Carpenter, no-landing decision, ejection near Pohang/K-3, recovery by Goodell Warren, and his old-style shotgun-shell/22-G seat recollection | Personal memory recorded roughly fifty years later; interviewer supplies an incident date, the exchange is not a radio transcript, and the seat description is not engineering source lock |
| `source.nhhc-hgram-033.v1` | later official synthesis | Mission, unit, target area, aircraft bureau number, competing incident accounts and recovery summary | Its 5 September/F9F-3 description is contradicted by the incident-specific contemporary Essex and CVG-5 reports |
| `source.nhhc-armstrong-photo-l38.v1` | primary archival metadata | Contemporary Armstrong image and target-area caption | Catalog says 3 September and “shot down”; caption alone cannot settle the full incident |
| `source.dpaa-korea-air-loss-register-2021.v1` | official DoD loss register, p. 4 | Records Armstrong, 3 September 1951, VF-51, F9F-2, BuNo 125122 and USS *Essex* | Compiled database, not the incident report; does not establish target, damage, ejection or recovery detail |
| `source.nhhc-buno-appendix-1910-1995.v1` | official compiled bureau-number appendix, printed p. 554 | Assigns the 125080–125152 block, including 125122, to F9F-5 | Conflicts with the incident-specific F9F-2 reporting; only the aircraft history card can resolve the individual airframe configuration and whether a recorded identifier is wrong |
| `source.nhhc-essex-action-report-1951.v1` | primary action report, p. 3 | Dates the loss to 3 September; identifies Armstrong and BuNo 125122; records regained control and bailout over K-3 | Contemporary enemy-AA attribution conflicts with Armstrong's later cable recollection; exact target and damage geometry remain open |
| `source.nhhc-cvg5-action-report-1951.v1` | primary air-group action report, pp. 1, 4–5, 12 | Closes VF-51 as F9F-2 and the event to 3 September; records control loss, heavy ordnance, wing damage, landing-speed problem and ejection near K-3 | Contemporary AA/power-pole and two-foot account conflicts with Armstrong's later cable and six-to-eight-foot recollection |
| `source.hansen-first-man-2012.v1` | secondary synthesis, pp. 91–96 | Detailed mission synthesis, reproduced logbook, Carpenter inspection, ejection and recovery leads | Copyrighted; use to locate and compare primary records, not as shippable text |
| `source.thompson-f9f-units-2014.v1` | secondary unit history, pp. 29–30, 39 | VF-51, BuNo 125122, F9F-2 identification, target context and aircraft profile | Repeats the early antiaircraft-fire/telegraph-pole account; copyrighted research only |
| `source.nasa-armstrong-biography.v1` | official synthesis | Service outline and 78 combat missions | Not detailed enough for mission mechanics |
| `source.nhhc-f9f-summary.v1` | official synthesis / technical reference | Panther history, three-view and broad specifications | Exact mission variant and detailed systems require manual-level evidence |
| `source.f9f-pilot-handbook-1951.v1` | technical reference | Cockpit, limitations, procedures, seat and systems | Edition, scan provenance and usable page set still require verification |

Known direct locations:

- Armstrong interview in NASA SP-2011-4542, pp. 16–18:
  `https://www.nasa.gov/wp-content/uploads/2023/03/sp-4542.pdf`
- Naval History and Heritage Command H-Gram 033:
  `https://www.history.navy.mil/content/history/nhhc/about-us/leadership/director/directors-corner/h-grams/h-gram-033.html`
- NHHC Armstrong photograph catalog:
  `https://www.history.navy.mil/our-collections/photography/numerical-list-of-images/nhhc-series/naval-subjects-collection/l38-personnel/l38-02-07-013-ensign-neil-armstrong--f9f-pilot-korean-war--recon.html`
- DPAA Korean War air-loss register by name, Armstrong entry on PDF page 4:
  `https://www.dpaa.mil/portals/85/KoreaAccounting/korwald_acc_NAME_20211006.pdf`
- NHHC bureau-number appendix, archived official PDF asset, PDF p. 38 / printed p. 554:
  `https://web.archive.org/web/20240704022315id_/https://www.history.navy.mil/content/dam/nhhc/research/histories/naval-aviation/pdf/app09.pdf`
- USS *Essex* Serial 093 action report, archived original NHHC PDF asset; scan/printed p. 3:
  `https://web.archive.org/web/20250418222808id_/https://www.history.navy.mil/content/dam/nhhc/research/archives/action-reports/Korean%20War%20-%20Carrier%20Combat/PDF%27s/cv9a-51.pdf`
- CVG-5 Serial 065-51 action report, archived original NHHC PDF asset; scan/printed pp. 1,
  4–5 and 12:
  `https://web.archive.org/web/20250418211010id_/https://www.history.navy.mil/content/dam/nhhc/research/archives/action-reports/Korean%20War%20Carrier%20Air%20Group%20Combat/PDF%27s/cvg5-51.pdf`
- USS *Essex* Korean War action reports:
  `https://www.history.navy.mil/content/history/nhhc/research/archives/digital-exhibits-highlights/action-reports/korean-war-carrier-combat/essex-cva9.html`
- NHHC F9F Panther historical summary:
  `https://www.history.navy.mil/content/dam/nhhc/research/histories/naval-aviation/naval-aircraft/pdfs/f9f.pdf`

## Provisional claims

These IDs are referenced by the playable sequence. They do not become approved facts until the
mission dossier registers their sources and qualifications.

### `claim.armstrong-vf51-essex.v1`

Provisional statement: Ensign Neil Armstrong served as a VF-51 Panther pilot aboard USS *Essex*
during its 1951 Korean War deployment.

Needed:

- cruise/action-report unit and embarkation confirmation;
- exact squadron designation and carrier naming appropriate to September 1951;
- no later CVA classification applied anachronistically in dialogue or markings.

### `claim.armstrong-armed-recon-wonsan.v1`

Provisional statement: The incident occurred during an armed-reconnaissance mission against
transportation and storage targets west of Wonsan, in or near the Majon-ni area.

Needed:

- action-report sortie entry;
- target coordinates or target-area designator if available;
- formation size, loadout, attack direction and mission purpose;
- distinction between what the mission planned and what Armstrong personally attacked.

### `claim.armstrong-cable-strike.v1`

Provisional statement: Armstrong recalled striking a cable during the low-level mission rather than
being hit directly by antiaircraft fire.

Needed:

- registered support: Armstrong's first-person account in NASA SP-2011-4542, pp. 16–18;
- contemporary action-report wording;
- any squadron diary, pilot report or later first-person account;
- an explicit note that “cable between hills” is stronger than any unsupported claim about a whole
  valley filled with cables.

### `claim.armstrong-wing-loss.v1`

Provisional statement: Armstrong recalled the cable cutting approximately six to eight feet from
the right wing.

Needed:

- registered support: Armstrong's six-to-eight-foot estimate in NASA SP-2011-4542, pp. 16–18;
- whether the aileron, tip tank or other components were lost;
- authoritative geometry for the relevant Panther variant;
- a declared simulation target rather than false precision.

### `claim.carpenter-flight-lead.v1`

Provisional statement: USAF Major John Carpenter was the flight lead and flew alongside the damaged
aircraft.

Needed:

- registered support: Armstrong identifies Carpenter as his USAF major flight lead in NASA
  SP-2011-4542, pp. 16–18;
- formation and exchange-officer context;
- whether any surviving report records his observations or words.

### `claim.armstrong-no-landing-decision.v1`

Provisional statement: Armstrong and Carpenter judged that slowing the damaged Panther for a
landing risked loss of control and chose ejection instead.

Needed:

- registered support: Armstrong's no-landing explanation in NASA SP-2011-4542, pp. 16–18;
- the landing alternatives actually considered;
- source distinction between carrier recovery, runway landing and ejection location;
- no invented technical dialogue.

### `claim.armstrong-ejection-friendly-territory.v1`

Provisional statement: Armstrong flew south into friendly territory, ejected near Pohang/K-3 and
was met by Goodell Warren in a jeep.

Needed:

- registered support: Armstrong recalls flying south, ejecting near Pohang/K-3 and being met by
  flight-school roommate Goodell Warren in a jeep in NASA SP-2011-4542, pp. 16–18;
- exact ejection point and intended recovery area;
- separate corroboration for H-Gram's later wind-blown-back-over-land detail, plus the parachute and
  landing account;
- Pohang/K-3 relationship and who operated it at the time;
- independent corroboration of the ground-recovery identity, vehicle and location;
- source separation between contemporary record and later anecdote.

### `claim.panther-ejection-seat.v1`

Provisional statement: Armstrong later described an old-style shotgun-shell-powered ejection seat
and called it a 22-G seat.

Needed:

- 1951 pilot handbook and maintenance source;
- exact seat model, checklist, limits and separation sequence;
- independent engineering source for the recalled cartridge mechanism and 22-G figure;
- reconstruction boundaries for body injury and safe envelope.

### `claim.cable-field-gameplay-reconstruction.v1`

Provisional statement: The playable valley uses an authored sequence of cable obstacles to make the
documented strike arise through physical collision during the required attack route.

This is reconstruction unless better evidence proves the local cable layout. The player-facing
archive must say so. Cable geometry can be tactically plausible without being presented as a map of
the actual defensive installation.

### `claim.panther-damage-flight-reconstruction.v1`

Provisional statement: The simulated wing loss reproduces the documented scale and qualitative
handling problem using a bounded public-data aerodynamic reconstruction.

Needed:

- F9F geometry, control surfaces, fuel and mass distribution;
- relevant damage and flight-test analogs;
- sensitivity study that establishes a difficult but survivable envelope;
- disclosure that exact structural fracture and damaged aerodynamics are not known.

## Material disputes and open questions

### Incident date — closed to 3 September 1951

The page-reviewed contemporary USS *Essex* chronology and CVG-5 report independently place the
event on 3 September 1951. The DPAA loss register and NHHC photograph catalog corroborate that
date. H-Gram 033's 5 September date is a later synthesis error: retain it in the source ledger, but
use **3 September 1951** in titles, briefings and script.

### Panther subtype — incident reporting supports F9F-2; airframe record open

The contemporary CVG-5 composition table identifies VF-51's aircraft as F9F-2 and carries that type
through the 3 September damage table. The Essex report links Armstrong and BuNo 125122 to that
date; the DPAA register independently records F9F-2. H-Gram 033's F9F-3 description is a later
synthesis error. However, NHHC's generic bureau-number appendix assigns the 125080–125152 block,
including 125122, to F9F-5. Lock the incident-level mission identity to **F9F-2**, while preserving
the BuNo anomaly and treating the individual airframe's suffix, delivered equipment, cockpit,
engine, markings, loadout and damaged aerodynamics as open until its aircraft history card closes
the conflict.

### Cable field

Armstrong's own account establishes a cable. It does not presently establish the number, exact
layout, supporting poles, height or whether the cable was purpose-built as an aerial obstacle. The
game may author multiple hazards to create a coherent fixed-history run, but that layout remains
reconstruction.

### Exact radio

No transcript is currently registered. Later dramatizations must not become dialogue sources.
Until primary material appears, author only the communication functions:

- Armstrong reports the damage and handling;
- Carpenter takes inspection position;
- Carpenter reports visible wing condition;
- the pilots discuss landing risk and ejection;
- the flight coordinates the southbound route and ejection.

Write final words only after period phraseology and source review.

### Ground recovery

The jeep and flight-school acquaintance are now supported by Armstrong's own retrospective account:
he identified the driver as Goodell Warren, then a Marine lieutenant, near Pohang/K-3. Exact landing
surface, route, vehicle appearance and words remain uncorroborated. Keep those production details
uncommitted until the action report or another independent record closes them.

## Source-lock exit criteria

- [ ] PaperLibrary ingestion is complete and the collection IDs are recorded.
- [ ] Official government PDFs are downloaded, hashed and page-indexed.
- [ ] Every provisional claim has at least one permitted source and qualification.
- [ ] Material disputes have competing sources or an explicit unresolved state.
- [ ] Flight model, cable, damage, ejection and parachute claims have technical references.
- [ ] Every intended archival image or film has item-level rights metadata.
- [ ] Copyrighted research files remain outside the public repository.
- [ ] No script line depends solely on a secondary dramatization.
- [ ] The governed dossier passes `node tools/content/validate-governance.mjs --strict`.
