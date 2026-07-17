shader_type spatial;
// Displaces a flat PlaneMesh by a noise texture to fake terrain relief for the
// altitude/haze read spike (spikes/altitude_look.tscn). Vertical-only displacement —
// no normal recomputation; this is a scale/haze judgment spike, not a lighting spike.

uniform sampler2D noise_tex;
uniform float height_scale = 800.0;

void vertex() {
    float n = texture(noise_tex, UV).r;
    VERTEX.y += n * height_scale;
}

void fragment() {
    ALBEDO = vec3(0.34, 0.30, 0.24);
    ROUGHNESS = 0.9;
}
