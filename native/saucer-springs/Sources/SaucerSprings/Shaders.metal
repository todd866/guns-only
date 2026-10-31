#include <metal_stdlib>
#include <metal_raytracing>
using namespace metal;
using namespace raytracing;

// Saucer Springs native renderer. Primary visibility is rasterised. Each pixel then traces, against
// one hardware acceleration structure: a soft sun-shadow ray (jittered over the sun's disc), short
// contact-AO rays, and one cosine-weighted bounce ray whose hit is shaded with its own texture and
// a sun-shadow ray (one-bounce GI). Frames accumulate while the camera holds still, with sub-pixel
// jitter, so stills converge to clean, anti-aliased path-traced lighting.

struct Uniforms {
  float4x4 viewProj;
  float4x4 invViewProj;   // current, with this frame's jitter (matches the depth it reconstructs)
  float4x4 prevViewProj;  // last frame's, for reprojection
  float4 eye;        // xyz camera position, w = time
  float4 sun;        // xyz direction toward the sun, w = sun strength
  float4 fog;        // x = start, y = end
  uint2 size; uint frame; uint accumulated;
  float2 jitter; float historyCap; float pad;
};
struct Material { int tex; int alpha; };

struct VOut { float4 pos [[position]]; float3 world; float3 normal; float3 colour; float2 uv; uint material [[flat]]; };

vertex VOut worldVertex(uint vid [[vertex_id]], const device packed_float3 *P [[buffer(0)]], const device packed_float3 *N [[buffer(1)]],
                        const device uchar4 *C [[buffer(2)]], const device float2 *UV [[buffer(3)]], const device ushort *M [[buffer(4)]],
                        constant Uniforms &u [[buffer(5)]], constant float4x4 &model [[buffer(6)]]) {
  VOut o; float3 p = (model * float4(float3(P[vid]), 1)).xyz;
  o.pos = u.viewProj * float4(p, 1);
  o.pos.xy += u.jitter * o.pos.w;   // sub-pixel jitter for accumulated anti-aliasing
  o.world = p; o.normal = (model * float4(float3(N[vid]), 0)).xyz; o.colour = float3(C[vid].rgb) / 255.0; o.uv = UV[vid]; o.material = M[vid]; return o;
}

