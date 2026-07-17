extends Control
# Run: bin/godot --path . spikes/gesture_spike.tscn
# USER TASK: two-finger scroll on the trackpad, then lift fingers. Record in
# docs/spikes.md how many ms the delta tail continues after lift (macOS momentum).
var log_lines: Array[String] = []
var last_event_ms := 0
func _unhandled_input(e: InputEvent) -> void:
    if e is InputEventPanGesture:
        var now := Time.get_ticks_msec()
        var gap := now - last_event_ms
        last_event_ms = now
        log_lines.push_front("pan d=(%.2f, %.2f) gap=%dms" % [e.delta.x, e.delta.y, gap])
        if log_lines.size() > 30: log_lines.pop_back()
        queue_redraw()
    if e is InputEventMagnifyGesture:
        log_lines.push_front("magnify f=%.3f" % e.factor); queue_redraw()
func _draw() -> void:
    for i in log_lines.size():
        draw_string(ThemeDB.fallback_font, Vector2(30, 40 + i*20), log_lines[i], HORIZONTAL_ALIGNMENT_LEFT, -1, 14)
