extends SceneTree
# Run: bin/godot --headless -s res://spikes/ulp_check.gd
# Headless-runnable. Output recorded verbatim into docs/spikes.md.
func _initialize() -> void:
    for dist in [5000.0, 20000.0, 40000.0]:
        var f := float(dist)          # float64 -> float32 via Godot single-precision Vector3
        var v := Vector3(f, 0, 0)
        var next := Vector3(nextafterf_up(f), 0, 0)
        print("at %.0f m: float32 step = %.6f m" % [dist, next.x - v.x])
    quit(0)
func nextafterf_up(x: float) -> float:
    var step := x * 1.19209e-7  # ~1 ULP for float32
    return x + step
