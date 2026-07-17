extends Control
# Combat HUD -- modern symbology (deliberately not period-authentic) built for one job:
# situational awareness when nose-high, per the pilot brief. Two SA fixes anchor the
# design: (1) the pitch ladder keeps attitude legible even when the 3D world is off-frame
# during a hard pull, and (2) the bandit TD box clamps to the screen edge with a pointer +
# aspect cue when the bandit is off-screen or behind, so bearing is never lost.
#
# Single self-contained _draw() script. Reads bridge.GetHud() plus the 3D camera/bandit
# nodes for world-anchored projection; never touches sim/, bridge/, or other game files.

@onready var bridge = get_node("/root/Main/SimBridge")

var cam: Camera3D
var bandit_node: Node3D
var player_node: Node3D

const COL_GREEN := Color(0x4d / 255.0, 0xff / 255.0, 0x88 / 255.0)
const COL_GREEN_DIM := Color(0x4d / 255.0, 0xff / 255.0, 0x88 / 255.0, 0.55)
const COL_AMBER := Color(0xff / 255.0, 0xb0 / 255.0, 0x20 / 255.0)
const COL_RED := Color(1.0, 0.27, 0.22)
const COL_GREY := Color(0.68, 0.68, 0.72)
const COL_BACKDROP := Color(0, 0, 0, 0.38)

const TIER_COLORS := [COL_GREY, COL_GREEN, COL_GREEN, COL_AMBER]
const PROMPTS := ["", "PULL ↓", "EASE ↑", "UNLOAD ↑", "◀ ROLL", "ROLL ▶"]

var draw_count := 0
var f: Font


func _ready() -> void:
	f = ThemeDB.fallback_font
	_resolve_scene_nodes()


func _resolve_scene_nodes() -> void:
	cam = get_node_or_null("/root/Main/CameraRig") as Camera3D
	bandit_node = get_node_or_null("/root/Main/BanditJet") as Node3D
	player_node = get_node_or_null("/root/Main/PlayerJet") as Node3D
	if cam == null or bandit_node == null:
		# Defensive fallback: normal play, the test harness, and the rig all mount the
		# scene at /root/Main/..., but if that ever breaks, find nodes by unique name
		# rather than silently going blind on the TD box.
		var root := get_tree().root
		if cam == null:
			cam = root.find_child("CameraRig", true, false) as Camera3D
		if bandit_node == null:
			bandit_node = root.find_child("BanditJet", true, false) as Node3D
		if player_node == null:
			player_node = root.find_child("PlayerJet", true, false) as Node3D


func _process(_d) -> void:
	queue_redraw()


# ---------------------------------------------------------------------------
# small draw helpers
# ---------------------------------------------------------------------------

func _dashed_line(p1: Vector2, p2: Vector2, color: Color, width: float, dash: float = 7.0, gap: float = 5.0) -> void:
	var diff := p2 - p1
	var length := diff.length()
	if length < 0.001:
		return
	var dir := diff / length
	var t := 0.0
	while t < length:
		var seg_end := minf(t + dash, length)
		draw_line(p1 + dir * t, p1 + dir * seg_end, color, width)
		t += dash + gap


func _text_w(text: String, fs: int) -> float:
	return f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x


