// Local road patrols keep free drive populated without simulating cars kilometres outside the
// streamed collision window. Patrols use the ordinary rival driver and rigid-body physics.
import {placeCar, rideHeight} from '../physics/car.mjs';
export function trafficLine(roads, pos) {
  let best = null,
    dist = 35;
  for (const road of roads) {
    if (['footway', 'path', 'steps', 'track'].includes(road.kind)) continue;
    const lengths = [0];
    for (let i = 1; i < road.points.length; i++)
      lengths.push(
        lengths.at(-1) +
          Math.hypot(road.points[i][0] - road.points[i - 1][0], road.points[i][1] - road.points[i - 1][1])
      );
    if (lengths.at(-1) < 40) continue;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1],
        b = road.points[i],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        t = Math.max(
          0,
          Math.min(1, ((pos[0] - a[0]) * dx + (pos[2] - a[1]) * dz) / (dx * dx + dz * dz || 1))
        ),
        d = Math.hypot(a[0] + t * dx - pos[0], a[1] + t * dz - pos[2]);
      if (d < dist) {
        dist = d;
        best = {road, lengths, along: lengths[i - 1] + t * (lengths[i] - lengths[i - 1])};
      }
    }
  }
  if (!best) return null;
  const {road, lengths, along} = best,
    start = Math.max(0, along - 90),
    end = Math.min(lengths.at(-1), along + 90),
    points = [];
  for (let d = start; d <= end; d += 4) {
    let i = 1;
    while (i < lengths.length - 1 && lengths[i] < d) i++;
    const a = road.points[i - 1],
      b = road.points[i],
      len = lengths[i] - lengths[i - 1] || 1,
      t = (d - lengths[i - 1]) / len;
    points.push([
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      (b[1] - a[1]) / len,
      -(b[0] - a[0]) / len
    ]);
  }
  const left = points.map(p => [p[0] + p[2] * 1.1, p[1] + p[3] * 1.1, 1]),
    right = points.map(p => [p[0] - p[2] * 1.1, p[1] - p[3] * 1.1, 1]).reverse();
  return [...left, ...right];
}
export function updateTraffic(race, roads, stream, previous) {
  if (!race.roam || race.furball || !race.rivals.length) return previous;
  const pos = race.player.car.pos;
  if (
    previous &&
    Math.hypot(pos[0] - previous[0], pos[2] - previous[2]) < 55 &&
    race.rivals.every(r => r.trafficPlaced)
  )
    return previous;
  const line = trafficLine(roads, pos);
  if (!line) return previous;
  race.line = line;
  let pending = false;
  const occupied = race.rivals.map(r => [r.session.car.pos[0], r.session.car.pos[2]]);
  race.rivals.forEach((r, i) => {
    const car = r.session.car,
      initial = !r.trafficPlaced;
    if (initial || Math.hypot(car.pos[0] - pos[0], car.pos[2] - pos[2]) > 140) {
      const options = line
        .map((p, j) => ({p, j, d: Math.hypot(p[0] - pos[0], p[1] - pos[2])}))
        .filter(
          q => q.d > (initial ? 18 : 55) && q.d < (initial ? 65 : 110) && stream.ready([q.p[0], 0, q.p[1]])
        );
      const offset = Math.floor((i * options.length) / race.rivals.length);
      const chosen = options
        .map((_, j) => options[(j + offset) % options.length])
        .find(q => occupied.every((p, j) => j === i || Math.hypot(q.p[0] - p[0], q.p[1] - p[1]) > 1.5));
      if (chosen) {
        const p = chosen.p,
          q = line[(chosen.j + 1) % line.length];
        placeCar(car, [p[0], rideHeight(car.params) + 0.02, p[1]], Math.atan2(q[0] - p[0], -(q[1] - p[1])));
        occupied[i] = [p[0], p[1]];
        r.trafficPlaced = true;
      } else pending = true;
    }
    r.node = line.reduce(
      (a, p, j) =>
        Math.hypot(p[0] - car.pos[0], p[1] - car.pos[2]) <
        Math.hypot(line[a][0] - car.pos[0], line[a][1] - car.pos[2])
          ? j
          : a,
      0
    );
    r.alt = null;
  });
  // A temporarily unavailable tile must not suppress initialization retries.
  return pending ? previous : [...pos];
}
