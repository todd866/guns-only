extends Camera3D
# Simple keyboard fly-cam for eyeballing the altitude/haze spike (spikes/altitude_look.tscn).
# WASD = forward/strafe, Q/E = down/up. No mouse-look (keyboard-only, avoids capturing
# the mouse in a spike scene). USER TASK: fly around, judge haze + scale by eye — does it
# read as "20,000 ft over Korea" or as a miniature? Record verdict + screenshot in docs/spikes.md.
var speed := 800.0
func _process(delta: float) -> void:
    var dir := Vector3.ZERO
    if Input.is_key_pressed(KEY_W): dir -= transform.basis.z
    if Input.is_key_pressed(KEY_S): dir += transform.basis.z
    if Input.is_key_pressed(KEY_A): dir -= transform.basis.x
    if Input.is_key_pressed(KEY_D): dir += transform.basis.x
    if Input.is_key_pressed(KEY_E): dir += Vector3.UP
    if Input.is_key_pressed(KEY_Q): dir -= Vector3.UP
    if dir.length() > 0.0:
        global_position += dir.normalized() * speed * delta
