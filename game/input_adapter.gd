extends Node
# Maps physical keys to GKey ints (must match sim/KeyGrammar.cs GKey order):
# PullUp=0 PushDown=1 RollLeft=2 RollRight=3 RudderLeft=4 RudderRight=5
# ThrottleUp=6 ThrottleDown=7 Trigger=8 Padlock=9 KnockItOff=10 Restart=11
const MAP := {
	KEY_UP: 0, KEY_DOWN: 1, KEY_LEFT: 2, KEY_RIGHT: 3,
	KEY_A: 4, KEY_D: 5, KEY_W: 6, KEY_S: 7,
	KEY_F: 8, KEY_SPACE: 9, KEY_K: 10, KEY_R: 11,
}
@onready var bridge = get_parent().get_node("SimBridge")
signal padlock_toggled
signal restart_requested
signal beat_selected(index: int)
signal variant_toggled

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
		if g == 11 and pressed: restart_requested.emit()
