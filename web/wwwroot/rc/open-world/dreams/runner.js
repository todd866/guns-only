// Wires the dream: ripple, scene swap, side-on course, mushroom ring, wake.
import * as T from '../../../vendor/three.module.js';
import {quatAxisAngle} from '../../physics/math.mjs';
import {VISUAL_SCALE} from '../../physics/car.mjs';
import {
  createDream,
  dreamActive,
  dreamFromSearch,
  dreamRingEdge,
  dreamSim,
  enterDream,
  ringContains,
  stepDream,
  takeDreamEvents
} from './runner.mjs';
import {PLANE_Z, PUFF_SCALE, coinTotal, createPlatformerRun, stepPlatformer} from './platformer.mjs';
import {createPlatformerView} from './platformer.js';

const RIPPLE = {
  uniforms: {tDiffuse: {value: null}, amount: {value: 0}, time: {value: 0}},
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse;uniform float amount,time;varying vec2 vUv;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    void main(){
      float wob=sin(vUv.y*46.+time*18.)*amount*.014+sin(vUv.y*130.-time*36.)*amount*.004;
      vec2 uv=clamp(vUv+vec2(wob,sin(vUv.x*30.+time*12.)*amount*.004),0.,1.);
      vec4 c=texture2D(tDiffuse,uv);
      float edge=smoothstep(.42,1.05,length((vUv-.5)*vec2(1.55,1.2)));
      float snow=step(.62,hash(floor(vUv*vec2(220.,120.))+floor(time*28.)))*edge*amount;
      c.rgb=mix(c.rgb,vec3(.86,.96,.9),snow*.75);
      c.rgb+=vec3(.55,.9,.75)*edge*amount*.18;
      gl_FragColor=c;
    }`
};

function ripplePass(renderer) {
  const mat = new T.ShaderMaterial({...RIPPLE, depthTest: false, depthWrite: false});
  const post = new T.Scene();
  post.add(new T.Mesh(new T.PlaneGeometry(2, 2), mat));
  const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let tex = null;
  return {
    set(amount, time) {
      mat.uniforms.amount.value = amount;
      mat.uniforms.time.value = time;
    },
    draw() {
      if (mat.uniforms.amount.value < 0.012) return;
      renderer.setRenderTarget(null);
      const w = renderer.domElement.width,
        h = renderer.domElement.height;
      if (!w || !h) return;
      if (!tex || tex.image.width !== w || tex.image.height !== h) {
        tex?.dispose();
        tex = new T.FramebufferTexture(w, h);
        mat.uniforms.tDiffuse.value = tex;
      }
      renderer.copyFramebufferToTexture(new T.Vector2(0, 0), tex);
      const clear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(post, cam);
      renderer.autoClear = clear;
    }
  };
}

function remember(cam) {
  if (!cam || cam.userData.dreamCam) return;
  cam.userData.dreamCam = {fov: cam.fov, near: cam.near, far: cam.far};
}
function recall(cam) {
  const saved = cam?.userData.dreamCam;
  if (!saved) return;
  cam.fov = saved.fov;
  cam.near = saved.near;
  cam.far = saved.far;
  cam.updateProjectionMatrix();
  delete cam.userData.dreamCam;
}

export function attachDreams(ctx) {
  const dream = createDream();
  const view = createPlatformerView();
  ctx.scene.add(view.ring);
  const ripple = ripplePass(ctx.renderer);
  const follow = new Map();
  let run = null;
  let urlDone = false;
  let bail = false;
  let celebrated = false;
  let celebrate = 0;
  let clock = 0;
  const robotPose = {pos: [0, 0, 0], yaw: 0, vel: [0, 0, 0], grounded: true, walkPhase: 0, climb: null, crouched: false};

  function flush() {
    for (const event of takeDreamEvents(dream)) ctx.telemetry?.dream?.(event.code, event);
  }
  function begin(name) {
    const list = ctx.snapshot();
    if (!enterDream(dream, name, list)) return false;
    if (list.some(p => ringContains(p.pos))) dream.ringInside = true;
    run = null;
    celebrated = false;
    celebrate = 0;
    flush();
    return true;
  }
  function holdMeshes() {
    if (!dreamSim(dream)) return;
    for (const visual of ctx.visuals()) {
      if (!visual?.mesh || visual.mesh.parent === view.scene) continue;
      visual.mesh.userData.dreamParent = visual.mesh.parent ?? ctx.scene;
      view.scene.add(visual.mesh);
    }
  }
  function releaseMeshes() {
    for (const visual of ctx.visuals()) {
      const mesh = visual?.mesh;
      if (!mesh) continue;
      (mesh.userData.dreamParent ?? ctx.scene).add(mesh);
      if (visual.kind === 'robot' || visual.kind === 'board') mesh.scale.setScalar(1);
    }
  }
  function aim(cam, rider, dt, key) {
    if (!cam || !rider) return;
    remember(cam);
    const lookY = rider.y + 0.48;
    const lead = rider.x + 1.15;
    let smooth = follow.get(key);
    if (!smooth) follow.set(key, (smooth = lookY + 0.32));
    smooth += (lookY + 0.32 - smooth) * (1 - Math.exp(-dt * 5));
    follow.set(key, smooth);
    cam.position.set(lead - 0.2, smooth, 2.7);
    cam.lookAt(lead, lookY, PLANE_Z);
    cam.fov = 30;
    cam.near = 0.04;
    cam.far = 40;
    cam.updateProjectionMatrix();
  }
  function pose(visual, rider, dt) {
    const mesh = visual?.mesh;
    if (!mesh) return;
    const big = rider.power === 'puff' ? PUFF_SCALE : 1;
    const yaw = rider.vx < -0.05 ? -Math.PI / 2 : Math.PI / 2;
    mesh.visible = true;
    if (visual.kind === 'robot' && ctx.poseRobot) {
      robotPose.pos[0] = rider.x;
      robotPose.pos[1] = rider.y;
      robotPose.pos[2] = PLANE_Z;
      robotPose.yaw = yaw;
      robotPose.vel[0] = rider.vx;
      robotPose.vel[1] = rider.vy;
      robotPose.grounded = rider.grounded;
      robotPose.walkPhase += Math.abs(rider.vx) * dt * 9;
      ctx.poseRobot(mesh, robotPose);
      mesh.scale.setScalar(big);
      return;
    }
    const lift = visual.kind === 'board' ? 0.02 : ctx.rideHeight() * big;
    mesh.position.set(rider.x, rider.y + lift, PLANE_Z);
    mesh.quaternion.set(...quatAxisAngle([0, 1, 0], -yaw));
    mesh.scale.setScalar((visual.kind === 'board' ? 1 : VISUAL_SCALE) * big);
  }

  return {
    wantsSplit: () => (dream.stored?.length ?? 0) > 1 && dreamActive(dream),
    active: () => dreamActive(dream),
    ownsSim: () => dreamSim(dream) && !!run,
    scene: () => (dreamSim(dream) ? view.scene : null),
    bail: () => {
      bail = true;
    },
    frame(dt, inputs, env) {
      clock += dt;
      if (!urlDone && !env.paused) {
        urlDone = true;
        const named = dreamFromSearch(env.search);
        if (named) begin(named);
      }
      if (dream.phase === 'idle' && !env.paused) {
        const spot = (env.positions ?? []).find(pos => ringContains(pos)) ?? env.positions?.[0];
        const named = spot ? dreamRingEdge(dream, spot) : null;
        if (named) begin(named);
      }
      if (dream.phase === 'idle' || env.paused) {
        ripple.set(dream.ripple, clock);
        view.sync(run, clock);
        if (ctx.wakeEl) ctx.wakeEl.hidden = !dreamActive(dream);
        return;
      }
      const goal = !!run?.riders?.some(rider => rider.goal);
      if (dream.phase === 'play' && goal) {
        if (!celebrated) {
          celebrated = true;
          celebrate = 1.25;
          if (ctx.audio?.ctx) ctx.audio.finish();
        } else celebrate -= dt;
      }
      stepDream(dream, dt, {goal: celebrated && celebrate <= 0, bail});
      bail = false;
      if (dream.justDream) {
        run = createPlatformerRun(dream.stored.map(p => (p.form === 'robot' ? 'robot' : 'car')));
        follow.clear();
        ctx.park(dream.stored);
      }
      if (dream.justWorld) {
        releaseMeshes();
        recall(ctx.camera);
        recall(ctx.camera2);
        ctx.park(dream.stored);
        run = null;
        follow.clear();
      }
      if (dreamSim(dream)) holdMeshes();
      ripple.set(dream.ripple, clock);
      flush();
      const on = dreamActive(dream) && !!run;
      if (ctx.wakeEl) ctx.wakeEl.hidden = !dreamActive(dream);
      if (ctx.coinsEl) {
        ctx.coinsEl.hidden = !on;
        if (on) ctx.coinsEl.textContent = `🪙 ${run.riders[0].coins}/${coinTotal()}`;
      }
      view.sync(run, clock);
    },
    substep(dt, inputs) {
      if (!run || !dreamSim(dream)) return;
      const shaped = (dream.stored ?? [0]).map((_, i) => inputs[i] ?? {move: 0, jump: false});
      stepPlatformer(run, dt, shaped);
      ctx.park(dream.stored);
    },
    present(dt) {
      if (!dreamSim(dream) || !run) return;
      holdMeshes();
      const visuals = ctx.visuals();
      run.riders.forEach((rider, i) => pose(visuals[i], rider, dt));
      aim(ctx.camera, run.riders[0], dt, 'p1');
      if (run.riders[1]) aim(ctx.camera2, run.riders[1], dt, 'p2');
      view.sync(run, clock);
    },
    ripple: () => ripple.draw()
  };
}
