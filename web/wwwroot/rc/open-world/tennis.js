import * as T from '../../vendor/three.module.js';
import {makeRobotBody, poseRobotBody, disposeRobotBody} from '../robot-body.js';
import {TENNIS, createTennis, startTennis, stopTennis, stepTennis, swingTennis} from './tennis.mjs';

// The country-club.js scene already draws the court, lines, and net. This adapter owns only the
// little moving things on the court, so it can be shown and hidden without duplicating the venue.
export function createTennisCourt(scene, heightAt = () => 0) {
  const root = new T.Group();
  root.name = 'Tennis Game';
  const state = createTennis();
  const bot = makeRobotBody('#63b6e8');
  const keep = [];
  const K = x => (keep.push(x), x);
  const ball = new T.Mesh(
    K(new T.SphereGeometry(TENNIS.radius, 14, 10)),
    K(new T.MeshStandardMaterial({color: '#f5d849', roughness: 0.62}))
  );
  ball.castShadow = true;
  ball.scale.setScalar(2.5); // drawn bigger than its 10 cm physics radius so a child can follow it

  const racketHandle = K(new T.CylinderGeometry(0.012, 0.012, 0.12, 8));
  const racketHead = K(new T.TorusGeometry(0.07, 0.012, 6, 16));
  const racketGrip = K(new T.MeshStandardMaterial({color: '#313b45', roughness: 0.75}));
  const racketFrame = K(new T.MeshStandardMaterial({color: '#f0a52d', roughness: 0.45}));
  const makeRacket = () => {
    const racket = new T.Group();
    const grip = new T.Mesh(racketHandle, racketGrip);
    grip.position.y = 0.08;
    const head = new T.Mesh(racketHead, racketFrame);
    head.position.y = 0.2;
    head.rotation.x = Math.PI / 2;
    racket.add(grip, head);
    racket.visible = false;
    return racket;
  };
  const playerRacket = makeRacket();
  const botRacket = makeRacket();
  root.add(ball, bot, playerRacket, botRacket);
  scene.add(root);

  let playerSwing = 0;
  let botSwing = 0;
  let lastPlayer = null;

  function floorY(x, z) {
    return heightAt(x, z) + 0.04;
  }

  function poseRacket(racket, actor, groundY, side = 1, swing = 0) {
    if (!actor?.pos) {
      racket.visible = false;
      return;
    }
    const yaw = actor.yaw ?? 0;
    const reach = 0.115 * side;
    racket.position.set(
      actor.pos[0] + Math.cos(yaw) * reach,
      (actor.pos[1] ?? groundY) + 0.01,
      actor.pos[2] - Math.sin(yaw) * reach
    );
    racket.rotation.y = -yaw;
    racket.rotation.z = side * -0.14;
    racket.rotation.x = swing > 0 ? -0.65 * Math.min(1, swing / 0.16) : 0;
    racket.visible = true;
  }

  function draw(player) {
    const b = state.bot;
    if (b?.pos) {
      bot.visible = true;
      const botGround = floorY(b.pos[0], b.pos[2]);
      poseRobotBody(bot, {
        pos: [b.pos[0], botGround, b.pos[2]],
        vel: b.vel ?? [0, 0, 0],
        yaw: b.yaw ?? Math.PI,
        walkPhase: b.walkPhase ?? 0
      });
      poseRacket(botRacket, {...b, pos: [b.pos[0], botGround, b.pos[2]]}, botGround, -1, botSwing);
    } else {
      bot.visible = false;
      botRacket.visible = false;
    }
    if (state.ball?.pos) {
      const [x, y, z] = state.ball.pos;
      ball.position.set(x, floorY(x, z) + y, z);
      ball.visible = !!state.active && !state.done;
    } else ball.visible = false;
    if (player?.pos) {
      poseRacket(playerRacket, player, player.pos[1] ?? floorY(player.pos[0], player.pos[2]), 1, playerSwing);
      playerRacket.visible = !!state.active && !state.done;
    } else playerRacket.visible = false;
  }

  draw(lastPlayer);
  return {
    state,
    start(mode) {
      const result = startTennis(state, {mode});
      draw(lastPlayer);
      return result;
    },
    stop() {
      stopTennis(state);
      draw(lastPlayer);
    },
    swing(player) {
      lastPlayer = player ?? lastPlayer;
      const p = lastPlayer ?? {pos: [TENNIS.center[0], 0, TENNIS.center[1]], power: 0.7, aim: 0};
      const hit = swingTennis(state, {pos: p.pos, power: p.power ?? 0.7, aim: p.aim ?? 0});
      if (hit) playerSwing = 0.16;
      draw(lastPlayer);
      return hit;
    },
    step(dt, player) {
      playerSwing = Math.max(0, playerSwing - dt);
      botSwing = Math.max(0, botSwing - dt);
      lastPlayer = player ?? lastPlayer;
      const pos = lastPlayer?.pos ?? [TENNIS.center[0], 0, TENNIS.center[1]];
      const events = stepTennis(state, {pos}, dt);
      if (events?.some(event => event.hit === 'bot' || event.serve)) botSwing = 0.16;
      draw(lastPlayer);
      return events;
    },
    update(pos, show = true) {
      const near = !pos || Math.hypot(pos[0] - TENNIS.center[0], pos[2] - TENNIS.center[1]) < 150;
      root.visible = !!show && near;
      draw(lastPlayer);
    },
    dispose() {
      stopTennis(state);
      disposeRobotBody(bot);
      root.removeFromParent();
      keep.forEach(resource => (resource.dispose ? resource.dispose() : null));
    }
  };
}
