# A phone held sideways hid the button that starts the mission

Captured 7 September 2026 against this candidate, since stamped Build 356, published locally and driven headless at
three viewports: 1440x900 desktop, 390x844 portrait and 844x390 short landscape. Every production
route was opened to its first screen, started, flown briefly, paused and resumed, and the frames
were inspected. This record covers what the frames showed and what was changed; it is not a
substitute for a human flight.

## Two real defects, both only visible sideways

**Cobra Canyon's Start was off screen at rest.** The flight brief is a scrolling card. At 844x390 it
measures 553 px of content inside a 368 px card, and Start sat at 477–523 px: 87 px below the fold,
with no scrollbar and nothing in the copy saying to scroll. Weekend Ride's Start measured 276 px and
Okanagan's 324 px, both comfortably inside the same viewport, because Okanagan's dispatch already
sticks its action row to the bottom of its scrolling card. The flight brief now does the same,
scoped to the brief so the pause and debrief cards, which are laid out to fit, are untouched.

**The aircraft picker clipped two of its four secondary actions.** The row was a non-wrapping flex
row: 266 px of buttons inside a 222 px box, centred, so Practice was cut off the left edge and
Settings off the right while Logbook and Replay valley intro looked perfectly normal in the middle.
Centred overflow is the quiet kind: nothing scrolls, no scrollbar appears, and the two survivors
make the row look intentional. The row now wraps to two lines.

**Weekend Ride's Start was below the fold on a smaller phone.** It measured 276 px at 844x390 and
passed, then 377 px at 667x375 — entirely below a 375 px screen. It now sticks its action row the
same way. This one was found by the regression test rather than by eye: the frames were captured at
844x390, where the route looks correct.

**The picker centred content it could not scroll.** Making the action row wrap grew it by one line
and pushed Fly to 9 px *above* the viewport at 667x375, which the existing phone-HUD smoke test
caught. The cause was older than the change: at short landscape the picker's layout grid centres its
actions column, and at 667x375 that column is 415 px inside a 359 px row. Centring an overflowing
column pushes its top past the container's start edge, and scrolling only reaches overflow at the
end edge, so the top was unreachable by any gesture — the extra line merely moved Fly across the
line. Both the card and its layout grid now centre with `safe`, which centres while the content
fits and falls back to the start edge once it does not; the plain values stay first so a browser
without `safe` keeps today's behaviour, and the card scrolls to make the rest reachable.

## What holds them

Two browser tests in `web/smoke/player-quality.test.mjs`, run by the gate against the published
artifact rather than against the CSS text. The first asserts that every production brief keeps its
primary action inside the viewport at rest, across the picker, Cobra, Weekend Ride and Fire Boss —
the contract, not one route's styling. The second asserts the picker keeps every secondary action
inside both its own row and the screen, at 844x390 and 390x844, checking each button's box rather
than only the row's scroll width, because centred overflow does not change scroll width on one side.
Both assertions were checked against the measured pre-fix numbers, which fail them.

The first test runs at 667x375 as well as 844x390, and adding that second size is what found the
Weekend Ride case. The existing phone-HUD smoke test already pinned the picker's own Fly button at
both sizes; that contract is what caught the regression, and it is why the deeper centring defect
was found rather than papered over.

## Checked and cleared

An earlier capture of the desktop pause screen showed the frozen frame washed through it, which the
pause CSS explicitly records as a rejected design. Measuring it directly returned an opaque
background and a fully lit Resume action: the capture had been taken mid-transition, 900 ms after
the keypress. No change was made. The pause screen's deliberate minimalism — no title, no state
line, unlike the other four routes — was left alone: the CSS records it as an owner decision, and
re-litigating it is not a defect fix.

A 404 on `/telemetry` appears on every fixed-wing route in local capture. That endpoint is a
serverless function in production and does not exist in the static harness, so it is an artifact of
the local server, not a shipped defect.

The autonomous mission suite was also run, but concurrently with the capture pass, and the results
are not usable: this repository serialises browser gates precisely because parallel software-rendered
Chromiums starve each other into false timeouts. A single re-run of the player-quality suite on an
idle machine passed in 37 s after timing out at 300 s under that load. The mission suite needs a
clean serial run before any of its verdicts are quoted.
