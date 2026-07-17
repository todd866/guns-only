shader_type spatial;
render_mode cull_back;

// Animated two-scale sea: the texture IS the motion/altitude cue over open water.
uniform sampler2D noise_tex : repeat_enable, filter_linear_mipmap;
uniform vec3 deep_color : source_color = vec3(0.035, 0.115, 0.185);
uniform vec3 lite_color : source_color = vec3(0.10, 0.28, 0.36);
uniform vec3 foam_color : source_color = vec3(0.58, 0.65, 0.68);

void fragment() {
    vec2 wpos = (INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xz;
    float n1 = texture(noise_tex, wpos / 900.0 + vec2(TIME * 0.008, 0.0)).r;      // swell
    float n2 = texture(noise_tex, wpos / 120.0 - vec2(0.0, TIME * 0.02)).r;       // chop
    float n3 = texture(noise_tex, wpos / 18.0 + vec2(TIME * 0.05, TIME * 0.03)).r; // detail
    float mixv = clamp(n1 * 0.6 + n2 * 0.4, 0.0, 1.0);
    vec3 col = mix(deep_color, lite_color, mixv);
    float foam = smoothstep(0.80, 0.93, n2 * 0.55 + n3 * 0.45);
    col = mix(col, foam_color, foam * 0.35);
    ALBEDO = col;
    METALLIC = 0.0;
    ROUGHNESS = 0.25;
    SPECULAR = 0.55;
}
