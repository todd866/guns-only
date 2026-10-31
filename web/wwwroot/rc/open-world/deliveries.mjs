// Rules for the little golf-cart parcel run. Drawing and input live in deliveries.js/main.js.

export const DELIVERY = Object.freeze({
  // The dock is behind the BX shell, away from the front-door entrance at [-546, 0, 791].
  pickup: [-579, 0, 700],
  startRadius: 6,
  ringRadius: 4,
  offRoute: 600,
  // Drop-offs within this of the dock: a 3 km house took six minutes in the cart (seen headless).
  reach: 800,
  runLength: 5,
  bumpThreshold: 5
});

const point = value => {
  if (Array.isArray(value)) return [Number(value[0]) || 0, Number(value[2] ?? value[1]) || 0];
  return [Number(value?.x) || 0, Number(value?.z) || 0];
};

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function placePoint(place) {
  return point(place?.pos ?? place);
}

/** Turn residential porch data and available named places into delivery stops. */
export function deliveryStops(porches = [], places = []) {
  const houses = porches.map((porch, index) => ({
    id: `porch-${porch.index ?? index}`,
    name: 'House',
    short: 'House',
    pos: [porch.x, porch.y ?? 0, porch.z]
  }));
  const source = Array.isArray(places) ? places : Object.values(places ?? {});
  // Places near the BX dock as well as the far ones, so a run stays within DELIVERY.reach.
  const wanted = new Set(['school', 'hangars', 'chapel', 'rec', 'gate', 'hq', 'wic', 'town-plaza']);
  const named = source
    .filter(
      place =>
        wanted.has(place?.id) &&
        (Array.isArray(place?.pos) || (Number.isFinite(place?.x) && Number.isFinite(place?.z)))
    )
    .map(place => ({
      id: place.id ?? place.name.toLowerCase().replace(/\s+/g, '-'),
      name: place.short ?? place.name ?? place.id,
      short: place.short ?? place.name ?? place.id,
      pos: [...(place.pos ?? [place.x, place.y ?? 0, place.z])]
    }));
  return [...houses, ...named];
}

export function pickDropoff(stops, previousId, random = Math.random) {
  const near = stops.filter(stop => distance(placePoint(stop), point(DELIVERY.pickup)) <= DELIVERY.reach);
  const local = near.length >= 2 ? near : stops;
  const available = local.filter(stop => stop.id !== previousId);
  const pool = available.length ? available : local;
  if (!pool.length) return null;
  const previous = stops.find(stop => stop.id === previousId);
  const separate = previous
    ? pool.filter(stop => distance(placePoint(stop), placePoint(previous)) > DELIVERY.ringRadius * 2)
    : [];
  const choices = separate.length ? separate : pool;
  return choices[Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)))];
}

function routeLength(route) {
  let total = 0;
  for (let i = 1; i < route.length; i++) total += distance(route[i - 1], route[i]);
  return total;
}

function routePoints(route) {
  return (route ?? []).map(point);
}

function distanceToRoute(pos, route) {
  const p = point(pos);
  if (route.length < 2) return route.length ? distance(p, route[0]) : Infinity;
  let best = Infinity;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      dx = b[0] - a[0],
      dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, distance(p, [a[0] + t * dx, a[1] + t * dz]));
  }
  return best;
}

function insideRing(pos, destination) {
  return distance(point(pos), point(destination.pos)) <= DELIVERY.ringRadius;
}

export function createDeliveries(stops, {routeTo, random = Math.random} = {}) {
  return {
    stops,
    routeTo,
    random,
    active: false,
    paused: false,
    delivered: 0,
    stars: 0,
    destination: null,
    route: [],
    elapsed: 0,
    par: 0,
    bumps: 0,
    squashed: false,
    wobble: 0,
    previousId: null,
    lastImpact: false,
    bumpCooldown: 0,
    placement: null,
    armed: false
  };
}

function loadParcel(state, pos) {
  state.destination = pickDropoff(state.stops, state.previousId, state.random);
  state.previousId = state.destination?.id ?? null;
  const rawRoute = state.routeTo?.(pos, state.destination),
    start = point(pos),
    end = point(state.destination.pos),
    path = routePoints(rawRoute);
  // Snapshot this leg: a live re-route from the car would defeat the off-route pause.
  // The route helper can return just the start when roads are disconnected.
  if (!path.length || distance(path[0], start) > 0.01) path.unshift(start);
  if (distance(path.at(-1), end) > 0.01) path.push(end);
  state.route = path;
  state.par = Math.max(1, routeLength(state.route) / 6);
  state.elapsed = 0;
  state.bumps = 0;
  state.squashed = false;
  state.wobble = 0;
  state.lastImpact = false;
  state.bumpCooldown = 0;
  state.armed = !insideRing(pos, state.destination);
}

export function startDeliveries(state, driver) {
  if (state.active || !state.stops.length || driver?.body !== 'golf' || driver?.driving !== true)
    return false;
  if (distance(point(driver.pos), point(DELIVERY.pickup)) > DELIVERY.startRadius) return false;
  state.active = true;
  state.paused = false;
  state.delivered = 0;
  state.stars = 0;
  state.placement = driver.placement;
  loadParcel(state, driver.pos);
  return {started: true, destination: state.destination, route: state.route};
}

function bumpEvent(state, driver) {
  const impact = Number(driver?.impact) || 0;
  const hit = impact > DELIVERY.bumpThreshold;
  const newHit = hit && !state.lastImpact && state.bumpCooldown <= 0;
  state.lastImpact = hit;
  if (newHit) {
    state.bumps += 1;
    state.wobble = 1;
    state.bumpCooldown = 0.75;
    if (state.bumps >= 3) state.squashed = true;
    return {careful: true, squashed: state.squashed};
  }
  return null;
}

export function stepDeliveries(state, driver, dt = 0) {
  if (!state.active) return [];
  const events = [];
  const driving = driver?.body === 'golf' && driver?.driving === true;
  const away = distanceToRoute(driver?.pos, state.route) > DELIVERY.offRoute;
  state.paused = !driving || away;
  const moved = driver?.placement !== state.placement;
  state.placement = driver?.placement;
  if (state.paused) return events;
  // A map jump or recovery is not a driven delivery or a damaging collision.
  if (moved) {
    state.armed = !insideRing(driver.pos, state.destination);
    state.lastImpact = true;
    return events;
  }
  const seconds = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  state.bumpCooldown = Math.max(0, state.bumpCooldown - seconds);
  const bump = bumpEvent(state, driver);
  if (bump) events.push(bump);
  state.wobble = Math.max(0, state.wobble - seconds * 2);
  state.elapsed += seconds;
  if (!insideRing(driver.pos, state.destination)) {
    state.armed = true;
    return events;
  }
  if (!state.armed) return events;
  const star = !state.squashed && state.elapsed < state.par;
  state.delivered += 1;
  if (star) state.stars += 1;
  const event = {delivered: true, star, destination: state.destination, total: state.delivered};
  if (state.delivered >= DELIVERY.runLength) {
    state.active = false;
    state.destination = null;
    state.route = [];
    event.done = true;
  } else {
    loadParcel(state, driver.pos);
    event.nextDestination = state.destination;
    event.route = state.route;
  }
  events.push(event);
  return events;
}
