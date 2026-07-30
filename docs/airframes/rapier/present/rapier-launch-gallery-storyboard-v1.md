# Rapier launch gallery storyboard v1

Status: **reference-only concept; rejected as a runtime source asset**

- Generated: 2026-07-30
- Raster: `rapier-launch-gallery-storyboard-v1.png`, 1672 × 941 PNG
- SHA-256: `782d11a9b37ff626c540f849c5f2d735d6484360f74fdcf9a2ca158019a505bd`
- Generator: OpenAI image-generation tool; the tool response did not expose a model revision or seed
- Inputs: text only; no reference image

This sheet makes the intended sequence reviewable before any image-to-video work. It does not
authorize a generated runtime plate, does not prove structural feasibility, and must not be used to
derive gameplay geometry. The live kernel and the engineering basis of design remain authoritative.

## Review

Useful:

- consistent centred forward camera across the four panels;
- concrete bay rhythm, amber maintenance light, restrained dust, and a legible daylight reveal;
- the last two panels communicate the covered-gallery-to-open-ramp transition without a fantasy
  door, pressure cannon, or neon electromagnetic effect;
- no aircraft, cockpit, HUD, logo, weapon, or text is baked into the background.

Not yet approved for production:

- the guide rails and motor stators are not separated clearly enough to teach the mechanical load
  path;
- pressure-relief plenums, coolant circuits, slot drains, and maintainable equipment access are
  under-articulated;
- the ramp silhouette reads steeper and more convex than the live 12-degree, 411.29 m-radius arc;
- the sheet is a spatial/mood target, not a geometrically registered camera plate;
- no source camera trace, alpha matte, temporal-consistency test, decode benchmark, or crossfade
  proof exists.

## Exact prompt

> Create a single 2-by-2 cinematic storyboard contact sheet for an original fictional 2040
> dispersed interceptor launch system, landscape 16:9 overall, four equal panels with thin neutral
> gutters, no captions and no text. Restrained painterly realism with physically credible civil and
> electrical engineering, muted Ukraine-steppe wartime palette, warm industrial amber against cool
> concrete and soft cerulean daylight; original visual language, not imitating any named film,
> studio, artist, franchise, or existing aircraft.
>
> The same fixed forward capsule-eye camera and the same buried launch gallery must remain
> geometrically consistent across all four panels. The camera is centered roughly 1.5 metres above
> a precision guideway, looking forward. Gallery clear bore is 14 metres wide by 8 metres high,
> reinforced-concrete cut-and-cover construction, about 434 metres covered. Show two load-bearing
> mechanical guide rails plus separate segmented linear-induction-motor stator modules; never depict
> levitation. Structural ribs and waterstopped construction joints repeat every 10 metres. Shielded
> amber maintenance lamps sit at the ribs. Baffled bilateral pressure-relief plenums appear at
> 40-metre spacing. Include realistic cable trays, closed-loop coolant pipes, equipment cabinets in
> accessible alcoves, drainage slot gutters outside the guideway, a clean FOD-controlled floor,
> alignment marks without legible writing, restrained concrete dampness and wear. No fantasy vacuum
> door.
>
> Panel 1, launch start: almost stationary inside the dim gallery, immediate rails and stators crisp,
> distant portal only a tiny cool point, lamps calm, practically no dust.
>
> Panel 2, middle acceleration: identical fixed camera moving forward under constant acceleration,
> closer-spaced apparent rib cadence and mild vibration implied by composition, segmented stators and
> guide rails readable, only fine residual dust moving outward toward side relief plenums.
>
> Panel 3, portal approach: daylight portal now large and naturally exposed, concrete headwall and
> service details emerging, restrained dust drawn toward vents, no giant pressure cloud, no
> overexposed white-out.
>
> Panel 4, fully live handoff visual target: camera has cleared the covered gallery onto an open
> 86-metre constant-radius concrete launch ramp climbing smoothly to 12 degrees, low grassed earth
> berm and portal headwall behind the threshold, drainage interceptor across the portal, soft
> cerulean Ukraine sky and rolling steppe ahead. The guide rails remain physically continuous over
> the ramp.
>
> Important exclusions: no aircraft, no cockpit frame, no HUD, no people, no weapons, no insignia,
> no logos, no readable text, no carrier deck, no neon purple electricity, no lightning, no maglev
> glow, no hovering hardware, no doors across the launch bore, no sci-fi spaceship tunnel, no huge
> sparks, no fireball, no cinematic camera cuts, no fisheye, no watermark. This is an
> engineering-cinematic approval storyboard for a background-effects plate; the player aircraft and
> HUD will remain live and are deliberately absent.

## Next-generation input contract

Do not ask a video model to invent the camera path. Export the live renderer's camera matrices,
projection/FOV, depth/occlusion mattes, portal silhouette, and progress-to-time trace at 60 Hz. An
image-to-video or controlled-video pass may add only surface light, restrained particulate motion,
and painterly material response. It must preserve the registered rails, ribs, portal, and ramp, and
it must exclude the aircraft, HUD, sky handoff, ramp traversal, radio, and audio.