static float h2(float2 q) { return fract(sin(dot(q, float2(127.1, 311.7))) * 43758.5453); }
static float vnoise(float2 p) { float2 i = floor(p), f = fract(p); f = f * f * (3 - 2 * f);
  #define h h2
  return mix(mix(h(i), h(i + float2(1, 0)), f.x), mix(h(i + float2(0, 1)), h(i + float2(1, 1)), f.x), f.y);
  #undef h
}
static float fbm(float2 p) { float a = .5, s = 0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
// Fair-weather cumulus on a plane ~1.2 km up, sunlit on top and grey underneath.
static float3 clouds(float3 d, float3 sun, float3 sky) {
  if (d.y < .02) return sky;
  float2 p = d.xz / d.y * 1.2; float n = fbm(p * .9 + 3.0), cover = smoothstep(.52, .78, n);
  float lit = .75 + .25 * saturate(fbm(p * .9 + 3.0 + sun.xz * .08) - n + .5);
  float3 cloud = mix(float3(.62, .66, .72), float3(1.0, .97, .92), lit);
  return mix(sky, cloud, cover * smoothstep(.02, .2, d.y));
}
static float3 skyColour(float3 d, float3 sun) {
  float h = saturate(d.y);
  float3 zenith = float3(.08, .26, .70), horizon = float3(.50, .66, .84);
  float3 sky = mix(horizon, zenith, pow(h, .55));
  if (d.y < 0) sky = mix(horizon, float3(.42, .38, .33), saturate(-d.y * 4));
  float s = saturate(dot(d, sun));
  sky = clouds(d, sun, sky);
  sky += float3(1.0, .82, .58) * (pow(s, 900.0) * 30.0 + pow(s, 12.0) * .35);
  return sky;
}
static float3 aces(float3 x) { return saturate((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)); }

static float hash(uint2 p, uint f) { uint h = p.x * 1973u + p.y * 9277u + f * 26699u + 7u; h = (h ^ (h >> 13)) * 0x5bd1e995u; h ^= h >> 15; return float(h & 0xffffffu) / 16777216.0; }

// Instance 0 is the world, instance 1 the player's car (moved every frame).
struct Scene {
  instance_acceleration_structure accel;
  const device uint *indices; const device uint *cutout; const device uchar4 *colours; const device float2 *uvs; const device ushort *mats;
  constant Material *materials; texture2d_array<half> tex; sampler smp;
  const device packed_float3 *carP; const device uint *carI; const device uchar4 *carC;
};

// Geometry 0 holds the opaque triangles, geometry 1 the alpha-tested leaf cards.
static const device uint *tri(const thread Scene &s, uint geom, uint prim) { return (geom ? s.cutout : s.indices) + prim * 3; }
static float4 surfaceAlbedo(const thread Scene &s, uint geom, uint prim, float2 bary) {
  const device uint *t = tri(s, geom, prim); uint i0 = t[0], i1 = t[1], i2 = t[2];
  float w0 = 1 - bary.x - bary.y;
  float3 c = (float3(s.colours[i0].rgb) * w0 + float3(s.colours[i1].rgb) * bary.x + float3(s.colours[i2].rgb) * bary.y) / 255.0;
  Material m = s.materials[s.mats[i0]];
  float a = 1;
  if (m.tex >= 0) { float2 uv = s.uvs[i0] * w0 + s.uvs[i1] * bary.x + s.uvs[i2] * bary.y; half4 t = s.tex.sample(s.smp, uv, m.tex, level(3)); c *= float3(t.rgb); a = m.alpha ? float(t.a) : 1; }
  return float4(c, a);
}

// Any-hit visibility that respects alpha-tested foliage (leaf cards cast leaf-shaped shadows).
static bool occluded(const thread Scene &s, float3 o, float3 d, float tmax) {
  intersection_query<instancing, triangle_data> q; intersection_params p; p.accept_any_intersection(true);
  q.reset(ray(o, d, 0.003, tmax), s.accel, p);
  while (q.next())   // only leaf cards come back as candidates
    if (surfaceAlbedo(s, 1, q.get_candidate_primitive_id(), q.get_candidate_triangle_barycentric_coord()).a > .5) q.commit_triangle_intersection();
  return q.get_committed_intersection_type() != intersection_type::none;
}

struct Hit { bool hit; float3 pos; float3 normal; float4 albedo; };
static Hit closest(const thread Scene &s, const device packed_float3 *P, float3 o, float3 d, float tmax) {
  intersection_query<instancing, triangle_data> q; intersection_params p;
  q.reset(ray(o, d, 0.003, tmax), s.accel, p);
  while (q.next())
    if (surfaceAlbedo(s, 1, q.get_candidate_primitive_id(), q.get_candidate_triangle_barycentric_coord()).a > .5) q.commit_triangle_intersection();
  Hit h; h.hit = q.get_committed_intersection_type() != intersection_type::none;
  if (h.hit) {
    uint prim = q.get_committed_primitive_id(), geom = q.get_committed_geometry_id(); float2 bary = q.get_committed_triangle_barycentric_coord();
    h.pos = o + d * q.get_committed_distance();
    if (q.get_committed_instance_id() == 1) {   // the car: its own buffers, normal through its transform
      const device uint *t = s.carI + prim * 3; float3 a = float3(s.carP[t[0]]), b = float3(s.carP[t[1]]), c = float3(s.carP[t[2]]);
      float4x3 m = q.get_committed_object_to_world_transform();
      h.normal = normalize(float3x3(m[0], m[1], m[2]) * cross(b - a, c - a));
      h.albedo = float4(float3(s.carC[t[0]].rgb) / 255.0, 1);
    } else {
      const device uint *t = tri(s, geom, prim); float3 a = float3(P[t[0]]), b = float3(P[t[1]]), c = float3(P[t[2]]);
      h.normal = normalize(cross(b - a, c - a)); h.albedo = surfaceAlbedo(s, geom, prim, bary);
    }
    if (dot(h.normal, d) > 0) h.normal = -h.normal;
  }
  return h;
}

static float3 cosineDir(float3 n, float r1, float r2) {
  float3 t = normalize(abs(n.y) < .9 ? cross(n, float3(0, 1, 0)) : cross(n, float3(1, 0, 0))), b = cross(n, t);
  float phi = 6.2831853 * r1, sr = sqrt(r2);
  return normalize(t * cos(phi) * sr + b * sin(phi) * sr + n * sqrt(max(0.0, 1 - r2)));
}
static float3 sunCone(float3 sun, float r1, float r2) {   // ~0.6° disc: soft shadow edges
  float3 t = normalize(cross(sun, float3(0, 1, 0))), b = cross(sun, t); float r = sqrt(r1) * 0.012, a = 6.2831853 * r2;
  return normalize(sun + t * cos(a) * r + b * sin(a) * r);
}

[[early_fragment_tests]] fragment float4 worldFragment(VOut in [[stage_in]], constant Uniforms &u [[buffer(0)]],
                              instance_acceleration_structure accel [[buffer(1)]],
                              const device packed_float3 *P [[buffer(2)]], const device uint *I [[buffer(3)]], const device uchar4 *C [[buffer(4)]],
                              const device float2 *UV [[buffer(5)]], const device ushort *M [[buffer(6)]], constant Material *materials [[buffer(7)]],
                              const device uint *cutout [[buffer(8)]], const device packed_float3 *carP [[buffer(9)]], const device uint *carI [[buffer(10)]],
                              const device uchar4 *carC [[buffer(11)]], texture2d_array<half> tex [[texture(0)]], sampler smp [[sampler(0)]]) {
  Scene s { accel, I, cutout, C, UV, M, materials, tex, smp, carP, carI, carC };
  // Depth == leaves one shading per visible pixel. Cut-out texels are cut here too: a decal overlay
  // (graffiti) sits on the same plane as its wall, so its empty texels would otherwise paint over it.
  Material m = materials[in.material];
  float3 albedo = in.colour;
  if (m.tex >= 0) { half4 t = tex.sample(smp, in.uv, m.tex); if (m.alpha && t.a < .5) discard_fragment(); albedo *= float3(t.rgb); }
  float3 v = normalize(u.eye.xyz - in.world), n = normalize(in.normal); if (dot(n, v) < 0) n = -n;
  float3 o = in.world + n * 0.008, sunDir = normalize(u.sun.xyz);
  uint2 px = uint2(in.pos.xy); uint f = u.frame;
  float3 sunL = float3(1.0, .86, .68) * u.sun.w;   // late-afternoon warmth

  // Direct sun, soft-shadowed.
  float3 sd = sunCone(sunDir, hash(px, f * 5 + 1), hash(px.yx, f * 5 + 2));
  float ndl = saturate(dot(n, sd));
  float3 direct = ndl > 0 && !occluded(s, o, sd, 600.0) ? sunL * ndl : 0;

  // Sky light: a cosine ray that escapes sees the sky; one that hits gets that surface's sunlit bounce.
  float3 bd = cosineDir(n, hash(px, f * 5 + 3), hash(px.yx + 31, f * 5 + 4));
  Hit h = closest(s, P, o, bd, 80.0);
  float3 indirect;
  if (!h.hit) indirect = skyColour(bd, sunDir) * 0.75;
  else {
    float3 ho = h.pos + h.normal * 0.008; float hl = saturate(dot(h.normal, sunDir));
    float3 hs = hl > 0 && !occluded(s, ho, sunDir, 600.0) ? sunL * hl : 0;
    indirect = h.albedo.rgb * (hs + skyColour(h.normal, sunDir) * 0.35) * 0.9;
  }
  float3 lit = albedo * (direct + indirect);

  // A little sun and sky specular: wet-look nothing, just enough sheen to read shape.
  float3 hv = normalize(sd + v); float spec = pow(saturate(dot(n, hv)), 60.0) * ndl * (direct.x > 0 ? 1 : 0);
  float fres = pow(1 - saturate(dot(n, v)), 5.0) * .08;
  lit += sunL * spec * .06 + skyColour(reflect(-v, n), sunDir) * fres;

  float dist = length(u.eye.xyz - in.world), fog = smoothstep(u.fog.x, u.fog.y, dist);
  lit = mix(lit, skyColour(-v, sunDir), fog);
  return float4(lit, 1);
}

// Depth pre-pass: writes depth only, cutting alpha-tested leaf cards, so the expensive ray-traced
// shading pass runs once per visible pixel instead of once per overlapping layer.
fragment void depthFragment(VOut in [[stage_in]], constant Material *materials [[buffer(7)]], texture2d_array<half> tex [[texture(0)]], sampler smp [[sampler(0)]]) {
  Material m = materials[in.material];
  if (m.alpha && m.tex >= 0 && tex.sample(smp, in.uv, m.tex).a < .5) discard_fragment();
}

struct SkyOut { float4 pos [[position]]; float2 ndc; };
vertex SkyOut skyVertex(uint vid [[vertex_id]]) { float2 p = float2((vid << 1) & 2, vid & 2) * 2 - 1; SkyOut o; o.pos = float4(p, 1, 1); o.ndc = p; return o; }
fragment float4 skyFragment(SkyOut in [[stage_in]], constant Uniforms &u [[buffer(0)]], constant float4x4 &invViewProj [[buffer(1)]]) {
  float4 w = invViewProj * float4(in.ndc, 1, 1); float3 d = normalize(w.xyz / w.w - u.eye.xyz);
  return float4(skyColour(d, normalize(u.sun.xyz)), 1);
}

// Accumulate the HDR frame into a running mean, then tone-map to the display.
// Temporal accumulation with reprojection. Each pixel finds where its surface was last frame and
// blends with that history; a 3x3 neighbourhood clamp rejects history that no longer fits (things
// that moved into view), so a moving camera stays clean without smearing. A still camera keeps
// accumulating toward a converged, anti-aliased image.
kernel void accumulate(texture2d<float, access::read> frame [[texture(0)]], texture2d<float, access::sample> history [[texture(1)]],
                       texture2d<float, access::write> out [[texture(2)]], depth2d<float, access::read> depth [[texture(3)]],
                       constant Uniforms &u [[buffer(0)]], uint2 gid [[thread_position_in_grid]]) {
  uint w = out.get_width(), h = out.get_height(); if (gid.x >= w || gid.y >= h) return;
  float4 c = frame.read(gid);
  if (u.accumulated == 0) { out.write(float4(c.rgb, 1), gid); return; }
  float d = depth.read(gid);
  float2 uv = (float2(gid) + .5) / float2(w, h), ndc = float2(uv.x * 2 - 1, 1 - uv.y * 2);
  float2 prevUV = uv;
  // A still camera reads its own pixel: no resampling, so stills converge without any blur.
  if (d < 1 && u.historyCap < 64) {
    float4 wp = u.invViewProj * float4(ndc, d, 1); wp /= wp.w;
    float4 pc = u.prevViewProj * wp; pc /= pc.w; prevUV = float2(pc.x * .5 + .5, .5 - pc.y * .5);
  }
  if (any(prevUV < 0) || any(prevUV > 1)) { out.write(float4(c.rgb, 1), gid); return; }
  constexpr sampler s(filter::linear, address::clamp_to_edge);
  float4 hist = history.sample(s, prevUV);
  float3 lo = c.rgb, hi = c.rgb, m1 = 0, m2 = 0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    float3 n = frame.read(uint2(clamp(int2(gid) + int2(x, y), int2(0), int2(w - 1, h - 1)))).rgb; m1 += n; m2 += n * n; lo = min(lo, n); hi = max(hi, n);
  }
  // While moving, clamp history to the neighbourhood's spread (variance box, widened for noise).
  if (u.historyCap < 64) { float3 mean = m1 / 9, sd = sqrt(max(0.0, m2 / 9 - mean * mean)); hist.rgb = clamp(hist.rgb, min(lo, mean - sd * 1.5), max(hi, mean + sd * 1.5)); }
  float n = min(hist.a + 1, u.historyCap);
  out.write(float4(mix(hist.rgb, c.rgb, 1.0 / n), n), gid);
}
struct PostOut { float4 pos [[position]]; float2 uv; };
vertex PostOut postVertex(uint vid [[vertex_id]]) { float2 p = float2((vid << 1) & 2, vid & 2); PostOut o; o.pos = float4(p * 2 - 1, 0, 1); o.uv = float2(p.x, 1 - p.y); return o; }
fragment float4 postFragment(PostOut in [[stage_in]], texture2d<float> accum [[texture(0)]], texture2d<float> bloom [[texture(1)]]) {
  constexpr sampler s(filter::linear), m(filter::linear, mip_filter::linear);
  // Bloom from the blurred mip chain: only what is brighter than paper white spills over.
  float3 glow = 0; float wsum = 0;
  for (int k = 2; k <= 6; k++) { float w = 1.0 / float(k); glow += max(0.0, bloom.sample(m, in.uv, level(float(k))).rgb - 1.6) * w; wsum += w; }
  float3 c = (accum.sample(s, in.uv).rgb + glow / wsum * .35) * 0.5;
  c = aces(c);
  // Gentle grade: lift saturation a touch and vignette the corners.
  // ACES on each channel skews saturated oranges toward yellow; restore the hue with the
  // pre-tonemap chroma ratios (luminance from the curve, colour from the scene).
  float3 pre = accum.sample(s, in.uv).rgb * 0.5; float lp = max(1e-4, dot(pre, float3(.2126, .7152, .0722))), lc = dot(c, float3(.2126, .7152, .0722));
  c = mix(c, saturate(pre / lp * lc), 0.6);
  c = c * c * (3 - 2 * c) * .25 + c * .75;   // a touch of S-curve contrast
  float2 q = in.uv - .5; c *= 1 - dot(q, q) * .35;
  return float4(saturate(c), 1);
}
