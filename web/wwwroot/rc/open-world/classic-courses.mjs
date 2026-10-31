import {ROAD_EVENTS} from './road-events.mjs';
// Four mapped MK64 counterparts with authored routes in the local metre frame.
export const CLASSIC_LOCATIONS = Object.freeze([
  {
    id: 'hq',
    name: 'HQ Offices',
    short: 'HQ',
    pos: [-550, 0, -100],
    color: '#d5a56b',
    icon: '◇',
    kind: 'race',
    event: 'base-traffic',
    entrance: 'Main Gate boulevard'
  },
  {
    id: 'quarry',
    name: 'Desert Quarry Extension',
    short: 'Quarry',
    pos: [2040, 0, 1420],
    color: '#d3a068',
    icon: '◇',
    kind: 'race',
    event: 'quarry-run',
    entrance: 'Whoops northeast cutting'
  },
  {
    id: 'demo',
    name: 'Demonstration Team Hangar',
    short: 'Demo Hangar',
    pos: [820, 0, 400],
    color: '#8bc5d0',
    icon: '◇',
    kind: 'race',
    event: 'demo-team-circuit',
    entrance: 'Hangar Row service loop'
  },
  {
    id: 'boardwalk',
    name: 'After Hours Boardwalk',
    short: 'Boardwalk',
    pos: [-545, 0, 3388],
    color: '#75d4d1',
    icon: '◇',
    kind: 'race',
    event: 'after-hours-boardwalk',
    entrance: 'Waterpark closed-park arch'
  }
]);
export const CLASSIC_EVENTS = Object.freeze([
  {
    id: 'base-traffic',
    name: 'Base Traffic',
    kind: 'circuit',
    road: true,
    location: 'hq',
    reference: 'Toad’s Turnpike',
    surface: 'asphalt',
    points: [
      ...ROAD_EVENTS.find(e => e.id === 'grand-tour')
        .points.slice(0, 15)
        .map(([x, z]) => [x, z, 0]),
      ...ROAD_EVENTS.find(e => e.id === 'grand-tour')
        .points.slice(1, 14)
        .reverse()
        .map(([x, z]) => [x, z, 0]),
      [-607, -29, 0]
    ],
    source: 'overview.json roads via Grand Tour source polyline',
    half: 9,
    medals: [90, 110, 140],
    hazards: ['buses', 'pickups', 'tugs'],
    route: ['Main Gate', 'Bus loop', 'BX boulevard', 'Service-road merge', 'Gate return']
  },
  {
    id: 'quarry-run',
    name: 'Quarry Run',
    location: 'quarry',
    reference: 'Choco Mountain',
    surface: 'dirt',
    points: [
      [1880, 1450, 0],
      [1960, 1370, 1],
      [2070, 1320, 3],
      [2190, 1370, 5],
      [2240, 1480, 6],
      [2160, 1570, 4],
      [2040, 1610, 2],
      [1920, 1570, 0],
      [1880, 1450, 0]
    ],
    half: 6,
    medals: [78, 96, 120],
    hazards: ['rolling foam boulders', 'soft cliff runoff'],
    route: [
      'Cutting entrance',
      'Narrow uphill',
      'Rockfall bend',
      'Ridge traverse',
      'Dusty downhill',
      'Track return'
    ]
  },
  {
    id: 'demo-team-circuit',
    name: 'Demo Team Circuit',
    location: 'demo',
    reference: 'Mario Raceway',
    surface: 'asphalt',
    points: [
      [610, 390, 0],
      [690, 330, 0],
      [790, 340, 0],
      [820, 420, 0],
      [760, 500, 0],
      [650, 520, 0],
      [590, 470, 0],
      [560, 410, 0],
      [610, 390, 0]
    ],
    half: 5,
    medals: [58, 72, 88],
    hazards: ['tyre stacks', 'rough infield'],
    route: ['Demo grid', 'Hairpin', 'Hangar pipe tunnel', 'Grass infield', 'Technical S', 'Finish straight']
  },
  {
    id: 'after-hours-boardwalk',
    name: 'After Hours Boardwalk',
    location: 'boardwalk',
    reference: 'Banshee Boardwalk',
    surface: 'wood',
    points: [
      [-610, 3388, 0],
      [-585, 3345, 1.2],
      [-520, 3325, 1.5],
      [-470, 3350, 1.5],
      [-455, 3405, 1.8],
      [-500, 3445, 1.8],
      [-570, 3430, 1.2],
      [-610, 3388, 0]
    ],
    half: 4,
    medals: [72, 88, 108],
    hazards: ['rail gaps', 'inspection drones', 'shallow recovery shelves'],
    route: [
      'Closed-park arch',
      'Lagoon boardwalk',
      'Pump-house tunnel',
      'Forked dock',
      'Maintenance shed',
      'Moonlit return'
    ]
  }
]);
export const CLASSIC_COURSES = Object.freeze({locations: CLASSIC_LOCATIONS, events: CLASSIC_EVENTS});
