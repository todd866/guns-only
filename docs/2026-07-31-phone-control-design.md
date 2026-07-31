# Phone controls — target design

Owner direction, 2026-07-31. Supersedes the two-stick "left flies / right looks" layout.

## The layout

| Control | Input | Notes |
| --- | --- | --- |
| **Throttle** | left stick, vertical | continuous axis, deserves a thumb |
| **Yaw** | left stick, horizontal | nearly useless in an FBW gunfight, but the axis is otherwise idle and it earns its place on crosswind recovery and low-speed pointing |
| **Pitch** | right stick, vertical | pull back for up |
| **Roll** | right stick, horizontal | |
| **Fire** | **hold anywhere on the open screen** | no button, no aiming, either thumb |
| **Direction to enemy** | locator arrow, always on | a cue, not a camera |
| **Target cycle** | one small tap | only when there is more than one contact |
| **Gear / flaps** | context, recovery only | already gated on `profile.gear` / `profile.flaps` |

Everything else comes off: look stick, padlock camera, ADI inset, assist chips,
throttle rocker, wave-off, limit-override.

## Why

**Look sticks are useless — all that is needed is direction to enemy.** This is the
decision the rest follows from. A gunfight is flown by pointing the aircraft, not by
panning a camera, so the requirement is a bearing cue and nothing more: turn until it is
ahead of you.

Two things fall out of it immediately.

**The ADI inset can go.** It exists only to give attitude back after padlock has taken the
view. If the camera never leaves the nose, the main horizon already does that job and the
inset is redundant chrome.

**Fire stops needing a button.** Deleting the look stick frees the entire screen above the
sticks. Fire becomes a hold anywhere in that dead space — reachable by either thumb, or the
heel of one, without leaving its stick and without aiming at anything.

## The fault this replaces

Fire currently lives on the right stick as a centre hold, cancelled past
`TARGET_STICK_FIRE_CANCEL_RADIUS`. That makes **near-centre mean both "fine correction" and
"fire"**: you cannot make a small gentle input without arming the gun, or trim without
cancelling it. The two things sharing that zone are the two that most need to be
independent, which is why fine tracking feels bad.

Putting the actions column in the centre gap is *not* the fix either — that is what once
covered the centre-hold fire target so the stick never armed. Fire belongs in the open
screen, which only became available once look was deleted.

## What has to be built

- `SetAnalogThrottle` and `SetAnalogYaw` on the bridge. **Only roll and pitch are analog
  today** (`SetAnalogRollControl` / `SetAnalogPitchControl`); throttle is a hold-key rocker
  and yaw is rudder keys, so the left stick cannot be wired without them.
- Swap the two sticks' bindings.
- Canvas-wide fire zone; remove the stick centre-hold fire path entirely.
- Keep the locator arrow always on rather than padlock-conditional.

## Open questions for the owner

- **Auto-fire on a qualified gun solution** — the assist already does this, and it competes
  with a manual trigger for authority. Keep, or make the trigger sole authority?
- **Throttle detents** — should the axis have mil/max detents so they can be found without
  looking?
