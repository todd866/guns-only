shader_type spatial;
render_mode cull_back;

// Two-scale animated sea + sun glint + altitude haze. From ~10k ft (beats 1-3) this reads as
// chop and swell with a glitter path toward the sun. From 70k ft (beat 4's balloon drop) the
// fine texture and glint core fade into a smooth, hazy blue-grey sheet -- what open water
// actually looks like from up there, not a noise texture. altitude_m and sun_dir are pushed
// from game/main.gd (altitude every frame; sun_dir once, the light doesn't move).
uniform sampler2D noise_tex : repeat_enable, filter_linear_mipmap;
uniform vec3 deep_color : source_color = vec3(0.035, 0.115, 0.185);
uniform vec3 lite_color : source_color = vec3(0.10, 0.28, 0.36);
uniform vec3 foam_color : source_color = vec3(0.58, 0.65, 0.68);
uniform vec3 haze_color_low : source_color = vec3(0.40, 0.53, 0.60);
uniform vec3 haze_color_high : source_color = vec3(0.64, 0.74, 0.82);
uniform vec3 sun_dir = vec3(0.55, 0.42, 0.72);   // direction TO the sun, world space
uniform float altitude_m = 0.0;

// Beats 1-3 (~3000 m / 10k ft) and the AWACS's own altitude (9144 m / 30k ft) keep full
// detail; only above that does the sheet flatten out on the way to 21336 m (70k ft).
const float FLATTEN_LO = 9000.0;
const float FLATTEN_HI = 21336.0;

void fragment() {
    vec3 wpos3 = (INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xyz;
    vec2 wpos = wpos3.xz;

    float flatten = clamp((altitude_m - FLATTEN_LO) / (FLATTEN_HI - FLATTEN_LO), 0.0, 1.0);
    float bump = mix(1.0, 0.10, flatten);   // fine chop is unresolvable from up high

    float n1 = texture(noise_tex, wpos / 900.0 + vec2(TIME * 0.008, 0.0)).r;      // swell
    float n2 = texture(noise_tex, wpos / 120.0 - vec2(0.0, TIME * 0.02)).r;       // chop
    float n3 = texture(noise_tex, wpos / 18.0 + vec2(TIME * 0.05, TIME * 0.03)).r; // detail
    float band = texture(noise_tex, wpos / 3000.0 + vec2(TIME * 0.002, TIME * 0.0015)).r; // slow macro tint

    float mixv = clamp(n1 * 0.6 + n2 * 0.4, 0.0, 1.0);
    vec3 col = mix(deep_color, lite_color, mixv);
    col = mix(col, col * 1.16 + vec3(0.015, 0.025, 0.015), band * 0.5);

    float foam = smoothstep(0.80, 0.93, n2 * 0.55 + n3 * 0.45) * mix(1.0, 0.2, flatten);
    col = mix(col, foam_color, foam * 0.35);

    // Perturbed normal from the chop/detail bands (bump -> ~0 at altitude, so this degenerates
    // to a near-flat mirror -- which is correct, that's what a hazy sheet looks like).
    float eps = 3.0;
    float hL = texture(noise_tex, (wpos - vec2(eps, 0.0)) / 18.0 + vec2(TIME * 0.05, TIME * 0.03)).r;
    float hR = texture(noise_tex, (wpos + vec2(eps, 0.0)) / 18.0 + vec2(TIME * 0.05, TIME * 0.03)).r;
    float hD = texture(noise_tex, (wpos - vec2(0.0, eps)) / 18.0 + vec2(TIME * 0.05, TIME * 0.03)).r;
    float hU = texture(noise_tex, (wpos + vec2(0.0, eps)) / 18.0 + vec2(TIME * 0.05, TIME * 0.03)).r;
    vec3 world_normal = normalize(vec3((hL - hR) * bump * 2.4, 2.0, (hD - hU) * bump * 2.4));

    // Sun glint: reflect the view ray off the perturbed surface and spike toward the sun. A
    // tight sparkling core fades out at altitude (unresolvable facets); a broad soft sheen
    // persists -- glint really is visible as a bright sheet from very high over open water.
    vec3 cam_world = (INV_VIEW_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 view_dir_world = normalize(cam_world - wpos3);
    vec3 refl = reflect(-view_dir_world, world_normal);
    float sun_amt = clamp(dot(refl, normalize(sun_dir)), 0.0, 1.0);
    float core = pow(sun_amt, mix(140.0, 24.0, flatten)) * mix(3.2, 1.1, flatten);
    float sheen = pow(sun_amt, 5.0) * mix(0.25, 0.7, flatten);
    vec3 glint = vec3(1.0, 0.97, 0.88) * (core + sheen);

    // From 70k the ocean is a DARK blue-grey sheet, not a white one: at 0.85 the haze mix
    // bleached it to a bedsheet and killed the contrast the whole frame needed.
    vec3 haze_color = mix(haze_color_low, haze_color_high, clamp(altitude_m / FLATTEN_HI, 0.0, 1.0));
    col = mix(col, haze_color, flatten * 0.40);

    ALBEDO = col;
    METALLIC = 0.0;
    ROUGHNESS = mix(0.22, 0.5, flatten);
    SPECULAR = 0.55;
    NORMAL = normalize((VIEW_MATRIX * vec4(world_normal, 0.0)).xyz);
    EMISSION = glint;
}
