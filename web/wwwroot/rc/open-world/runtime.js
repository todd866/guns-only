import {buildCorridorArt} from './corridor-art.js';
import {prepareResidentialCivic} from './residential-civic.js';
import {buildResidentialSchool} from './residential-school.js';
import {prepareResidential} from './residential-art.js';
import {prepareResidentialPark} from './residential-park.js';
import {prepareResidentialYards, residentialPorches} from './residential-yards.js';
import {currentSeason} from './season.mjs';
import {createHalloween} from './halloween.js';
import {createFlyovers} from './flyovers.js';
import {residentialRace} from './residential-course.mjs';
import {prepareResidentialDetails} from './residential-details.js';
import {residentialRoads, residentialNavigationRoads, RESIDENTIAL_LINK} from './residential-roads.mjs';
import {
  RESIDENTIAL_START,
  RESIDENTIAL_PARK,
  RESIDENTIAL_BOUNDS,
  inResidential,
  parkPoint
} from './residential-frame.mjs';
import {ARRIVAL_START} from './arrival-frame.mjs';
import {createPortalTransition} from './portal-transition.mjs';
import {buildActivities} from './activities.js';
import {elevationAt} from './elevation.mjs';
import {prepareHeroes, heroTemplate} from './hero-assets.js';
import {districtExitRoute} from './district-navigation.mjs';
import {DISTRICT_ZONES, districtBounds} from './district-zones.mjs';
import {createTerrain} from './terrain.js';
import {BOUNDS} from './catalog.mjs';
import {prepareDistricts} from './districts.js';
import {createBowling, stepBowling, nextDelivery, bowlingTee} from './bowling.mjs';
import {buildBowlingAlley} from './bowling-alley.js';
import {createBowlingVisual} from './bowling.js';
import {createGolf, stepGolf, resetGolf, golfTee} from './golf.mjs';
import {createGolfVisual} from './golf.js';
import {updateTraffic} from './traffic.mjs';
import {createStream} from './stream.mjs';
import {createResidentialTerrain, boundsOfPoints} from './residential-terrain.mjs';
import {MARSEILLE_TERRAIN} from './marseille-site.mjs';
import {addMarseilleCollision} from './marseille.mjs';
import {YARD_PAD, POOL_HOLE} from './schoolyard.mjs';
import {prepareSchoolyard} from './schoolyard.js';
import {createTileRenderer} from './render.js';
import {createMountainView, createFarGround} from './spirit-mountain.js';
import {createDarkWorld} from './dark-world.js';
import {createBadToys} from './bad-toys.js';
import {createGang, stepGang} from './outlaws.mjs';
import {createDig, stepDig, digFloor} from './dig.mjs';
import {createDigView} from './dig.js';
import {preparePlacementKit, loadPlacements, instantiatePlacements} from './placements.js';
import {createTimeGates, crossTimeGate, darkPlaceById, pastHolds} from './dark-world.mjs';
import {buildLandmarks} from './landmarks.js';
import {createPettingZoo} from './petting-zoo.js';
import {createJetDecks} from './jet-decks.js';
import {createTrickOrTreatVisual} from './trick-or-treat.js';
import {createBooster} from './booster.js';
import {buildHighSchool} from './high-school.js';
import {createHotWheels} from './hot-wheels.js';
import {createCountryClub} from './country-club.js';
import {createMeadow} from './meadow.js';
import {
  LOCATIONS,
  EVENTS,
  locationById,
  eventById,
  eventCourse,
  loadProgress,
  saveProgress,
  discover,
  distance,
  nearestLocation,
  rcLink,
  recordFinish,
  SPECIMENS,
  canEnter,
  canVisit,
  canEnterEvent,
  alienWorldUnlocked,
  collectSpecimens,
  expedition
} from './catalog.mjs';
import {WORLD_LINKS, buildRoadGraph, roadRoute, recoveryPoint} from './navigation.mjs';
export async function loadOpenWorld(search) {
  const q = new URLSearchParams(search),
    get = async name => {
      const r = await fetch(`./assets/world/${name}`);
      if (!r.ok) throw Error(`World data unavailable (${r.status})`);
      return r.json();
    };
  const [manifest, overview, terrainData, elevation, residentialData, residentialTerrainData] =
    await Promise.all([
      get('manifest.json'),
      get('overview.json'),
      get('terrain.json'),
      get('playable-terrain.json'),
      get('residential.json'),
      get('residential-terrain.json')
    ]);
  // The park collider is authored around the course anchor, rather than the
  // legacy civic polygon. Keep a ±20 m driving pad plus an 8 m apron.
  const parkPad = boundsOfPoints(
    [parkPoint([-28, 0, -28]), parkPoint([-28, 0, 28]), parkPoint([28, 0, 28]), parkPoint([28, 0, -28])].map(
      p => [p[0], p[2]]
    )
  );
  const rawTerrain = createResidentialTerrain(residentialTerrainData, {
    bounds: RESIDENTIAL_BOUNDS,
    edgeFeather: 128
  });
  const buildingPads = residentialData.buildings
    .filter(b => b.kind === 'school' || b.kind === 'civic')
    .map(b => {
      const bounds = boundsOfPoints(b.points);
      if (!bounds) return null;
      const center = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
      return {bounds, datum: rawTerrain.rawHeightAt(...center), feather: 25};
    })
    .filter(Boolean);
  const defaultPads = [
    ...(parkPad ? [{bounds: parkPad, datum: 0, feather: 50}] : []),
    ...buildingPads,
    YARD_PAD
  ];
  const residentialTerrain = createResidentialTerrain(residentialTerrainData, {
    bounds: RESIDENTIAL_BOUNDS,
    edgeFeather: 128,
    pads: residentialTerrainData.pads ?? defaultPads,
    holes: [POOL_HOLE]
  });
  overview.bounds = [...BOUNDS];
  overview.residential = residentialData;
  overview.roads = residentialRoads(overview.roads, residentialData);
  overview.roads.push(...WORLD_LINKS);
  let storage;
  try {
    storage = localStorage;
  } catch {}
  const progress = loadProgress(storage),
    explicitEntry = q.has('event') || q.has('from') || q.has('at'),
    requested = eventById(q.get('event')),
    requestedPlace = requested && locationById(requested.location),
    requestedBlocked = !!requested && !canEnterEvent(progress, requested),
    locked = requestedBlocked && requested?.location === 'lab',
    defaultEvent = eventById('district-skatepark') ?? EVENTS[0],
    selected = requestedBlocked
      ? EVENTS[0]
      : (requested ??
        (q.get('at') === 'skatepark' || q.get('from') === 'skatepark'
          ? defaultEvent
          : explicitEntry
            ? EVENTS[0]
            : defaultEvent)),
    rawAt = locationById(q.get('from') ?? q.get('at')),
    safeAt = rawAt && canVisit(progress, rawAt) ? rawAt : null,
    at =
      safeAt ??
      locationById(
        locked
          ? 'lab'
          : requestedBlocked
            ? 'gate'
            : q.has('event')
              ? selected.location
              : explicitEntry
                ? 'gate'
                : selected.location
      );
  const navigationRoads = residentialNavigationRoads(overview.roads);
  const season = currentSeason(search);
  let halloween = null,
    flyovers = null,
    flyoverAt = null;
  let render = null,
    terrain = null,
    activities = null,
    residentialSchool = null,
    venue = null;
  const stream = createStream({
    manifest,
    elevation,
    residentialTerrain,
    terrainSite: MARSEILLE_TERRAIN,
    fetchTile: key => get(`tile-${key.replace(',', '-')}.json`),
    onLoad: (key, t) => {
      render?.load(key, t);
      mountainView?.tileLoaded(key, true);
    },
    onDrop: key => {
      render?.drop(key);
      mountainView?.tileLoaded(key, false);
    }
  });
  let mountainView = null,
    farGround = null;
  const schoolyard = prepareSchoolyard(stream.world, residentialTerrain),
    residentialPark = prepareResidentialPark(stream.world, residentialData, {terrain: residentialTerrain}),
    residentialYards = prepareResidentialYards(stream.world, residentialData, {terrain: residentialTerrain});
  const residentialCivic = prepareResidentialCivic(stream.world, residentialData, {
    terrain: residentialTerrain
  });
  const residentialDetails = prepareResidentialDetails(stream.world, residentialData, {
    terrain: residentialTerrain
  });
  const residential = prepareResidential(
    stream.world,
    {...residentialData, roads: [...residentialData.roads, RESIDENTIAL_LINK]},
    {terrain: residentialTerrain}
  );
  addMarseilleCollision(stream.world);
  // These independent startup jobs overlap network and parsing work. The stream remains the
  // readiness gate, while the district promise supplies collision before a course is exposed.
  // Node-side physics/content tests have no DOM; leave the optional hero cache for attach there.
  // In the browser this starts the independent downloads before the renderer waits on the world.
  const heroesReady = typeof document === 'undefined' ? Promise.resolve(false) : prepareHeroes(),
    districtsReady = prepareDistricts(
      stream.world,
      typeof document === 'undefined'
        ? {}
        : {
            eager: [
              'skatepark',
              selected.district,
              ...Object.keys(DISTRICT_ZONES).filter(id => {
                const b = districtBounds(id);
                return (
                  at.pos[0] >= b[0] - 40 &&
                  at.pos[0] <= b[2] + 40 &&
                  at.pos[2] >= b[1] - 40 &&
                  at.pos[2] <= b[3] + 40
                );
              })
            ].filter(Boolean)
          }
    ),
    streamReady = stream.update(at.pos);
  // Observe both startup jobs together so an early district failure cannot leave a later stream
  // rejection unhandled. This keeps the existing fail-closed error path while overlapping work.
  const [districts] = await Promise.all([districtsReady, streamReady]);
  if (!stream.ready(at.pos)) throw Error('The base did not finish downloading. Please reload.');
  const course =
    selected.id === 'district-skatepark'
      ? residentialRace(selected, stream.world, eventCourse, residentialTerrain)
      : selected.district
        ? {...districts.courses.get(selected.district), event: selected}
        : eventCourse(selected, stream.world);
  course.recoveryPoint = pos => {
    if (selected.id === 'district-skatepark' && q.get('mode') === 'race') {
      const nodes = course.ai,
        i = nodes.reduce(
          (best, n, k) =>
            Math.hypot(n.pos[0] - pos[0], n.pos[2] - pos[2]) <
            Math.hypot(nodes[best].pos[0] - pos[0], nodes[best].pos[2] - pos[2])
              ? k
              : best,
          0
        ),
        p = nodes[i].pos,
        next = nodes[(i + 1) % nodes.length].pos;
      return {pos: [...p], groundY: p[1], yaw: Math.atan2(next[0] - p[0], -(next[2] - p[2]))};
    }
    if (Math.hypot(pos[0] - RESIDENTIAL_PARK.anchor[0], pos[2] - RESIDENTIAL_PARK.anchor[2]) < 45)
      return {...RESIDENTIAL_START, groundY: 0.14};
    if (inResidential(pos)) {
      const safe = recoveryPoint(navigationRoads, pos),
        terrainY = residentialTerrain.heightAt(safe.pos[0], safe.pos[2]),
        hit = stream.world.raycast([safe.pos[0], terrainY + 2, safe.pos[2]], [0, -1, 0], 4);
      return {...safe, groundY: hit?.point[1] ?? terrainY};
    }
    if (
      pos[0] > 9000 ||
      (selected.battle && Math.hypot(pos[0] - selected.points[0][0], pos[2] - selected.points[0][1]) < 150)
    ) {
      const nodes = (selected.battle ? [selected] : EVENTS.filter(e => e.alien)).flatMap(
        e => eventCourse(e, stream.world).ai
      );
      const i = nodes.reduce(
          (best, n, k) =>
            Math.hypot(n.pos[0] - pos[0], n.pos[2] - pos[2]) <
            Math.hypot(nodes[best].pos[0] - pos[0], nodes[best].pos[2] - pos[2])
              ? k
              : best,
          0
        ),
        p = nodes[i].pos,
        q = nodes[(i + 1) % nodes.length].pos;
      return {pos: p, groundY: p[1] + 0.04, yaw: Math.atan2(q[0] - p[0], -(q[2] - p[2]))};
    }
    for (const id of Object.keys(DISTRICT_ZONES)) {
      const b = districtBounds(id);
      if (!districts.courses.has(id) || pos[0] < b[0] || pos[0] > b[2] || pos[2] < b[1] || pos[2] > b[3])
        continue;
      const nodes = districts.courses.get(id).ai,
        i = nodes.reduce(
          (best, n, k) =>
            Math.hypot(n.pos[0] - pos[0], n.pos[2] - pos[2]) <
            Math.hypot(nodes[best].pos[0] - pos[0], nodes[best].pos[2] - pos[2])
              ? k
              : best,
          0
        ),
        p = nodes[i].pos,
        q = nodes[(i + 1) % nodes.length].pos,
        hit = stream.world.raycast([p[0], p[1] + 0.7, p[2]], [0, -1, 0], 2);
      return {pos: p, groundY: hit?.point[1] ?? p[1], yaw: Math.atan2(q[0] - p[0], -(q[2] - p[2]))};
    }
    const safe = recoveryPoint(navigationRoads, pos);
    return {...safe, groundY: elevationAt(elevation, safe.pos[0], safe.pos[2])};
  };
  if (!q.has('event') || locked)
    course.start =
      at.id === 'gate'
        ? {pos: [...ARRIVAL_START.pos], yaw: ARRIVAL_START.yaw}
        : {pos: [at.pos[0], 0, at.pos[2] + 6], yaw: 0};
  // The fresh open-world arrival uses the authored residential skatepark start. Explicit URLs
  // retain their requested entrance or race grid behavior.
  if ((!q.has('event') || locked) && at.id === 'skatepark')
    course.start = {pos: [...RESIDENTIAL_START.pos], yaw: RESIDENTIAL_START.yaw};
  // World challenge coins sit at landmarks, outside the rings. Discovery and coins are distinct.
  const eventBounds = course.outOfBounds;
  course.outOfBounds = pos => (pos[0] > 9000 && pos[1] < -3) || !!eventBounds?.(pos);
  course.coins = LOCATIONS.map(p => ({name: `WORLD_${p.id}`, x: p.pos[0] + 4, y: 0.15, z: p.pos[2] + 2}));
  course.secrets = SPECIMENS;
  let golf = null,
    golfVisual = null,
    bowlingVisual = null;
  const portal = createPortalTransition();
  let portalBusy = false;
  const timeGates = createTimeGates();
  let darkWorld = null,
    gateBusy = false;
  let darkClock = null,
    outlawView = null,
    outlawClock = 0;
  const gang = createGang(),
    dig = createDig();
  let digView = null,
    farm = null,
    farmLoad = null,
    farmScene = null;
  const setEra = era => {
    const past = era === 'past';
    if (past) {
      stream.world.openGate('era-club');
      stream.world.closeGate('era-meadow');
    } else {
      stream.world.closeGate('era-club');
      stream.world.openGate('era-meadow');
    }
    mountainView?.setPast(past);
    if (past) stream.world.openGate('era-dam');
    else stream.world.closeGate('era-dam');
    // The steam-era farmstead (prop kit, placements/example-farmstead.json): the past only. Loaded the first time you go back; its
    // collision is gated so the present's lake bed has no invisible fences.
    if (past) stream.world.closeGate('era-farm');
    else stream.world.openGate('era-farm');
    if (farm) farm.root.visible = past;
    if (past && !farmLoad && farmScene)
      farmLoad = (async () => {
        const kit = await preparePlacementKit('kit/props.glb'),
          data = await loadPlacements(
            new URL('../assets/placements/example-farmstead.json', import.meta.url).href,
            {kit}
          );
        farm = instantiatePlacements(farmScene, data, {
          kit,
          elevationAt: (x, z) => elevationAt(elevation, x, z),
          world: {
            addTri: (a, b, c, surface) => stream.world.addTri(a, b, c, surface, 'era-farm'),
            raycast: stream.world.raycast
          }
        });
        farm.root.visible = timeGates.era() === 'past';
      })().catch(e => console.warn('farmstead off', e));
  };
  let corridor,
    landmarks,
    zoo,
    jetDecks,
    trickOrTreat,
    booster,
    highSchool,
    bowlingAlley,
    hotWheels,
    club,
    meadow,
    route = [],
    target = null,
    lastTile = '',
    lastRoute = 0,
    trafficAt = null,
    jumpedTo = null;
  const graph = buildRoadGraph(navigationRoads);
  const routeFor = (pos, p) => {
    const exit = districtExitRoute(pos, districts.courses);
    return [...exit.slice(0, -1), ...roadRoute(graph, exit.at(-1), [p.pos[0], p.pos[2]])];
  };
  const api = {
    lighting(day, pos) {
      terrain?.update(day, pos[0] > 9000);
      mountainView?.update(day);
      farGround?.update(day);
      render?.update(day);
      corridor?.update(day, pos, day < 0.99 ? (render?.fixtures() ?? []) : []);
    },
    async portal(pos, time) {
      if (portalBusy) return null;
      const trip = portal.step(pos, canEnter(progress, locationById('night-wave')), time);
      if (!trip) return null;
      portalBusy = true;
      try {
        if (!(await stream.prepare(trip.position))) return null;
        await stream.update(trip.position);
        if (!stream.ready(trip.position)) return null;
        golf = null;
        target = null;
        route = [];
        return trip;
      } finally {
        portalBusy = false;
      }
    },
    // The dark world is the past (dark-world.mjs): a time gate swaps the era (no dam, the lake gone,
    // the Lake Town alive) and returns where to put the toy. The first crossing wakes the others.
    era: () => timeGates.era(),
    // The Lake Town's outlaw gang (outlaws.mjs): o = { pos, riding, speed, robot, input, mode, dt }.
    outlaws(o) {
      const groundAt = (x, z) => elevationAt(elevation, x, z),
        ev = stepGang(gang, {...o, era: timeGates.era(), groundAt});
      if (ev.some(e => e.cleared) && !progress.lakeTownFreed) {
        progress.lakeTownFreed = true;
        saveProgress(storage, progress);
        for (const e of ev) if (e.cleared) e.reward = 'sheriff';
      }
      for (const e of ev) if (e.home) e.home[1] = groundAt(e.home[0], e.home[2]) + 0.05;
      outlawClock += o.dt;
      const past = timeGates.era() === 'past';
      if (outlawView) {
        outlawView.root.visible = past;
        if (past) outlawView.sync(gang.enemies, outlawClock, o.dt, groundAt);
      }
      return ev;
    },
    gang: () => gang,
    groundAt: (x, z) => elevationAt(elevation, x, z),
    // Dig down to the light world (dig.mjs): o = { pos, holding, climb, dt, time }. Breaking the portal
    // layer flips to the present; the through event carries where to come out of the ground.
    dig(o) {
      // Until the dark world is its own world the size of the light one (owner ruling, 31 Oct; the
      // next refactor), digging in the present only goes down where the past exists: the mountain.
      const era = timeGates.era(),
        here = era === 'past' || pastHolds(o.pos[0], o.pos[2]),
        ground = elevationAt(elevation, o.pos[0], o.pos[2]),
        ev = stepDig(dig, {...o, holding: o.holding && here, era, ground});
      for (const e of ev)
        if (e.through) {
          timeGates.goTo(e.to, o.time);
          setEra(e.to);
          if (e.to === 'past' && !progress.timeCrossed) {
            progress.timeCrossed = true;
            saveProgress(storage, progress);
          }
          e.position = [e.through[0], elevationAt(elevation, e.through[0], e.through[1]), e.through[1]];
        }
      digView?.update(dig, o.dt, ev);
      return ev;
    },
    farm: () => farm && {visible: farm.root.visible, counts: farm.counts},
    digging: () => dig.active,
    digFloor: () => digFloor(dig),
    digCamera: () => digView?.camera(dig) ?? null,
    // A time gate (dark-world.mjs crossTimeGate): the destination loads first; the era, the
    // first-crossing flag and the world switch only change once it has.
    async timeGate(pos, time) {
      if (gateBusy) return null;
      gateBusy = true;
      try {
        const trip = await crossTimeGate(timeGates, pos, {
          crossed: !!progress.timeCrossed,
          now: time,
          groundAt: (x, z) => elevationAt(elevation, x, z),
          prepare: async position => {
            if (!(await stream.prepare(position))) return false;
            await stream.update(position);
            return stream.ready(position);
          }
        });
        if (!trip) return null;
        setEra(trip.to);
        if (trip.to === 'past' && !progress.timeCrossed) {
          progress.timeCrossed = true;
          saveProgress(storage, progress);
        }
        return trip;
      } finally {
        gateBusy = false;
      }
    },
    step(car, dt) {
      activities?.step(car, dt);
    },
    traffic(race) {
      landmarks?.setRacing(!race.roam);
      if (
        !race.roam ||
        Math.hypot(
          race.player.car.pos[0] - RESIDENTIAL_PARK.anchor[0],
          race.player.car.pos[2] - RESIDENTIAL_PARK.anchor[2]
        ) > 40
      )
        trafficAt = updateTraffic(race, overview.roads, stream, trafficAt);
    },
    course,
    stream,
    residentialTerrain,
    overview,
    progress,
    selected,
    locked,
    at,
    search,
    activity: () => golf,
    districtAt(pos) {
      if (Math.hypot(pos[0] - RESIDENTIAL_PARK.anchor[0], pos[2] - RESIDENTIAL_PARK.anchor[2]) < 40)
        return {id: 'skatepark', course: districts.courses.get('skatepark')};
      for (const id of Object.keys(DISTRICT_ZONES)) {
        const b = districtBounds(id);
        if (districts.courses.has(id) && pos[0] >= b[0] && pos[0] <= b[2] && pos[2] >= b[1] && pos[2] <= b[3])
          return {id, course: districts.courses.get(id)};
      }
      return null;
    },
    startActivity(kind, options = {}) {
      golf = kind === 'bowling' ? createBowling(options) : createGolf();
      return kind === 'bowling' ? bowlingTee(golf.lane) : golfTee(golf);
    },
    cancelActivity() {
      golf = null;
    },
    resetActivity() {
      if (!golf) return null;
      const tee = golf.kind === 'bowling' ? nextDelivery(golf) : resetGolf(golf);
      if (golf.kind === 'bowling' && golf.done) {
        progress.bowlingBest = Math.max(progress.bowlingBest ?? 0, golf.score);
        progress.bowlingVersion = 2;
        saveProgress(storage, progress);
      }
      return tee;
    },
    stepActivity(dt, car) {
      if (!golf) return null;
      const event = golf.kind === 'bowling' ? stepBowling(golf, car, dt) : stepGolf(golf, car, dt);
      if (event?.cancelled) {
        golf = null;
        return event;
      }
      if (event?.finished) {
        if (golf.kind === 'bowling') {
          progress.bowlingBest = Math.max(progress.bowlingBest ?? 0, event.score);
          progress.bowlingVersion = 2;
        } else progress.golfBest = Math.min(progress.golfBest ?? Infinity, event.total);
        saveProgress(storage, progress);
      }
      return event;
    },
    route: () => route,
    target: () => target,
    loadBackground() {
      districts.loadRest().catch(error => console.warn('RC district unavailable:', error));
    },
    async attach(scene) {
      await heroesReady;
      terrain = createTerrain(scene, terrainData, BOUNDS);
      await districts.attach(scene);
      residential.attach(scene);
      residentialPark.attach(scene);
      schoolyard.attach(scene);
      residentialYards.attach(scene);
      flyovers = createFlyovers(scene);
      if (season === 'halloween') {
        const porches = residentialPorches(residentialData, {terrain: residentialTerrain});
        trickOrTreat = createTrickOrTreatVisual(scene, porches);
        halloween = createHalloween(scene, stream.world, {
          porches,
          heightAt: (x, z) => (inResidential([x, 0, z]) ? residentialTerrain.heightAt(x, z) : 0)
        });
      }
      residentialCivic.attach(scene);
      residentialSchool = buildResidentialSchool(scene, residentialData, {terrain: residentialTerrain});
      highSchool = buildHighSchool(scene, stream.world, residentialData, {terrain: residentialTerrain});
      await residentialDetails.attach(scene); // Authored venues as data (docs/rc-placements.md): the kit and a placement file, batched per prop. A missing or bad file never blocks the world.
      try {
        const kit = await preparePlacementKit('kit/props.glb');
        const data = await loadPlacements(
          new URL('../assets/placements/example-picnic-area.json', import.meta.url).href,
          {kit}
        );
        venue = instantiatePlacements(scene, data, {
          kit,
          world: stream.world,
          elevationAt: (x, z) =>
            inResidential([x, 0, z]) ? residentialTerrain.heightAt(x, z) : elevationAt(elevation, x, z)
        });
      } catch (e) {
        console.warn('placements unavailable', e);
      }
      bowlingAlley = buildBowlingAlley(scene, stream.world);
      bowlingVisual = createBowlingVisual(scene);
      golfVisual = createGolfVisual(scene);
      render = createTileRenderer(scene, elevation, residentialTerrain, MARSEILLE_TERRAIN);
      mountainView = createMountainView(scene, (x, z) => elevationAt(elevation, x, z));
      farGround = createFarGround(scene, (x, z) => elevationAt(elevation, x, z), BOUNDS);
      darkWorld = createDarkWorld(scene, (x, z) => elevationAt(elevation, x, z));
      outlawView = createBadToys(scene, {look: 'outlaw'});
      digView = createDigView(scene);
      farmScene = scene;
      stream.world.openGate('era-farm');
      for (const [k, t] of stream.loaded) {
        render.load(k, t);
        mountainView.tileLoaded(k, true);
      }
      activities = buildActivities(scene, stream.world, {alienUnlocked: () => alienWorldUnlocked(progress)});
      landmarks = buildLandmarks(scene, stream.world, progress, overview.roads, heroTemplate('landmarks'));
      zoo = createPettingZoo(scene, stream.world);
      jetDecks = createJetDecks(scene, stream.world);
      booster = createBooster(scene, (x, z) => elevationAt(elevation, x, z));
      hotWheels = createHotWheels(scene, stream.world);
      // The club in the present, the spring meadow in the past (meadow.js): each one's collision on
      // its own era gate, so neither leaves invisible walls in the other time.
      club = createCountryClub(
        scene,
        {
          addTri: (a, b, c, s) => stream.world.addTri(a, b, c, s, 'era-club'),
          addQuad: (a, b, c, d, s) => {
            stream.world.addTri(a, b, c, s, 'era-club');
            stream.world.addTri(a, c, d, s, 'era-club');
          },
          raycast: stream.world.raycast
        },
        (x, z) => elevationAt(elevation, x, z)
      );
      meadow = createMeadow(scene, stream.world, (x, z) => elevationAt(elevation, x, z));
      if (timeGates.era() === 'past') stream.world.openGate('era-club');
      else stream.world.openGate('era-meadow');
      corridor = buildCorridorArt(scene);
    },
    season,
    hotWheels: () => hotWheels,
    club: () => club,
    meadow: () => meadow,
    /** QA only: jump straight to an era (headless captures can't easily drive through a gate). */
    qaEra(era) {
      timeGates.goTo(era, 0);
      setEra(era);
    },
    /** The roundup at the spring meadow (past only): returns its events. */
    meadowStep: (dt, pos) =>
      meadow?.step(dt, pos ? [pos[0], pos[2]] : null, timeGates.era() === 'past') ?? [],
    boosterStep: (dt, pos) => booster?.step(dt, pos) ?? [],
    booster: () => booster,
    trickOrTreat: (pos, trick, time, dt) => trickOrTreat?.step(pos, trick, time, dt) ?? [],
    candy: () => trickOrTreat?.state.candy ?? null,
    treatHouses: () => trickOrTreat?.houses ?? [],
    jetDecks: () => jetDecks?.decks,
    zooStep(pos, dt) {
      return zoo?.step(pos, dt) ?? [];
    },
    seasonStep(pos, vel, time) {
      return halloween?.step(pos, vel, time) ?? [];
    },
    qaFlyover(before) {
      if (!flyovers) return null;
      if (!flyovers.state.active) flyovers.state.next = 0;
      const p = flyovers.state.active;
      if (p && before != null) p.t = Math.max(0, 1800 / p.speed - before);
      return (
        p && {
          shown: flyovers.debug(),
          types: p.flight.types,
          dir: p.dir,
          t: p.t,
          duration: p.duration,
          speed: p.speed,
          start: p.ships[0].start
        }
      );
    },
    routeTo(pos, place) {
      return routeFor(pos, place);
    },
    places() {
      return LOCATIONS.filter(p => !p.alien && p.pos[0] < 9000 && canVisit(progress, p));
    },
    skySounds() {
      return flyovers?.sounds() ?? [];
    },
    update(time, pos, camera, onDiscover, playerPos = pos) {
      halloween?.update(time);
      darkWorld?.update(
        Math.max(0, Math.min(0.1, time - (darkClock ?? time))),
        timeGates.era(),
        !!progress.timeCrossed,
        pos
      );
      darkClock = time;
      if (farm?.root.visible) farm.spin('windmill-head', time * 1.3);
      flyovers?.update(flyoverAt === null ? 0 : Math.min(0.1, Math.max(0, time - flyoverAt)), pos, {
        quiet: pos[0] > 9000 || timeGates.era() === 'past',
        eye: camera ? [camera.position.x, camera.position.y, camera.position.z] : pos,
        heading: camera
          ? (() => {
              const f = camera.getWorldDirection(new camera.position.constructor()),
                n = Math.hypot(f.x, f.z) || 1;
              return [f.x / n, f.z / n];
            })()
          : null
      });
      flyoverAt = time;
      landmarks?.update(time, pos, camera);
      highSchool?.update?.(1 / 60);
      hotWheels?.update(1 / 60);
      club?.update(1 / 60, pos, timeGates.era() !== 'past');
      activities?.update(time, pos);
      golfVisual?.update(golf?.kind === 'golf' ? golf : null);
      bowlingVisual?.update(golf);
      bowlingAlley?.update(golf?.kind === 'bowling' ? golf : null, playerPos);
      const key = pos.map((v, i) => (i === 1 ? 0 : Math.floor(v / 64))).join(',');
      if (key !== lastTile || stream.errors.size) {
        lastTile = key;
        stream.update(pos);
      } // A jump is a visit, not a discovery: progression waits until the car drives away and back.
      if (jumpedTo && distance(pos, jumpedTo) > 60) jumpedTo = null;
      if (!jumpedTo)
        for (const p of discover(progress, pos)) {
          saveProgress(storage, progress);
          onDiscover?.(p);
        }
      if (target && time - lastRoute > 4) {
        lastRoute = time;
        route = routeFor(pos, target);
      }
    },
    navigate(id, pos) {
      const next = locationById(id);
      target = next && canVisit(progress, next) ? next : null;
      if (target) route = routeFor(pos, target);
    },
    near: pos => {
      const p = nearestLocation(pos);
      return distance(pos, p.pos) < 9 ? p : null;
    },
    async travel(id) {
      // A dark-world place (dark-world.mjs DARK_PLACES): jump there and into the past.
      const dark = darkPlaceById(id);
      if (dark) {
        const [x, z] = dark.at,
          pos = [x, elevationAt(elevation, x, z), z];
        if (!(await stream.prepare(pos))) return null;
        await stream.update(pos);
        if (!stream.ready(pos)) return null;
        timeGates.goTo('past');
        setEra('past');
        if (!progress.timeCrossed) {
          progress.timeCrossed = true;
          saveProgress(storage, progress);
        }
        golf = null;
        target = null;
        route = [];
        return {arrival: {pos, yaw: dark.yaw}, era: 'past'};
      }
      const p = locationById(id);
      if (!p || !canVisit(progress, p)) return null;
      if (timeGates.era() === 'past') {
        timeGates.goTo('present');
        setEra('present');
      }
      if (p.track && p.track in DISTRICT_ZONES && !districts.courses.has(p.track))
        try {
          await districts.loadRest();
        } catch {
          return null;
        }
      const start =
        p.id === 'skatepark'
          ? RESIDENTIAL_START
          : p.id === 'gate'
            ? ARRIVAL_START
            : p.track && districts.courses.has(p.track)
              ? districts.courses.get(p.track).start
              : p.event && p.id !== 'lab'
                ? eventCourse(eventById(p.event), stream.world).start
                : {pos: [p.pos[0], p.pos[1], p.pos[2] + 6], yaw: 0};
      const pos = [...start.pos];
      if (!(await stream.prepare(pos))) return null;
      await stream.update(pos);
      if (!stream.ready(pos)) return null;
      jumpedTo = pos;
      const datum = inResidential(pos)
          ? residentialTerrain.heightAt(pos[0], pos[2])
          : elevationAt(elevation, pos[0], pos[2]),
        height = Math.max(pos[1], datum),
        hit = stream.world.raycast([pos[0], height + 1, pos[2]], [0, -1, 0], 3);
      if (!hit) return null;
      pos[1] = hit.point[1];
      golf = null;
      target = null;
      route = [];
      lastTile = '';
      return {...p, arrival: {pos, yaw: start.yaw}};
    },
    collect(seen) {
      const before = expedition(progress),
        found = collectSpecimens(progress, seen);
      if (found.length) saveProgress(storage, progress);
      return {found, unlocked: !before.unlocked && expedition(progress).unlocked};
    },
    save() {
      saveProgress(storage, progress);
    },
    finish(time) {
      recordFinish(progress, selected.id, time);
      saveProgress(storage, progress);
    },
    eventURL(p, kind = 'race') {
      if (!canEnter(progress, p)) return rcLink({track: 'hub', at: p.id}, search);
      return rcLink(
        {track: 'hub', event: p.event ?? (p.track ? 'district-' + p.track : 'ramp-rat'), mode: kind},
        search
      );
    },
    dispose() {
      venue?.dispose();
      venue = null;
      halloween?.dispose();
      club?.dispose();
      meadow?.dispose();
      hotWheels?.dispose();
      highSchool?.dispose();
      booster?.dispose();
      trickOrTreat?.dispose();
      zoo?.dispose();
      jetDecks?.dispose();
      flyovers?.dispose();
      corridor?.dispose();
      residentialPark.dispose();
      schoolyard.dispose();
      residentialYards.dispose();
      residentialSchool?.dispose();
      residentialCivic.dispose();
      residentialDetails.dispose();
      residential.dispose();
      activities?.dispose();
      terrain?.dispose();
      districts.dispose();
      stream.dispose();
      render?.dispose();
      landmarks?.dispose();
      golfVisual?.dispose();
      bowlingVisual?.dispose();
      bowlingAlley?.dispose();
    }
  };
  return api;
}
