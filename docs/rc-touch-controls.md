# RC touch controls — Build 407

The current owner instruction is **steering left, throttle/brake right**. It supersedes the earlier opposite mapping.

The left thumb slides horizontally to steer; vertical drift does not reduce steering. The right thumb uses a larger vertical analog pad: up drives forward, centre coasts, down brakes forward motion and then reverses through the existing vehicle physics. A separate right-side Brake button stops without reverse. Both axes spring to neutral on lift. Captured gestures continue outside their pad and clamp at full input, then clear on release, cancellation or lost capture. Resize, orientation change, backgrounding, pause and overlays clear input.

This follows the manual analog and release-to-zero behavior documented by [Feral's GRID Autosport mobile controls FAQ](https://www.feralinteractive.com/en/faqs/gridautosport/latest/ios/), consulted 26 October 2026. GRID offers separate steering/throttle controls and mirrored layouts; its throttle slider returns to zero on release. This implementation uses a horizontal steering pad rather than requiring a circular wheel gesture. Keyboard and gamepad mappings are unchanged.

Touch surfaces suppress selection, drag, callouts, context menus and browser gestures. The suppression is scoped to the controls; menu text remains normally selectable. Positioning includes iOS safe-area insets.

Validation lives in `touch-controls.test.mjs`, `tools/rc/check-mobile.cjs` (Chromium mobile emulation with browser touch events), and `tools/rc/check-touch-webkit.cjs` (WebKit mobile emulation with trusted taps and explicitly synthetic pointer-lifecycle events). Neither is a physical iPhone test. The normal deployment workflow reruns the Chromium journey on the local package and production.
