import * as T from '../vendor/three.module.js';

/**
 * Build the friendly Lakitu counterpart for Saucer Springs.
 *
 * `update(state)` accepts the live race snapshot without owning it:
 * `{ alienUnlocked, car: { xyz: [x,y,z] } | { pos: [x,y,z] }, time, countdown,
 *    recovering, lap, wrongway, finish }`.
 * `time` is seconds (milliseconds are also accepted); countdown is the
 * number of start lamps still to clear. The returned object owns `root`.
 */
export function createAlienMarshal(scene, { position = [0, 4, 0], scale = 1 } = {}) {
  if (!scene?.add) throw new TypeError('createAlienMarshal requires a Three.js scene');
  const root = new T.Group();
  root.name = 'AlienMarshal';
  root.position.set(...position);
  root.scale.setScalar(scale);
  scene.add(root);

  const ownedGeometries = new Set();
  const ownedMaterials = new Set();
  const mesh = (geometry, material, parent = root) => {
    ownedGeometries.add(geometry); ownedMaterials.add(material);
    const m = new T.Mesh(geometry, material); parent.add(m); return m;
  };
  const mat = (color, options = {}) => {
    const m = new T.MeshStandardMaterial({ color, roughness: .62, metalness: 0.08, ...options });
    ownedMaterials.add(m); return m;
  };
  const textBoard=(parent,text,w,h,y,z,bg='#172d38')=>{
    if(typeof document==='undefined')return null;
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const ctx=canvas.getContext('2d');const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    const material=new T.MeshBasicMaterial({map:texture,side:T.DoubleSide});ownedMaterials.add(material);
    const panel=mesh(new T.PlaneGeometry(w,h),material,parent);panel.position.set(0,y,z);panel.rotation.y=Math.PI;
    panel.userData.setText=value=>{ctx.fillStyle=bg;ctx.fillRect(0,0,512,128);ctx.fillStyle='#fff5c9';ctx.textAlign='center';ctx.font='bold 80px sans-serif';ctx.fillText(value,256,94,495);texture.needsUpdate=true;};panel.userData.setText(text);return panel;
  };
  const saucerMat = mat(0xc5d3d0, { metalness: .68, roughness: .28 });
  const undersideMat = mat(0x384c52, { metalness: .25, roughness: .42 });
  const green = mat(0x83d6a1, { roughness: .72 });
  const greenLight = mat(0xb4f0be, { roughness: .58 });
  const black = mat(0x071114, { roughness: .2, metalness: .1 });
  const amber = mat(0xffc65c, { emissive: 0xb86b18, emissiveIntensity: .55 });
  const red = mat(0xff554a, { emissive: 0x8e160f, emissiveIntensity: .8 });
  const signalGreen = mat(0x65f4a0, { emissive: 0x0e8a4c, emissiveIntensity: .85 });
  const blue = mat(0x74d9ff, { emissive: 0x126a9b, emissiveIntensity: 1.4, transparent: true, opacity: .78 });
  const white = mat(0xfff4ce, { emissive: 0x8c692c, emissiveIntensity: .5 });
  const stopRed = mat(0xd84538, { emissive: 0x49100b, emissiveIntensity: .35 });
  const robotBlue = mat(0x46758a, { metalness: .45, roughness: .4 });
  const robotDark = mat(0x172d35, { metalness: .25, roughness: .35 });
  const mpYellow = mat(0xffd25c, { emissive: 0xa76618, emissiveIntensity: .55 });

  // Shallow saucer with a raised rim, six warm underside windows and a cool centre.
  mesh(new T.CylinderGeometry(1.7, 1.42, .24, 40), saucerMat).position.y = 0;
  mesh(new T.CylinderGeometry(1.25, .58, .16, 40), undersideMat).position.y = -.16;
  const rim = mesh(new T.TorusGeometry(1.48, .1, 10, 40), white); rim.position.y = -.08; rim.rotation.x = Math.PI / 2;
  const lift = mesh(new T.CylinderGeometry(.48, .72, .08, 32), blue); lift.position.y = -.3;
  const lightWindows = [];
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    const lamp = mesh(new T.SphereGeometry(.14, 12, 8), white);
    lamp.position.set(Math.cos(a) * 1.08, -.2, Math.sin(a) * 1.08);
    lightWindows.push(lamp);
  }

  const alien = new T.Group(); alien.name = 'FriendlyAlien'; alien.position.y = .78; root.add(alien);
  const body = mesh(new T.SphereGeometry(.52, 18, 14), green, alien); body.scale.set(1, 1.08, .84);
  const head = mesh(new T.SphereGeometry(.7, 20, 16), greenLight, alien); head.position.y = .55; head.scale.set(1, 1.04, .83);
  for (const side of [-1, 1]) {
    const eye = mesh(new T.SphereGeometry(.22, 16, 12), black, alien);
    eye.position.set(side * .27, .62, -.59); eye.scale.set(.82, 1.15, .42);
  }
  const smile = mesh(new T.TorusGeometry(.18, .035, 8, 16, Math.PI), black, alien);
  smile.position.set(0, .35, -.6);
  const antenna = mesh(new T.CylinderGeometry(.035, .035, .38, 8), black, alien); antenna.position.set(0, 1.33, 0);
  const antennaBall = mesh(new T.SphereGeometry(.09, 10, 8), amber, alien); antennaBall.position.set(0, 1.54, 0);
  // Small waving arm gives the marshal a readable silhouette at race distance.
  for (const side of [-1, 1]) {
    const arm = mesh(new T.CapsuleGeometry(.11, .42, 6, 10), green, alien);
    arm.position.set(side * .63, .76, -.02); arm.rotation.z = side * -.82; arm.rotation.x = -.22;
    if (side < 0) arm.rotation.y = -.25;
  }

  // Before Dreamland is discovered, the same marshal role is an MP robot on a hover platform.
  const robot = new T.Group(); robot.name = 'RobotMP'; robot.position.y = .78; robot.userData.role = 'MP marshal'; robot.userData.marking = 'MP'; root.add(robot);
  const platform = mesh(new T.CylinderGeometry(1.2, 1.05, .12, 28), robotBlue, robot); platform.position.y = -.55;
  const platformRing = mesh(new T.TorusGeometry(1.05, .07, 8, 28), mpYellow, robot); platformRing.position.y = -.48; platformRing.rotation.x = Math.PI / 2;
  const robotBody = mesh(new T.BoxGeometry(.72, .7, .55), robotBlue, robot); robotBody.position.y = .05; robotBody.rotation.y = .08;
  const robotHead = mesh(new T.BoxGeometry(.8, .52, .62), robotDark, robot); robotHead.position.y = .62;
  for (const side of [-1, 1]) { const eye = mesh(new T.SphereGeometry(.12, 12, 8), mpYellow, robot); eye.position.set(side * .2, .66, -.34); }
  const mpBadge = mesh(new T.BoxGeometry(.34, .2, .025), mpYellow, robot); mpBadge.position.set(0, .1, -.3); mpBadge.userData.label = 'MP';textBoard(robot,'MP',.34,.2,.1,-.32);
  for (const side of [-1, 1]) { const arm = mesh(new T.CapsuleGeometry(.08, .32, 5, 8), robotBlue, robot); arm.position.set(side * .52, .08, 0); arm.rotation.z = side * .75; }
  const robotAntenna = mesh(new T.CylinderGeometry(.025, .025, .3, 8), robotBlue, robot); robotAntenna.position.set(0, 1.06, 0);
  const robotLamp = mesh(new T.SphereGeometry(.08, 10, 8), mpYellow, robot); robotLamp.position.set(0, 1.22, 0);
  robot.visible = true;

  const beamMaterial = mat(0x71dfff, { emissive: 0x1e9ed0, emissiveIntensity: 1.3, transparent: true, opacity: .22, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending });
  const beamGlowMaterial = mat(0x9deaff, { emissive: 0x37c9ff, emissiveIntensity: 1.8, transparent: true, opacity: .5, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending });
  const beam = mesh(new T.ConeGeometry(.68, 4.2, 32, 1, true), beamMaterial); beam.name = 'RecoveryBeam'; beam.position.y = -2.4; beam.visible = false;
  const beamGlow = mesh(new T.CylinderGeometry(.25, .5, .05, 24), beamGlowMaterial); beamGlow.name = 'RecoveryBeamGlow'; beamGlow.position.y = -.3; beamGlow.visible = false;

  const board = new T.Group(); board.name = 'RaceSignals'; board.position.set(0, 2.25, -.15); root.add(board);
  const boardBody = mesh(new T.BoxGeometry(1.55, .42, .18), undersideMat, board);
  const lamps = [red, amber, signalGreen].map((material, i) => {
    const l = mesh(new T.SphereGeometry(.13, 14, 10), material, board); l.position.set(-.48 + i * .48, 0, -.12); return l;
  });
  const stop = new T.Group(); stop.name = 'StopSign'; stop.position.set(1.15, -.2, -.1); board.add(stop);
  const sign = mesh(new T.CylinderGeometry(.28, .28, .035, 8), stopRed, stop); sign.rotation.x = Math.PI / 2;
  const signPost = mesh(new T.CylinderGeometry(.025, .025, .55, 6), white, stop); signPost.position.y = -.35;
  textBoard(stop,'STOP',.39,.14,0,-.025,'#c43226');
  stop.visible = false;
  const finish = new T.Group(); finish.name = 'FinishFlag'; finish.position.set(-1.1, -.1, -.1); board.add(finish);
  const flagPole = mesh(new T.CylinderGeometry(.025, .025, .6, 6), white, finish); flagPole.position.y = -.25;
  for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
    const tile = mesh(new T.PlaneGeometry(.12, .12), (row + col) % 2 ? black : white, finish);
    tile.position.set(.08 + col * .12, -.08 - row * .12, 0);
  }
  finish.visible = false;
  const lapBoard = new T.Group(); lapBoard.name = 'LapBoard'; lapBoard.position.set(0, -.52, -.12); board.add(lapBoard);
  mesh(new T.BoxGeometry(.8, .2, .08), undersideMat, lapBoard);
  lapBoard.userData.label = ''; lapBoard.visible = false;
  const lapText=textBoard(lapBoard,'',1.55,.36,0,-.055);

  const carPosition = new T.Vector3();
  const targetPosition = new T.Vector3();
  const getCar = state => state?.car?.xyz || state?.car?.pos || state?.xyz || state?.pos;
  const update = (state = {}) => {
    const t = Number.isFinite(Number(state.time)) ? Number(state.time) : 0;
    const car = getCar(state);
    if (Array.isArray(car) && car.length >= 3) carPosition.set(Number(car[0]), Number(car[1]), Number(car[2]));
    const alienUnlocked = state.alienUnlocked === true;
    alien.visible = alienUnlocked;
    robot.visible = !alienUnlocked;
    const recovering = !!state.recovering;
    beam.visible = beamGlow.visible = recovering;
    if (recovering && Array.isArray(car)) {
      targetPosition.copy(carPosition).sub(root.position);
      // The marshal is positioned above the car by the caller; keep the beam vertical
      // and make its lower end meet the car's height exactly.
      const distance = Math.max(.35, (root.position.y - carPosition.y) / root.scale.y - .3);
      beam.position.y = -.3 - distance / 2;
      beam.scale.set(1, distance / 4.2, 1);
      beamGlow.position.y = -.3 - distance;
    }
    beam.rotation.y = t * .7;
    beam.material.opacity = recovering ? .2 + .08 * (0.5 + 0.5 * Math.sin(t * 9)) : .0;
    beamGlow.material.opacity = recovering ? .45 + .18 * Math.sin(t * 8) : .0;
    alien.rotation.y = Math.sin(t * .8) * .12;
    alien.position.y = .78 + Math.sin(t * 2.2) * .035;
    lift.material.opacity = .58 + .18 * Math.sin(t * 5.5);
    const count = Number(state.countdown);
    const hasCountdown = Number.isFinite(count) && count >= 0 && count <= 3;
    board.visible = hasCountdown || !!state.wrongway || !!state.retreat || !!state.finish || state.lap!=null;
    lamps.forEach((lamp, i) => { lamp.visible = hasCountdown ? (count === 0 ? i === 2 : i < 4 - count) : false; });
    stop.visible = !!state.wrongway || !!state.retreat;
    finish.visible = !!state.finish;
    const lap = state.lap && typeof state.lap === 'object' ? state.lap.current : Number(state.lap);
    const total = state.lap && typeof state.lap === 'object' ? state.lap.total : Number(state.laps ?? 3);
    lapBoard.visible = Number.isFinite(lap) || !!state.finish;
    const lastLabel=lapBoard.userData.label;
    lapBoard.userData.label = state.finish ? 'FINISH' : Number.isFinite(lap) ? `LAP ${lap}/${Number.isFinite(total) ? total : 3}` : '';
    if(lastLabel!==lapBoard.userData.label)lapText?.userData.setText(lap===total?'FINAL LAP':lapBoard.userData.label);
    return api;
  };
  const dispose = () => {
    root.removeFromParent();
    ownedGeometries.forEach(g => g.dispose());
    ownedMaterials.forEach(m => { m.map?.dispose(); m.dispose(); });
    ownedGeometries.clear(); ownedMaterials.clear();
  };
  const api = { root, update, dispose };
  update({});
  return api;
}
