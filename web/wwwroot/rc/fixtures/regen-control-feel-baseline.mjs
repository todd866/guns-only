// Rebuild fixtures/control-feel-baseline.json from the 1371fbac stick curves.
// Camera samples are not the measured right-stick rate (that was 0 — the stick did not look).
// The compared camera curve is the calm ceiling: half of fd32ef31's orbit, dead zone 0.2, expo 2.
// A ceiling of 0 would reject every look. The hot orbit is more than 10% above this ceiling.
//   node web/wwwroot/rc/fixtures/regen-control-feel-baseline.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  STICK_SWEEP,
  SPEED_SWEEP,
  knownGoodResponse,
  response
} from '../control-feel.mjs';

const round = n => Math.round(n * 1e6) / 1e6;
const here = path.dirname(fileURLToPath(import.meta.url));

export function buildBaseline() {
  const samples = [];
  for (const speed of SPEED_SWEEP)
    for (const stick of STICK_SWEEP) {
      const good = knownGoodResponse(stick, speed),
        calm = response(stick, speed, {sensitivity: 'low', mode: 'kid'});
      const row = {stick, speed};
      for (const [key, value] of Object.entries(good)) row[key] = round(value);
      // Hold the camera to the calm orbit. The measured 1371fbac rate stays beside it.
      row.cameraYawMeasured = 0;
      row.cameraPitchMeasured = 0;
      row.cameraYawRate = round(calm.cameraYawRate);
      row.cameraPitchRate = round(calm.cameraPitchRate);
      samples.push(row);
    }
  return {
    source: '1371fbac',
    cameraNote:
      'Right-stick camera yaw/pitch on 1371fbac was 0 (cameraYawMeasured). The compared cameraYawRate is the Low ceiling: half of fd32ef31 (yaw 1.7, pitch 1.15 rad/s) after a 0.2 dead zone and expo 2. The hot linear orbit exceeds that ceiling by more than 10%.',
    stick: STICK_SWEEP,
    speed: SPEED_SWEEP,
    mode: 'kid',
    sensitivity: 'low',
    samples
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.join(here, 'control-feel-baseline.json');
  fs.writeFileSync(out, JSON.stringify(buildBaseline(), null, 2) + '\n');
  console.log(`wrote ${out}`);
}
