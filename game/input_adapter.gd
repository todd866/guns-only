extends Node
# Maps physical keys to GKey ints (must match sim/KeyGrammar.cs GKey order):
# PullUp=0 PushDown=1 RollLeft=2 RollRight=3 RudderLeft=4 RudderRight=5
# ThrottleUp=6 ThrottleDown=7 Trigger=8 Padlock=9 KnockItOff=10 Restart=11
# Pitch is stick-convention: DOWN arrow = stick back = PULL (positive G, nose up);
# UP arrow = stick forward = PUSH/unload. GKey.PullUp means "pull the nose up", not "up key".
const MAP := {
	KEY_DOWN: 0, KEY_UP: 1, KEY_LEFT: 2, KEY_RIGHT: 3,
	KEY_A: 4, KEY_D: 5, KEY_W: 6, KEY_S: 7,
	KEY_F: 8, KEY_V: 9, KEY_K: 10, KEY_R: 11, KEY_SPACE: 12,
}
# SPACE = overpull override (hold to pull past the protection limiter into the buffet,
# at your own risk). Padlock/freelook moved to V.
@onready var bridge = get_parent().get_node("SimBridge")
signal padlock_toggled
signal restart_requested
signal beat_selected(index: int)
signal variant_toggled
signal kio_requested

func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey): return
	var key_event: InputEventKey = event
	if key_event.echo: return
	var code: int = key_event.keycode
	var pressed: bool = key_event.pressed
	if code == KEY_F1 and pressed: variant_toggled.emit(); return
	if code in [KEY_1, KEY_2, KEY_3] and pressed:
		beat_selected.emit(code - KEY_1 + 1); return
	if MAP.has(code):
		var g: int = MAP[code]
		bridge.FeedKey(g, pressed)  # bridge stamps sim time: one monotonic clock for all grammar events
		if g == 8: bridge.Trigger(pressed)
		if g == 9 and pressed: padlock_toggled.emit()
		if g == 10 and pressed: kio_requested.emit()
		if g == 11 and pressed: restart_requested.emit()
