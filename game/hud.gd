extends Control
@onready var bridge = get_node("/root/Main/SimBridge")
const TIER_COLORS := [Color(0.7,0.7,0.7), Color(0.3,0.9,0.4), Color(0.3,0.9,0.4), Color(1.0,0.7,0.2)]
const PROMPTS := ["", "PULL ↓", "EASE ↑", "UNLOAD ↑", "◀ ROLL", "ROLL ▶"]
var draw_count := 0

func _process(_d): queue_redraw()

func _draw() -> void:
	var hud: Dictionary = bridge.GetHud()
	var sz := size
	# --- G tape (left edge): 0..8 G vertical ---
	var x := 40.0; var top := sz.y*0.25; var h := sz.y*0.5
	draw_line(Vector2(x, top), Vector2(x, top+h), Color(1,1,1,0.5), 2.0)
	for gval in range(0, 9):
		var y := top + h - (gval/8.0)*h
		draw_line(Vector2(x-4, y), Vector2(x+4, y), Color(1,1,1,0.4), 1.0)
	var gy = func(g: float) -> float: return top + h - (clampf(g, 0, 8)/8.0)*h
	draw_line(Vector2(x-14, gy.call(hud["g_maxperform"])), Vector2(x+14, gy.call(hud["g_maxperform"])), Color(0.3,0.9,0.4,0.9), 2.0)
	draw_line(Vector2(x-14, gy.call(hud["g_hardmax"])), Vector2(x+14, gy.call(hud["g_hardmax"])), Color(1.0,0.3,0.2,0.9), 2.0)
	draw_rect(Rect2(x-10, gy.call(hud["g_valley"])-3, 20, 6), Color(0.4,0.7,1.0,0.9))      # valley notch
	var tier: int = hud["tier"]
	draw_circle(Vector2(x, gy.call(hud["g_cmd"])), 7.0, TIER_COLORS[mini(tier, 3)])          # commanded
	draw_circle(Vector2(x, gy.call(hud["g_actual"])), 3.5, Color(1,1,1))                     # actual
	# --- readouts ---
	var f := ThemeDB.fallback_font; var fs := 16
	draw_string(f, Vector2(x+24, gy.call(hud["g_cmd"])+5), "%.1fG %+0.1f" % [hud["g_cmd"], hud["sticky"]], HORIZONTAL_ALIGNMENT_LEFT, -1, fs)
	draw_string(f, Vector2(20, 40), "%d kt   %d ft" % [hud["speed_kts"], hud["alt_ft"]], HORIZONTAL_ALIGNMENT_LEFT, -1, fs)
	draw_string(f, Vector2(20, 64), "%s   [variant %s]   %s" % [hud["beat"], "A" if hud["variant"]==0 else "B", hud["context"]], HORIZONTAL_ALIGNMENT_LEFT, -1, fs)
	if hud["buffet"] and fmod(Time.get_ticks_msec() / 250.0, 2.0) < 1.0:
		draw_string(f, Vector2(sz.x/2-40, sz.y*0.2), "BUFFET", HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Color(1.0,0.6,0.1))
	# --- prompt ---
	var p: int = hud["prompt"]
	if p > 0: draw_string(f, Vector2(sz.x/2-50, sz.y*0.82), PROMPTS[p], HORIZONTAL_ALIGNMENT_LEFT, -1, 26, Color(0.5,0.85,1.0))
	# --- gun window pipper + tally ---
	if hud["gun_window"]:
		var c := sz/2
		draw_line(c+Vector2(-12,0), c+Vector2(12,0), Color(1,0.9,0.2), 2.0)
		draw_line(c+Vector2(0,-12), c+Vector2(0,12), Color(1,0.9,0.2), 2.0)
	draw_string(f, Vector2(sz.x-220, 40), "range %dm  off %d°  hits %d/%d" % [hud["range_m"], hud["angle_off_deg"], hud["shots_in_window"], hud["shots_total"]], HORIZONTAL_ALIGNMENT_LEFT, -1, fs)
	draw_count += 1
