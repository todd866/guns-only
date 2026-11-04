// Small vec3/quat helpers for the RC rigid body. Vectors are [x,y,z], quaternions [x,y,z,w].
export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
export const len = a => Math.hypot(a[0], a[1], a[2]);
export const norm = a => {
  const l = len(a);
  return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0];
};

export const quatIdentity = () => [0, 0, 0, 1];
export const quatAxisAngle = (axis, angle) => {
  const s = Math.sin(angle / 2),
    n = norm(axis);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(angle / 2)];
};
export const quatMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];
export const quatConj = q => [-q[0], -q[1], -q[2], q[3]];
export const quatNorm = q => {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};
export function rotate(q, v) {
  // v + 2w(u×v) + 2u×(u×v)
  const u = [q[0], q[1], q[2]],
    w = q[3];
  const t = scale(cross(u, v), 2);
  return add(add(v, scale(t, w)), cross(u, t));
}
export const unrotate = (q, v) => rotate(quatConj(q), v);
// Integrate orientation by world angular velocity over dt.
export function quatIntegrate(q, w, dt) {
  const dq = quatMul([w[0], w[1], w[2], 0], q);
  return quatNorm([
    q[0] + (dq[0] * dt) / 2,
    q[1] + (dq[1] * dt) / 2,
    q[2] + (dq[2] * dt) / 2,
    q[3] + (dq[3] * dt) / 2
  ]);
}
// Heading of the car's forward (−Z) axis in the XZ plane, matching the prototype's yaw sign.
export const yawOf = q => {
  const f = rotate(q, [0, 0, -1]);
  return Math.atan2(f[0], -f[2]);
};
