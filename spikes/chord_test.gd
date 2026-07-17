extends Control
# Run: bin/godot --path . spikes/chord_test.tscn
# USER TASK (5 min, on the target MacBook's internal keyboard): hold each listed
# chord; record in docs/spikes.md which registered all keys.
var pressed := {}
func _unhandled_input(e: InputEvent) -> void:
    if e is InputEventKey and not e.echo:
        if e.pressed: pressed[e.keycode] = true
        else: pressed.erase(e.keycode)
        queue_redraw()
func _draw() -> void:
    var names := []
    for k in pressed: names.append(OS.get_keycode_string(k))
    names.sort()
    draw_string(ThemeDB.fallback_font, Vector2(40, 60), "HELD (%d): %s" % [names.size(), ", ".join(names)], HORIZONTAL_ALIGNMENT_LEFT, -1, 24)
    draw_string(ThemeDB.fallback_font, Vector2(40, 120), "Test chords: ↑+→+F | ↑+→+A | ↑+→+A+F | ↑+←+D+W | ↓+←+F", HORIZONTAL_ALIGNMENT_LEFT, -1, 16)
