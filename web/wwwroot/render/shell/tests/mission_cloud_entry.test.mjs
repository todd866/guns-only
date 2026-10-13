import test from 'node:test';
import assert from 'node:assert/strict';
import { beginMissionCloudEntry } from '../mission_cloud_entry.js';

test('F-22 launch clears any previous synthetic entry; other airframes retain theirs', () => {
  const calls=[];
  const view={cancelCloudBreakEntry:()=>calls.push('cancel'),beginCloudBreakEntry:()=>calls.push('begin')};
  beginMissionCloudEntry(view,{player_aircraft_id:'aircraft.f22a.public-data-surrogate'});
  assert.deepEqual(calls,['cancel']);
  beginMissionCloudEntry(view,{player_aircraft_id:'aircraft.rapier'});
  assert.deepEqual(calls,['cancel','begin']);
  beginMissionCloudEntry(null,{player_aircraft_id:'aircraft.f22a.public-data-surrogate'});
});
