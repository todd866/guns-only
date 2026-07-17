shader_type sky;

// Altitude-driven sky. At sea level: an ordinary blue gradient. At 70,000 ft (beat 4's
// balloon drop, ~21336 m) you are above ~96% of the atmosphere: near-black indigo zenith,
// a thin bright limb hugging the horizon (the honest stand-in for real curvature -- the sea
// is a flat PlaneMesh, this glow is what actually sells "edge of space"), a harsh white sun,
// and faint stars in the upper sky. altitude_m is pushed every frame from game/main.gd, which
// reads the FPV camera's world Y (the camera IS the drone's nose, rigid to airframe attitude).
uniform float altitude_m = 0.0;

uniform vec3 zenith_low : source_color = vec3(0.22, 0.47, 0.85);
uniform vec3 horizon_low : source_color = vec3(0.76, 0.84, 0.92);
uniform vec3 ground_low : source_color = vec3(0.05, 0.13, 0.20);
uniform vec3 ground_horizon_low : source_color = vec3(0.74, 0.81, 0.85);

uniform vec3 zenith_high : source_color = vec3(0.008, 0.008, 0.03);
uniform vec3 horizon_high : source_color = vec3(0.30, 0.52, 0.95);
uniform vec3 ground_high : source_color = vec3(0.45, 0.53, 0.62);

uniform vec3 sun_color_low : source_color = vec3(1.0, 0.97, 0.88);
uniform vec3 sun_color_high : source_color = vec3(1.0, 1.0, 1.0);
uniform float sun_energy_low = 5.0;
uniform float sun_energy_high = 11.0;  // 34 blew the filmic tonemapper out and washed the frame

// Atmosphere scale height ~7-8 km in reality; 7000 here so the transition is essentially
// complete by 21336 m (the drop altitude) without ever fully flatlining to pure black.
float alt_t(float alt_m) {
    return 1.0 - exp(-max(alt_m, 0.0) / 7000.0);
}

float hash13(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.13, 0.29, 0.41));
    p *= 17.23;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void sky() {
    float t = alt_t(altitude_m);

    vec3 zenith = mix(zenith_low, zenith_high, t);
    vec3 horizon_col = mix(horizon_low, horizon_high, t);
    vec3 ground = mix(ground_low, ground_high, t);
    vec3 ground_horizon = mix(ground_horizon_low, horizon_high, t);

    float up = EYEDIR.y;
    // The falloff must SHARPEN with altitude. At sea level a broad gradient is right (^4).
    // At 70k the blue must collapse into a thin band hugging the horizon: at ^4, a point 10
    // degrees up is still 53% horizon-colour, which smeared bright blue over the whole frame
    // and was why the "near-space" sky just looked like a hazy afternoon. ^14 puts that same
    // point at ~90% zenith (near-black), which is what being above 96% of the air looks like.
    float falloff = mix(4.0, 14.0, t);
    float k = pow(clamp(1.0 - abs(up), 0.0, 1.0), falloff);
    vec3 col = up >= 0.0 ? mix(zenith, horizon_col, k) : mix(ground, ground_horizon, k);

    // Horizon limb glow: a thin bright rim hugging the horizon line, strongest at altitude.
    // This is the faked-curvature trick -- the sea underneath stays a flat plane. Cubing t
    // keeps it near-invisible at BFM altitude (~3000 m, t~0.35) and only lets it bloom out
    // near the drop altitude (21336 m, t~0.95) -- a normal-looking sky down low, an
    // unmistakable bright limb up high.
    float limb = exp(-abs(up) * 55.0) * pow(t, 3.0) * 2.6;
    col += horizon_high * limb;

    // Stars: only once well clear of most of the atmosphere, only in the upper sky.
    if (t > 0.5 && up > 0.03) {
        vec3 dir = normalize(EYEDIR);
        vec3 cell = floor(dir * 380.0);
        float h = hash13(cell);
        float star = step(0.9982, h) * smoothstep(0.5, 0.92, t);
        col += vec3(star) * (0.5 + 0.5 * hash13(cell + 4.7));
    }

    if (LIGHT0_ENABLED) {
        float sun_amt = dot(normalize(EYEDIR), LIGHT0_DIRECTION);
        float disc = smoothstep(0.99930, 0.99975, sun_amt);
        float glow = pow(clamp(sun_amt, 0.0, 1.0), 340.0);
        vec3 sun_col = mix(sun_color_low, sun_color_high, t);
        float sun_energy = mix(sun_energy_low, sun_energy_high, t);
        col += sun_col * (disc * sun_energy + glow * sun_energy * 0.2);
    }

    COLOR = col;
}
