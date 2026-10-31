# Water and lighting plan

From Ben Haire's brief (30 Oct 2026, relayed by the owner) and the parity rule. The Mac app hosts
the web game, so every feature lands in the web build first (WebGL2). The native Metal renderer
only improves how the same scene is drawn.

## Water

**Which technique for which water body.** APIC is a fine solver, but most of our water is not a
free-surface fluid problem:

| Water body | Goal | Technique |
|---|---|---|
| Rouge River (planned) | flowing water you drive and boat on; wakes behind jet boats | **flow maps** (advected normal/detail maps along an authored flow field) + a small **FFT** wind-chop tile; a GPU **shallow-water heightfield** only around the player for wakes and boat interaction |
| Wavepool / Sunrise Splash beach | big readable set waves that break | **FFT ocean** (Tessendorf) for the swell plus authored **Gerstner** set waves that steepen and break |
| Puddles, pools | still water | analytic ripples only |

APIC (or FLIP) is kept for local splash and spray effects on top of the heightfield, where a real
free surface is visible: afterburner spray, a car landing in the river. It is never the whole river.

**Shading (both renderers):** Schlick **Fresnel**; **reflection** (screen-space in the web, ray
traced natively); **refraction** with per-channel Beer–Lambert **depth absorption**; **analytic
normals** from the FFT/Gerstner derivatives, with **LEAN** mapping so specular doesn't sparkle at
distance; **roughness** from slope variance; specular from the real sun; cheap **SSS** (light
through thin wave crests) if the frame budget allows; **Jacobian foam**, where the FFT/Gerstner
Jacobian determinant falls below a threshold, accumulated and decaying in a foam buffer.

WebGL2 has no compute shaders, so the web FFT runs as fragment passes (ping-pong butterfly) at
modest resolution (128² cascade). Native runs the same spectra in Metal compute.

## Lighting (native renderer)

1. **ReSTIR DI** first: many-light direct lighting for the night scenes (Dreamland, Night Wave).
2. **GI by probes plus caching** (DDGI/Lumen-style radiance cache), refreshed with ray tracing. This
   is the default GI path.
3. **ReSTIR GI**, then **ReSTIR PT**, only when profiling shows headroom. Each falls back to the
   hybrid raster/RT path.
4. **Telemetry**: per-pass GPU timestamps (MTLCounterSampleBuffer) for raster, shadows, DI, GI and
   PT, reported with the frame-time profile, so every technique is chosen on numbers.

**API:** Metal 3. Use Metal 4.1 extensions only where they clearly pay (RT-core parallelism,
tensor cores), and keep them isolated behind a capability check, not a dependency.

## Gates

- Web: the existing hardware release gate, plus the app frame gate
  (`tools/rc/native/check-app-frames.sh`, p95 ≤ 33 ms against Chrome in the same minute).
- Every water and lighting change is rendered and compared side by side with the previous build
  before it ships (owner: graphics must be "actually good", not just technically present).

## Status (30 Oct, first attempt)

`web/wwwroot/rc/open-world/water-surface.js` has the Gerstner swell, analytic normals, depth
colour and Jacobian foam, and it renders. It is **not wired in**, because side-by-side renders were
no better than the flat pool. Three things block it:
1. The car physics treats the pool as flat ground at y ≈ 0, so any visible swell above about
   6 cm swallows the car. A swell needs a floating ride: buoyancy in the physics, or boat mode
   (planned for the river anyway). That comes first.
2. A baked landmark ground plane sits at y = 0.02 under the pool with a depth bias, so a water
   surface near it z-fights or vanishes. Cut it out under water bodies.
3. The open world dims the scene environment to 6%, so water reflects almost nothing. It needs
   its own sky probe (or screen-space reflection), not a 9× intensity hack, which went milky.