func _draw_centered(pos: Vector2, text: String, fs: int, color: Color) -> void:
	var w := _text_w(text, fs)
	draw_string(f, pos - Vector2(w * 0.5, 0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, color)


func _draw_boxed_readout(center: Vector2, box_w: float, box_h: float, text: String, fs: int, color: Color) -> void:
	var rect := Rect2(center.x - box_w * 0.5, center.y - box_h * 0.5, box_w, box_h)
	draw_rect(rect, COL_BACKDROP, true)
	draw_rect(rect, color, false, 2.0)
	_draw_centered(center + Vector2(0, fs * 0.35), text, fs, color)


# Clamp a ray from screen center `c` in direction `dir` to the boundary of `rect`.
func _clamp_to_rect(c: Vector2, dir: Vector2, rect: Rect2) -> Vector2:
	if dir.length() < 0.0001:
		return c
	var tx := INF
	var ty := INF
	if dir.x > 0.0001:
		tx = (rect.position.x + rect.size.x - c.x) / dir.x
	elif dir.x < -0.0001:
		tx = (rect.position.x - c.x) / dir.x
	if dir.y > 0.0001:
		ty = (rect.position.y + rect.size.y - c.y) / dir.y
	elif dir.y < -0.0001:
		ty = (rect.position.y - c.y) / dir.y
	var t: float = minf(tx, ty)
	return c + dir * t


func _draw_arrow(tip: Vector2, dir: Vector2, size: float, color: Color) -> void:
	var d := dir.normalized()
	var perp := Vector2(-d.y, d.x)
	var back := tip - d * size
	var p1 := back + perp * size * 0.55
	var p2 := back - perp * size * 0.55
	draw_colored_polygon(PackedVector2Array([tip, p1, p2]), color)


# ---------------------------------------------------------------------------
# 1. Speed / altitude tapes
# ---------------------------------------------------------------------------

func _draw_vtape(spine_x: float, center_y: float, half_h: float, current: float,
		step: float, spacing_px: float, major_every: int, tick_toward_center: float,
		label_left: bool, fmt_major: Callable, box_fmt: Callable, box_w: float) -> void:
	var px_per_unit := spacing_px / step
	draw_line(Vector2(spine_x, center_y - half_h), Vector2(spine_x, center_y + half_h), COL_GREEN_DIM, 1.5)
	var n := int(ceil(half_h / spacing_px)) + 1
	var snapped: float = round(current / step) * step
	var idx := -n
	while idx <= n:
		var tick_val := snapped + idx * step
		var y := center_y - (tick_val - current) * px_per_unit
		if y >= center_y - half_h and y <= center_y + half_h:
			var is_major := int(round(tick_val / step)) % major_every == 0
			var tlen: float = 14.0 if is_major else 7.0
			draw_line(Vector2(spine_x, y), Vector2(spine_x + tick_toward_center * tlen, y), COL_GREEN, 1.5 if is_major else 1.0)
			if is_major and absf(y - center_y) > 18.0:
				var lbl: String = fmt_major.call(tick_val)
				var lx: float
				if label_left:
					lx = spine_x - tick_toward_center * (tlen + 6.0) - _text_w(lbl, 14)
				else:
					lx = spine_x + tick_toward_center * (tlen + 6.0)
				draw_string(f, Vector2(lx, y + 5), lbl, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, COL_GREEN)
		idx += 1
	# boxed current-value readout straddling the spine at center_y, with a small
	# pointer chevron biting into the tape so it's unambiguous which value is "now".
	var box_text: String = box_fmt.call(current)
	_draw_boxed_readout(Vector2(spine_x, center_y), box_w, 26.0, box_text, 18, COL_GREEN)
	var tri_dir: float = -tick_toward_center
	var tri_x: float = spine_x + tick_toward_center * (box_w * 0.5)
	draw_colored_polygon(PackedVector2Array([
		Vector2(tri_x, center_y - 7), Vector2(tri_x, center_y + 7), Vector2(tri_x - tri_dir * 8.0, center_y)
	]), COL_GREEN)


func _draw_tapes(hud: Dictionary, sz: Vector2) -> void:
	var center_y := sz.y * 0.52
	var half_h := sz.y * 0.30
	_draw_vtape(sz.x * 0.155, center_y, half_h, hud["speed_kts"],
		10.0, 20.0, 5, 1.0, true,
		func(v): return "%d" % int(round(v)),
		func(v): return "%d" % int(round(v)), 64.0)
	_draw_vtape(sz.x * 0.845, center_y, half_h, hud["alt_ft"],
		100.0, 20.0, 5, -1.0, false,
		func(v): return "%d" % int(round(v)),
		func(v): return "%d" % int(round(v)), 72.0)
	_draw_centered(Vector2(sz.x * 0.155, center_y - half_h - 14), "KT", 13, COL_GREEN_DIM)
	_draw_centered(Vector2(sz.x * 0.845, center_y - half_h - 14), "FT", 13, COL_GREEN_DIM)


# ---------------------------------------------------------------------------
# 2. Heading tape
# ---------------------------------------------------------------------------

func _heading_label(deg_val: float) -> String:
	var h := int(round(fposmod(deg_val, 360.0)))
	if h >= 360:
		h -= 360
	match h:
		0: return "N"
		90: return "E"
		180: return "S"
		270: return "W"
		_: return "%02d" % (h / 10)


func _draw_heading_tape(hud: Dictionary, sz: Vector2) -> void:
	var current: float = hud["heading_deg"]
	var cx := sz.x * 0.5
	var y := sz.y * 0.055
	var half_w := sz.x * 0.22
	var step := 10.0
	var spacing_px := 24.0
	var px_per_deg := spacing_px / step
	draw_line(Vector2(cx - half_w, y), Vector2(cx + half_w, y), COL_GREEN_DIM, 1.5)
	var n := int(ceil(half_w / spacing_px)) + 1
	var snapped: float = round(current / step) * step
	var idx := -n
	while idx <= n:
		var tick_val := snapped + idx * step
		var x := cx + (tick_val - current) * px_per_deg
		if x >= cx - half_w and x <= cx + half_w:
			var is_major := int(round(tick_val / step)) % 3 == 0
			var tlen: float = 14.0 if is_major else 7.0
			draw_line(Vector2(x, y), Vector2(x, y + tlen), COL_GREEN, 1.5 if is_major else 1.0)
			if is_major and absf(x - cx) > 22.0:
				_draw_centered(Vector2(x, y + tlen + 15), _heading_label(tick_val), 14, COL_GREEN)
		idx += 1
	var box_text := "%03d" % (int(round(fposmod(current, 360.0))))
	_draw_boxed_readout(Vector2(cx, y - 15), 54.0, 24.0, box_text, 16, COL_GREEN)
	# boresight caret marking "now" on the ribbon
	draw_colored_polygon(PackedVector2Array([Vector2(cx - 6, y - 2), Vector2(cx + 6, y - 2), Vector2(cx, y + 6)]), COL_GREEN)


# ---------------------------------------------------------------------------
# 3. Pitch ladder + horizon (primary nose-high SA fix)
# ---------------------------------------------------------------------------

func _draw_pitch_ladder(hud: Dictionary, sz: Vector2, c: Vector2) -> void:
	var pitch_deg: float = hud["pitch_deg"]
	var bank_deg: float = hud["bank_deg"]
	var fov: float = cam.fov if cam != null else 63.0
	var ppd: float = sz.y / maxf(fov, 20.0)
	var roll_rad := deg_to_rad(-bank_deg)
	var cs := cos(roll_rad)
	var sn := sin(roll_rad)
	var rot := func(p: Vector2) -> Vector2:
		var rel := p - c
		return c + Vector2(rel.x * cs - rel.y * sn, rel.x * sn + rel.y * cs)

	var rung_half := sz.x * 0.085
	var gap := rung_half * 0.32
	var horizon_half := sz.x * 0.26

	# The ladder lives inside a disc around the boresight -- the combining-glass rule.
	# The guard MUST be applied to the rotated position: testing dy pre-rotation lets a rung
	# that's "480px above centre" swing 480px SIDEWAYS once you're banked, which flung rungs
	# and duplicate labels across the whole frame. Clipping post-rotation is bank-invariant.
	var glass_r := sz.y * 0.42

	var a := -90
	while a <= 90:
		var dy: float = (pitch_deg - a) * ppd
		var rung_mid: Vector2 = rot.call(Vector2(c.x, c.y + dy))
		if rung_mid.distance_to(c) < glass_r:
			var y: float = c.y + dy
			if a == 0:
				var p1 = rot.call(Vector2(c.x - horizon_half, y))
				var p2 = rot.call(Vector2(c.x - horizon_half * 0.14, y))
				var p3 = rot.call(Vector2(c.x + horizon_half * 0.14, y))
				var p4 = rot.call(Vector2(c.x + horizon_half, y))
				draw_line(p1, p2, COL_GREEN, 2.5)
				draw_line(p3, p4, COL_GREEN, 2.5)
				# end ticks drop toward the ground side, the classic horizon-line cue
				var dtick = rot.call(Vector2(c.x - horizon_half, y + 10))
				draw_line(p1, dtick, COL_GREEN, 2.5)
				var dtick2 = rot.call(Vector2(c.x + horizon_half, y + 10))
				draw_line(p4, dtick2, COL_GREEN, 2.5)
			else:
				var pL1 = rot.call(Vector2(c.x - rung_half, y))
				var pL2 = rot.call(Vector2(c.x - gap, y))
				var pR1 = rot.call(Vector2(c.x + gap, y))
				var pR2 = rot.call(Vector2(c.x + rung_half, y))
				if a > 0:
					draw_line(pL1, pL2, COL_GREEN, 1.5)
					draw_line(pR1, pR2, COL_GREEN, 1.5)
				else:
					_dashed_line(pL1, pL2, COL_GREEN, 1.5)
					_dashed_line(pR1, pR2, COL_GREEN, 1.5)
				# One label per rung (inboard-left only). Two labels per rung x 5 rungs was
				# the duplicate-numeral clutter; numerals are also suppressed if they'd land
				# in the heading-tape or prompt/footer text bands.
				if rung_mid.y > sz.y * 0.115 and rung_mid.y < sz.y * 0.84:
					var lbl := str(absi(a))
					var lw := _text_w(lbl, 13)
					draw_string(f, pL1 - Vector2(lw + 5, -4), lbl, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, COL_GREEN)
		a += 10

	# bank-angle pointer arc at the top: a small caret on a fixed arc showing bank,
	# a standard HUD element that gives roll rate/angle at a glance without reading numbers.
	var arc_r := sz.y * 0.30
	var arc_c := Vector2(c.x, c.y)
	var ptr_ang := deg_to_rad(-bank_deg) - PI / 2.0
	var ptr := arc_c + Vector2(cos(ptr_ang), sin(ptr_ang)) * arc_r
	draw_colored_polygon(PackedVector2Array([
		ptr + Vector2(-6, 10), ptr + Vector2(6, 10), ptr + Vector2(0, -2)
	]), COL_GREEN)


# ---------------------------------------------------------------------------
# 4. Flight path marker + boresight cross (no AOA modeled -> FPM sits on boresight)
# ---------------------------------------------------------------------------

func _draw_fpm(c: Vector2) -> void:
	# waterline reference: fixed, airframe-referenced ticks flanking boresight
	draw_line(c + Vector2(-52, 0), c + Vector2(-30, 0), COL_GREEN_DIM, 2.0)
	draw_line(c + Vector2(30, 0), c + Vector2(52, 0), COL_GREEN_DIM, 2.0)
	# boresight cross: fixed dead-ahead reference, drawn under the FPM glyph
	draw_line(c + Vector2(-5, 0), c + Vector2(5, 0), COL_GREEN_DIM, 1.5)
	draw_line(c + Vector2(0, -5), c + Vector2(0, 5), COL_GREEN_DIM, 1.5)
	# flight path marker: circle + wing stubs + tail stub (classic FPM glyph)
	draw_arc(c, 7.0, 0, TAU, 20, COL_GREEN, 2.0, true)
	draw_line(c + Vector2(-16, 0), c + Vector2(-7, 0), COL_GREEN, 2.0)
	draw_line(c + Vector2(7, 0), c + Vector2(16, 0), COL_GREEN, 2.0)
	draw_line(c + Vector2(0, -7), c + Vector2(0, -14), COL_GREEN, 2.0)


# ---------------------------------------------------------------------------
# 5. Bandit target designator box + off-screen locator (the other SA fix)
# ---------------------------------------------------------------------------

func _draw_td_box(hud: Dictionary, sz: Vector2, c: Vector2) -> void:
	if cam == null or bandit_node == null:
		return
	var wpos: Vector3 = bandit_node.global_position
	var range_m: float = hud["range_m"]
	var closure: float = hud["closure_kts"]
	var aoff: float = hud["angle_off_deg"]
	var gun: bool = hud["gun_window"]
	var box_col := COL_GREEN
	if gun:
		box_col = COL_RED
	elif range_m < 700.0:
		box_col = COL_AMBER
	var range_txt := "%dm" % int(round(range_m))
	var clo_txt := "%+dkt" % int(round(closure))
	var aoff_txt := "AO %d°" % int(round(aoff))

	# Asymmetric margins: keep the clamped pointer (and its stacked text) clear of the
	# heading tape (top), footer/prompt (bottom), and the speed/alt tape label columns
	# (sides) rather than the raw screen edge.
	var mx := sz.x * 0.07
	var my_top := sz.y * 0.14
	var my_bot := sz.y * 0.18
	var screen_rect := Rect2(mx, my_top, sz.x - mx * 2.0, sz.y - my_top - my_bot)

	var behind: bool = cam.is_position_behind(wpos)
	if not behind:
		var spos: Vector2 = cam.unproject_position(wpos)
		var onscreen := spos.x >= 0.0 and spos.x <= sz.x and spos.y >= 0.0 and spos.y <= sz.y
		if onscreen:
			var half: float = clampf(5000.0 / maxf(range_m, 1.0), 9.0, 60.0)
			var rect := Rect2(spos.x - half, spos.y - half, half * 2.0, half * 2.0)
			draw_rect(rect, box_col, false, 2.0)
			var text_left := spos.x > sz.x * 0.68
			var tx := spos.x + half + 8.0 if not text_left else spos.x - half - 8.0 - 70.0
			draw_string(f, Vector2(tx, spos.y - 6), range_txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, box_col)
			draw_string(f, Vector2(tx, spos.y + 12), clo_txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, box_col)
			return
		# in front but outside the viewport (FOV-clipped): point straight, no mirroring issue
		var dir := (spos - c)
		var edge := _clamp_to_rect(c, dir, screen_rect)
		_draw_offscreen_pointer(edge, dir.normalized(), range_txt, clo_txt, aoff_txt, box_col)
	else:
		# Behind the camera: unproject_position mirrors through the projection center, so
		# derive the pointer direction from the camera's own local basis instead (x = right,
		# y = up, both sign-correct regardless of whether the target is in front or behind).
		var to_target: Vector3 = wpos - cam.global_position
		var local: Vector3 = cam.global_transform.basis.inverse() * to_target
		var dir := Vector2(local.x, -local.y)
		if dir.length() < 0.0001:
			dir = Vector2(1, 0)
		var edge := _clamp_to_rect(c, dir.normalized(), screen_rect)
		_draw_offscreen_pointer(edge, dir.normalized(), range_txt, clo_txt, aoff_txt, box_col)


func _draw_offscreen_pointer(edge: Vector2, dir: Vector2, range_txt: String, clo_txt: String, aoff_txt: String, col: Color) -> void:
	var col2 := col if col != COL_GREEN else COL_AMBER  # off-screen is always at least a caution: you can't see the threat
	_draw_arrow(edge, dir, 16.0, col2)
	var perp := Vector2(-dir.y, dir.x)
	var txt_anchor := edge - dir * 32.0
	# Which side of the arrow the text sits on: mirror the arrow's own screen-relative
	# direction so labels read away from the edge, not off it. Near-vertical pointers
	# (bandit dead ahead below/above) are forced to one side so the stack doesn't sit
	# in the dead-center column the heading tape and prompt cue already occupy.
	var label_left: bool
	if absf(dir.x) < 0.2:
		label_left = false
	else:
		label_left = dir.x >= 0.0
	var lines := [aoff_txt, range_txt, clo_txt]
	for i in range(lines.size()):
		var lbl: String = lines[i]
		var lw := _text_w(lbl, 13)
		var pos := txt_anchor + perp * 10.0 + Vector2(0, i * 15 - 15)
		if label_left:
			pos.x -= lw
		draw_string(f, pos, lbl, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, col2)


# ---------------------------------------------------------------------------
# 6. Gun reticle
# ---------------------------------------------------------------------------

func _draw_gun_reticle(hud: Dictionary, c: Vector2) -> void:
	if not bool(hud["gun_window"]):
		return
	draw_arc(c, 34.0, 0, TAU, 40, COL_GREEN, 2.0, true)
	draw_arc(c, 16.0, 0, TAU, 28, COL_GREEN, 1.5, true)
	draw_circle(c, 2.0, COL_GREEN)
	for ang in [PI * 0.25, PI * 0.75, PI * 1.25, PI * 1.75]:
		var d := Vector2(cos(ang), sin(ang))
		draw_line(c + d * 34.0, c + d * 44.0, COL_GREEN, 2.0)
	var tally := "%d/%d" % [hud["shots_in_window"], hud["shots_total"]]
	_draw_centered(c + Vector2(0, 58), tally, 15, COL_GREEN)


# ---------------------------------------------------------------------------
# 7. G tape (compact)
# ---------------------------------------------------------------------------

func _draw_g_tape(hud: Dictionary, sz: Vector2) -> void:
	var x := sz.x * 0.035
	var top := sz.y * 0.30
	var h := sz.y * 0.42
	var tier: int = hud["tier"]
	var col: Color = TIER_COLORS[mini(tier, 3)]
	draw_line(Vector2(x, top), Vector2(x, top + h), COL_GREEN_DIM, 1.5)
	for gval in range(0, 9):
		var y := top + h - (gval / 8.0) * h
		draw_line(Vector2(x - 4, y), Vector2(x + 4, y), COL_GREEN_DIM, 1.0)
	var gy := func(g: float) -> float: return top + h - (clampf(g, 0.0, 8.0) / 8.0) * h
	draw_line(Vector2(x - 10, gy.call(hud["g_maxperform"])), Vector2(x + 10, gy.call(hud["g_maxperform"])), COL_GREEN, 2.0)
	draw_line(Vector2(x - 10, gy.call(hud["g_hardmax"])), Vector2(x + 10, gy.call(hud["g_hardmax"])), COL_RED, 2.0)
	draw_rect(Rect2(x - 7, gy.call(hud["g_valley"]) - 3, 14, 6), Color(0.4, 0.7, 1.0, 0.9))
	draw_circle(Vector2(x, gy.call(hud["g_cmd"])), 6.0, col)
	draw_circle(Vector2(x, gy.call(hud["g_actual"])), 3.0, Color(1, 1, 1))
	draw_string(f, Vector2(x + 16, gy.call(hud["g_cmd"]) + 6), "%.1fG" % float(hud["g_cmd"]), HORIZONTAL_ALIGNMENT_LEFT, -1, 20, col)


# ---------------------------------------------------------------------------
# 8. Warnings + prompt cue
# ---------------------------------------------------------------------------

func _draw_warnings(hud: Dictionary, sz: Vector2) -> void:
	var tier: int = hud["tier"]
	# Frame-count-based flash, not wall-clock: Time.get_ticks_msec() does not advance
	# reliably under headless --write-movie capture (verified empirically -- a wall-clock
	# flash never once landed "on" across dozens of captured frames), so drive the flash
	# off draw_count, which is guaranteed to advance exactly once per rendered frame in
	# every context (interactive play, the rig, and this movie capture alike).
	var flash: bool = (draw_count / 8) % 2 == 0
	var y := sz.y * 0.15
	if tier == 3 and flash:
		_draw_centered(Vector2(sz.x * 0.5, y), "OVERRIDE", 24, COL_AMBER)
	if tier == 3 and bool(hud["buffet"]) and flash:
		_draw_centered(Vector2(sz.x * 0.5, y + 30), "BUFFET", 24, COL_RED)

	var p: int = hud["prompt"]
	if p > 0 and p < PROMPTS.size():
		_draw_centered(Vector2(sz.x * 0.5, sz.y * 0.86), PROMPTS[p], 26, COL_GREEN)


func _draw_footer(hud: Dictionary, sz: Vector2) -> void:
	var variant_txt: String = "A" if int(hud["variant"]) == 0 else "B"
	var line := "%s   [variant %s]   %s" % [hud["beat"], variant_txt, hud["context"]]
	draw_string(f, Vector2(16, sz.y - 12), line, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, COL_GREEN_DIM)


# ---------------------------------------------------------------------------
# main draw
# ---------------------------------------------------------------------------

func _draw() -> void:
	if f == null:
		f = ThemeDB.fallback_font
	if cam == null or bandit_node == null:
		_resolve_scene_nodes()

	var hud: Dictionary = bridge.GetHud()
	var sz := size
	var screen_c := sz * 0.5

	# THE HUD DOES NOT FOLLOW THE VIEW.
	# Flight symbology (ladder, FPM, boresight, gun reticle) belongs to the AIRFRAME, not to
	# wherever the sensor gimbal happens to be pointing. Anchoring it at screen centre meant
	# that slewing the sensor 70 deg off boresight redrew the ladder around the VIEW — so it
	# reported the attitude of where you were looking rather than where the jet was pointing.
	# That's the F-35-sim failure mode: meaningless and disorienting. Project the real nose;
	# when the gimbal slews, the flight symbology slides off with the airframe and a locator
	# tells you where the nose went.
	# Screen-fixed by design (data, not geometry — and losing your airspeed because you glanced
	# over your shoulder would be its own bad UX): speed/alt/heading tapes, G tape, warnings.
	# World-anchored already: the TD box (it follows the bandit, which is correct).
	var c := screen_c
	var nose_ahead := true
	if cam != null and player_node != null:
		var fwd: Vector3 = -player_node.global_transform.basis.z
		var ahead: Vector3 = player_node.global_position + fwd * 3000.0
		if cam.is_position_behind(ahead):
			nose_ahead = false
		else:
			c = cam.unproject_position(ahead)

	if nose_ahead:
		_draw_pitch_ladder(hud, sz, c)
		_draw_fpm(c)
		_draw_gun_reticle(hud, c)
	_draw_boresight_cue(screen_c, sz, c, nose_ahead)
	_draw_td_box(hud, sz, screen_c)
	_draw_tapes(hud, sz)
	_draw_heading_tape(hud, sz)
	_draw_g_tape(hud, sz)
	_draw_warnings(hud, sz)
	_draw_footer(hud, sz)

	draw_count += 1


# Where is the nose? The descendant of Falcon 4's SA bar: once the gimbal is slewed far enough
# that the flight symbology has left the frame, you still need to know where the airframe is
# pointing relative to your line of sight. Silent while looking straight ahead.
func _draw_boresight_cue(screen_c: Vector2, sz: Vector2, nose_c: Vector2, nose_ahead: bool) -> void:
	var slew_deg := 0.0
	if cam != null and cam.get("head_yaw") != null:
		slew_deg = rad_to_deg(sqrt(pow(cam.head_yaw, 2.0) + pow(cam.head_pitch, 2.0)))
	if slew_deg < 4.0:
		return   # looking down the nose: no cue needed, the symbology IS the cue

	var rect := Rect2(28, 28, sz.x - 56, sz.y - 56)
	var on_screen := nose_ahead and rect.has_point(nose_c)
	if not on_screen:
		# Point at the nose. Behind the sensor -> invert the direction so the arrow means
		# "the airframe is that way", not "a point 3km ahead projects there".
		var dir := (nose_c - screen_c)
		if not nose_ahead:
			dir = -dir
		if dir.length() < 1.0:
			dir = Vector2(0, 1)
		dir = dir.normalized()
		var tip := _clamp_to_rect(screen_c, dir, rect)
		_draw_arrow(tip, dir, 16.0, COL_GREEN_DIM)
		_draw_centered(tip - dir * 30.0, "NOSE", 13, COL_GREEN_DIM)
	_draw_centered(Vector2(screen_c.x, sz.y * 0.94), "LOOK %d° OFF BORESIGHT" % int(round(slew_deg)), 14, COL_GREEN_DIM)
