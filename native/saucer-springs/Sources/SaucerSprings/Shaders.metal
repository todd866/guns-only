#include <metal_stdlib>
#include <metal_raytracing>
using namespace metal;
using namespace raytracing;

// Saucer Springs native renderer. The world is rasterised for primary visibility; every pixel
// then traces a hardware ray toward the sun for a crisp shadow and a few short hemisphere rays for
// ambient occlusion against the same acceleration structure.

struct Uniforms {
  float4x4 viewProj;
  float4 eye;        // xyz camera position, w = time
  float4 sun;        // xyz direction toward the sun, w = sun strength
  float4 fog;        // x = start, y = end
  uint2 size; uint frame; uint aoRays;
};

struct VOut { float4 pos [[position]]; float3 world; float3 normal; float3 colour; };

vertex VOut worldVertex(uint vid [[vertex_id]], const device packed_float3 *P [[buffer(0)]], const device packed_float3 *N [[buffer(1)]],
                        const device uchar4 *C [[buffer(2)]], constant Uniforms &u [[buffer(3)]]) {
  VOut o; float3 p = float3(P[vid]);
  o.pos = u.viewProj * float4(p, 1); o.world = p; o.normal = float3(N[vid]); o.colour = float3(C[vid].rgb) / 255.0; return o;
}

static float3 skyColour(float3 d, float3 sun) {
  float h = saturate(d.y * .5 + .5);
  float3 sky = mix(float3(.72, .82, .88), float3(.24, .50, .86), pow(h, 1.6));
  sky += float3(1.0, .85, .6) * pow(saturate(dot(d, sun)), 600.0) * 8.0 + float3(1.0, .8, .55) * pow(saturate(dot(d, sun)), 8.0) * .25;
  return sky;
}

// ACES filmic (Narkowicz fit); the drawable's sRGB encoding follows.
static float3 aces(float3 x) { return saturate((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)); }

static float hash(uint2 p, uint f) { uint h = p.x * 1973u + p.y * 9277u + f * 26699u; h = (h ^ (h >> 13)) * 0x5bd1e995u; return float(h & 0xffffffu) / 16777216.0; }

static bool occluded(primitive_acceleration_structure accel, float3 o, float3 d, float tmax) {
  ray r(o, d, 0.002, tmax);
  intersector<triangle_data> it; it.accept_any_intersection(true);
  return it.intersect(r, accel).type != intersection_type::none;
}

fragment float4 worldFragment(VOut in [[stage_in]], bool front [[front_facing]], constant Uniforms &u [[buffer(0)]],
                              primitive_acceleration_structure accel [[buffer(1)]]) {
  float3 n = normalize(in.normal); if (!front) n = -n;
  float3 v = normalize(u.eye.xyz - in.world);
  if (dot(n, v) < 0) n = -n;
  float3 o = in.world + n * 0.01, sun = normalize(u.sun.xyz);
  float ndl = saturate(dot(n, sun));
  float shadow = ndl > 0 && occluded(accel, o, sun, 400.0) ? 0.0 : 1.0;
  // Ambient occlusion: short cosine-weighted rays (0.6 m reaches under cars, kerbs and ramps).
  uint2 px = uint2(in.pos.xy); float open = 0; uint rays = max(1u, u.aoRays);
  float3 t = normalize(abs(n.y) < .9 ? cross(n, float3(0, 1, 0)) : cross(n, float3(1, 0, 0))), b = cross(n, t);
  for (uint i = 0; i < rays; i++) {
    float r1 = hash(px, u.frame * 8 + i), r2 = hash(px.yx + 17, u.frame * 8 + i), phi = 6.2831853 * r1, sr = sqrt(r2);
    float3 d = normalize(t * cos(phi) * sr + b * sin(phi) * sr + n * sqrt(1 - r2));
    open += occluded(accel, o, d, 0.6) ? 0.0 : 1.0;
  }
  float ao = open / float(rays);
  float3 albedo = in.colour;
  float3 skyAmb = mix(float3(.42, .44, .40), float3(.55, .66, .82), saturate(n.y * .5 + .5));
  float3 lit = albedo * (float3(1.0, .92, .80) * u.sun.w * ndl * shadow + skyAmb * 0.55 * (0.15 + 0.85 * ao));
  float dist = length(u.eye.xyz - in.world), fog = smoothstep(u.fog.x, u.fog.y, dist);
  lit = mix(lit, skyColour(-v, sun) * .95, fog);
  return float4(aces(lit * 0.9), 1);
}

struct SkyOut { float4 pos [[position]]; float2 ndc; };
vertex SkyOut skyVertex(uint vid [[vertex_id]]) { float2 p = float2((vid << 1) & 2, vid & 2) * 2 - 1; SkyOut o; o.pos = float4(p, 1, 1); o.ndc = p; return o; }
fragment float4 skyFragment(SkyOut in [[stage_in]], constant Uniforms &u [[buffer(0)]], constant float4x4 &invViewProj [[buffer(1)]]) {
  float4 w = invViewProj * float4(in.ndc, 1, 1); float3 d = normalize(w.xyz / w.w - u.eye.xyz);
  float3 c = skyColour(d, normalize(u.sun.xyz)); return float4(aces(c * 0.9), 1);
}
