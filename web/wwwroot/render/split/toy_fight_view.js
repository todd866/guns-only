// Split-screen toy fight on top of the shell. Two chase cameras, one HUD
// each. Pads come from the Gamepad API; menus reuse the RC pad helpers.

import * as THREE from "../../vendor/three.module.js";
import {createCoach} from "../../rc/coach.mjs";
import {createMenuPad} from "../../rc/gamepad-menu.mjs";
import {joinCardVisible, menuPlayersButton} from "../../rc/join.mjs";
import {padKind, padSvg} from "../../rc/pad-art.mjs";
import {downedToyPose} from "../toy/toy_pass.js";
import {ARMY_COLOR} from "./toy_cast.mjs";
import {RESPAWN_S} from "./toy_score.mjs";
import {hudRows, menuRows, pauseRows, resultRows} from "./toy_hud.mjs";
import {
  WORLD,
} from "./toy_flight.mjs";
import {
  applyMenu,
  createToyFight,
  splitTelemetry,
  stepToyFight,
} from "./toy_session.mjs";

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

function paintRows(host, rows) {
  while (host.children.length < rows.length) {
    host.append(el("button", "toy-row", '<span class="sym"></span><span class="gauge"></span><span class="val"></span><span class="datum"></span>'));
  }
  while (host.children.length > rows.length) host.lastChild.remove();
  rows.forEach((row, index) => {
    const button = host.children[index];
    button.type = "button";
    button.dataset.act = row.act || "";
    button.querySelector(".sym").textContent = row.symbol || "";
    button.querySelector(".val").textContent = row.value || "";
    button.querySelector(".datum").textContent = row.datum || "";
    const gauge = button.querySelector(".gauge");
    gauge.textContent = row.pips || "";
    gauge.classList.toggle("bar", row.fill != null && !row.pips);
    if (row.fill != null) gauge.style.setProperty("--fill", String(row.fill));
    const label = row.title || `${row.value} ${row.datum}`.trim();
    button.title = label;
    button.setAttribute("aria-label", label);
  });
}

function onRows(host, session, publish) {
  host.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.dataset.act === undefined) return;
    applyMenu(session, button.dataset.act);
    publish();
  });
}

export function mountToyFight({
  setPaused = () => {},
  telemetry = () => {},
  pads,
  theme,
} = {}) {
  const session = createToyFight();
  const root = el("section", "toy-fight solo");
  root.hidden = true;
  root.setAttribute("aria-label", "Toy fight");
  if (theme) root.dataset.theme = theme;
  const canvas = document.createElement("canvas");
  const ui = el("div", "toy-ui");
  const left = el("div", "toy-half");
  const right = el("div", "toy-half");
  const callL = el("div", "toy-call");
  const callR = el("div", "toy-call");
  const rowsL = el("div", "toy-rows");
  const rowsR = el("div", "toy-rows");
  const coachL = el("div", "toy-coach");
  const coachR = el("div", "toy-coach");
  coachL.hidden = coachR.hidden = true;
  coachL.title = "Left stick pitch and roll. Triggers throttle. A dart. B balloon. LB and RB rudder.";
  coachR.title = coachL.title;
  left.append(callL, coachL, rowsL);
  right.append(callR, coachR, rowsR);
  const divider = el("div", "toy-divider");
  divider.setAttribute("aria-hidden", "true");
  const menu = el("div", "toy-menu");
  const panel = el("div", "toy-panel");
  panel.hidden = true;
  const join = el("div", "toy-join");
  join.hidden = true;
  join.innerHTML = '<div class="join-pad" aria-hidden="true"></div><p class="join-cta">START ▶ join</p>';
  ui.append(left, right, divider, menu, panel, join);
  root.append(canvas, ui);
  document.body.append(root);

  const coach = [createCoach(), createCoach()];
  let lastKey = "";
  const publish = () => {
    const fields = splitTelemetry(session);
    const key = JSON.stringify(fields);
    if (key === lastKey) return;
    lastKey = key;
    telemetry(fields);
  };
  onRows(menu, session, publish);
  onRows(panel, session, publish);
  const menuPad = createMenuPad({
    root: () => {
      if (session.phase === "menu" && !menu.hidden) return menu;
      if ((session.phase === "pause" || session.phase === "result") && !panel.hidden) return panel;
      return null;
    },
    back: () => {
      if (session.phase === "pause" || session.phase === "result") applyMenu(session, "resume");
      else close();
    },
  });

  let renderer = null;
  let scene = null;
  let cam1 = null;
  let cam2 = null;
  const bodies = new Map();
  const shotPool = [];
  const mats = new Map();
  try {
    renderer = new THREE.WebGLRenderer({canvas, antialias: false, powerPreference: "high-performance", alpha: false});
    renderer.autoClear = false;
    renderer.setClearColor(0x1a221c, 1);
    scene = new THREE.Scene();
    cam1 = new THREE.PerspectiveCamera(55, 1, 0.1, 180);
    cam2 = new THREE.PerspectiveCamera(55, 1, 0.1, 180);
    scene.add(new THREE.AmbientLight(0xffffff, 0.86));
    const sun = new THREE.DirectionalLight(0xfff4dd, 0.9);
    sun.position.set(24, 48, 12);
    scene.add(sun);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const ball = new THREE.SphereGeometry(0.5, 10, 8);
    const cone = new THREE.ConeGeometry(0.5, 1, 8);
    const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    const mat = (hex) => {
      let material = mats.get(hex);
      if (!material) {
        material = new THREE.MeshLambertMaterial({color: hex});
        mats.set(hex, material);
      }
      return material;
    };
    const ground = new THREE.Mesh(new THREE.CircleGeometry(WORLD.half, 36), mat("#c2a36b"));
    ground.rotation.x = -Math.PI / 2;
    const rug = new THREE.Mesh(new THREE.CircleGeometry(16, 28), mat("#3f8f4a"));
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.03;
    scene.add(ground, rug);
    [[14, 8, "#e35d5d"], [-16, -6, "#3d6fe2"], [8, -18, "#f0c43d"], [-18, 16, "#49b3a8"]].forEach(([x, z, color], index) => {
      const block = new THREE.Mesh(box, mat(color));
      block.scale.set(1.4, 1.1 + (index % 2) * 0.6, 1.4);
      block.position.set(x, block.scale.y / 2, z);
      scene.add(block);
    });
    const man = () => {
      const group = new THREE.Group();
      const body = new THREE.Mesh(cyl, mat(ARMY_COLOR));
      body.scale.set(0.28, 0.46, 0.28);
      body.position.y = 0.28;
      const head = new THREE.Mesh(ball, mat(ARMY_COLOR));
      head.scale.set(0.22, 0.22, 0.22);
      head.position.y = 0.64;
      const helm = new THREE.Mesh(box, mat("#245c30"));
      helm.scale.set(0.28, 0.08, 0.28);
      helm.position.y = 0.76;
      group.add(body, head, helm);
      return group;
    };
    const splatMesh = (parent) => {
      const splat = new THREE.Mesh(ball, mat("#7eb6ff"));
      splat.name = "splat";
      splat.scale.set(0.95, 0.16, 0.95);
      splat.position.y = 0.55;
      splat.visible = false;
      parent.add(splat);
    };
    const jet = (color) => {
      const group = new THREE.Group();
      const body = new THREE.Mesh(box, mat(color));
      body.scale.set(0.46, 0.32, 1.55);
      const nose = new THREE.Mesh(cone, mat(color));
      nose.rotation.x = Math.PI / 2;
      nose.position.z = 1;
      nose.scale.set(0.26, 0.55, 0.26);
      const wing = new THREE.Mesh(box, mat(color));
      wing.scale.set(1.8, 0.06, 0.4);
      const tail = new THREE.Mesh(box, mat(color));
      tail.scale.set(0.72, 0.32, 0.08);
      tail.position.set(0, 0.22, -0.72);
      const pilot = man();
      pilot.position.y = 0.26;
      group.add(body, nose, wing, tail, pilot);
      splatMesh(group);
      return group;
    };
    const chopper = (color) => {
      const group = new THREE.Group();
      const body = new THREE.Mesh(box, mat(color));
      body.scale.set(0.5, 0.4, 1.3);
      const boom = new THREE.Mesh(box, mat(color));
      boom.scale.set(0.12, 0.12, 1.1);
      boom.position.z = -1.05;
      const rotor = new THREE.Mesh(box, mat("#245c30"));
      rotor.name = "rotor";
      rotor.scale.set(2.4, 0.04, 0.16);
      rotor.position.y = 0.45;
      const skid = new THREE.Mesh(box, mat("#245c30"));
      skid.scale.set(0.7, 0.05, 1.1);
      skid.position.y = -0.32;
      const pilot = man();
      pilot.position.set(0.2, 0.15, 0.1);
      group.add(body, boom, rotor, skid, pilot);
      splatMesh(group);
      return group;
    };
    const baddie = (craft) => {
      const gang = ["#e23d3d", "#3d6fe2", "#f0c43d"];
      const color = craft.kindId === "rc-car-gang" ? gang[(craft.slot || 0) % 3] : (craft.color || "#dddddd");
      const group = new THREE.Group();
      const id = craft.kindId;
      if (id === "wind-up-robot") {
        const body = new THREE.Mesh(box, mat(color));
        body.scale.set(0.8, 1, 0.6);
        const key = new THREE.Mesh(box, mat("#f0c43d"));
        key.scale.set(0.08, 0.45, 0.35);
        key.position.set(0, 0.2, -0.4);
        group.add(body, key);
      } else if (id === "jack-in-the-box") {
        const body = new THREE.Mesh(box, mat(color));
        body.scale.set(0.8, 0.7, 0.8);
        const head = new THREE.Mesh(ball, mat("#f4e27a"));
        head.name = "pop";
        head.position.y = 0.7;
        group.add(body, head);
      } else if (id === "rubber-band-sniper") {
        const body = new THREE.Mesh(box, mat(color));
        body.scale.set(0.4, 0.7, 0.4);
        const barrel = new THREE.Mesh(box, mat("#24180f"));
        barrel.scale.set(0.08, 0.08, 1.4);
        barrel.position.z = 0.8;
        group.add(body, barrel);
      } else if (id === "evil-teddy") {
        const body = new THREE.Mesh(ball, mat(color));
        body.scale.set(0.9, 0.8, 0.7);
        const ear = new THREE.Mesh(ball, mat(color));
        ear.scale.set(0.28, 0.28, 0.2);
        ear.position.set(-0.4, 0.45, 0);
        const ear2 = ear.clone();
        ear2.position.x = 0.4;
        group.add(body, ear, ear2);
      } else if (id === "plastic-dinosaur") {
        const body = new THREE.Mesh(box, mat(color));
        body.scale.set(0.7, 0.55, 1.4);
        const head = new THREE.Mesh(box, mat(color));
        head.scale.set(0.4, 0.35, 0.45);
        head.position.set(0, 0.35, 0.8);
        group.add(body, head);
      } else if (id === "rc-car-gang") {
        const body = new THREE.Mesh(box, mat(color));
        body.scale.set(0.7, 0.28, 1.1);
        group.add(body);
      } else if (id === "balloon-animal-blimp") {
        const body = new THREE.Mesh(ball, mat(color));
        body.scale.set(0.7, 0.55, 1.6);
        group.add(body);
      } else if (id === "tin-soldier-wrong-colour") {
        const body = new THREE.Mesh(box, mat(color));
        body.scale.set(0.45, 1.15, 0.35);
        const hat = new THREE.Mesh(cone, mat("#e6d37a"));
        hat.scale.set(0.28, 0.35, 0.28);
        hat.position.y = 0.75;
        group.add(body, hat);
      } else if (id === "spinning-top-swarm") {
        const body = new THREE.Mesh(cone, mat(color));
        body.scale.set(0.7, 0.45, 0.7);
        group.add(body);
      } else {
        const body = new THREE.Mesh(box, mat(color));
        body.scale.set(1.8, 1.1, 1.1);
        const lid = new THREE.Mesh(box, mat("#d8b07a"));
        lid.name = "pop";
        lid.scale.set(1.85, 0.18, 1.15);
        lid.position.y = 0.64;
        group.add(body, lid);
      }
      splatMesh(group);
      group.userData.kindId = id;
      return group;
    };
    const dart = new THREE.Mesh(box, mat("#f4f0d8"));
    dart.scale.set(0.08, 0.08, 0.5);
    const water = new THREE.Mesh(ball, mat("#7ec8f0"));
    water.scale.set(0.36, 0.42, 0.36);
    for (let i = 0; i < 24; i += 1) {
      const foam = dart.clone();
      const drop = water.clone();
      foam.visible = false;
      drop.visible = false;
      scene.add(foam, drop);
      shotPool.push({foam, drop});
    }
    const syncBody = (craft) => {
      let group = bodies.get(craft.id);
      if (!group) {
        group = craft.kindId === "army"
          ? (craft.kind === "chopper" ? chopper(ARMY_COLOR) : jet(ARMY_COLOR))
          : baddie({...craft, color: craft.color});
        scene.add(group);
        bodies.set(craft.id, group);
      }
      group.rotation.order = "YXZ";
      if (craft.downFor > 0) {
        const pose = downedToyPose(Math.max(0, RESPAWN_S - craft.downFor));
        group.position.set(craft.x, craft.y + pose.y, craft.z);
        group.rotation.set(pose.pitch, (craft.heading || 0) + pose.yaw, pose.roll);
      } else {
        group.position.set(craft.x, craft.y, craft.z);
        group.rotation.set(craft.pitch || 0, craft.heading || 0, -(craft.bank || 0));
      }
      const rotor = group.getObjectByName("rotor");
      if (rotor) rotor.rotation.y = craft.rotor || 0;
      const pop = group.getObjectByName("pop");
      if (pop && craft.kindId === "jack-in-the-box") pop.position.y = craft.ai?.open ? 1.3 : 0.55;
      if (pop && craft.kindId === "toy-chest-boss") pop.rotation.z = craft.ai?.lid ? 0 : -0.7;
      const paint = group.getObjectByName("splat");
      if (paint) paint.visible = (craft.splat || 0) > 0;
      const bounce = 1 + Math.min(0.25, craft.pop || 0);
      group.scale.setScalar(bounce);
    };
    root._sync = syncBody;
    root._colorOf = mat;
  } catch (error) {
    console.warn("toy fight view", error);
    renderer = null;
  }

  const readPads = () => Array.from(pads?.() ?? navigator.getGamepads?.() ?? []);
  let raf = 0;
  let last = 0;
  const frame = (time) => {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.05, (time - last) / 1000) : 0;
    last = time;
    const live = readPads();
    menuPad(live, time);
    stepToyFight(session, {dt, pads: live, now: time / 1000});
    publish();
    paint();
    draw(dt);
  };

  function aim(cam, craft) {
    if (!craft) {
      cam.position.set(0, 12, 18);
      cam.lookAt(0, 2, 0);
      return;
    }
    const back = craft.kind === "chopper" ? 8.5 : 11;
    const up = craft.kind === "chopper" ? 3.6 : 2.8;
    const hx = Math.sin(craft.heading || 0);
    const hz = Math.cos(craft.heading || 0);
    cam.position.set(craft.x - hx * back, craft.y + up, craft.z - hz * back);
    cam.lookAt(craft.x + hx * 8, craft.y + 0.5, craft.z + hz * 8);
  }

  function draw() {
    if (!renderer || !scene) return;
    const width = Math.max(1, root.clientWidth);
    const height = Math.max(1, root.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height, false);
    const bw = renderer.domElement.width;
    const bh = renderer.domElement.height;
    const sky = getComputedStyle(root).getPropertyValue("--toy-sky").trim() || "#1a221c";
    renderer.setClearColor(sky, 1);
    for (const craft of session.crafts) {
      if (!craft.color) {
        const castColor = craft.kindId === "army" ? ARMY_COLOR : null;
        craft.color = castColor;
      }
      root._sync?.(craft);
    }
    for (const [id, group] of bodies) {
      if (!session.crafts.some((craft) => craft.id === id)) {
        group.removeFromParent();
        bodies.delete(id);
      }
    }
    shotPool.forEach((slot, index) => {
      const shot = session.shots[index];
      slot.foam.visible = shot?.weapon === "dart";
      slot.drop.visible = shot?.weapon === "balloon";
      const mesh = shot?.weapon === "balloon" ? slot.drop : slot.foam;
      if (shot) mesh.position.set(shot.x, shot.y, shot.z);
    });
    const p1 = session.crafts.find((craft) => craft.seat === "p1");
    const p2 = session.crafts.find((craft) => craft.seat === "p2");
    renderer.setScissorTest(true);
    const paintCam = (x, y, w, h, cam, craft) => {
      if (w < 1 || h < 1) return;
      aim(cam, craft);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      renderer.setViewport(x, y, w, h);
      renderer.setScissor(x, y, w, h);
      renderer.clear(true, true, true);
      renderer.render(scene, cam);
    };
    if (session.split && p2) {
      const half = Math.floor(bw / 2);
      paintCam(0, 0, half, bh, cam1, p1);
      paintCam(half, 0, bw - half, bh, cam2, p2);
    } else paintCam(0, 0, bw, bh, cam1, p1);
  }

  function showCall(node, side) {
    const call = session.callout;
    const on = call && (call.side === side || call.side === "team");
    node.hidden = !on;
    if (on) node.textContent = call.text;
  }

  function paintCoach(node, who, read, index) {
    const craft = session.crafts.find((item) => item.seat === (index === 0 ? "p1" : "p2"));
    const advice = coach[index]({
      dt: 1 / 60,
      speed: craft?.speed ?? 0,
      throttle: read?.throttleRate ?? 0,
      lt: read?.lt ?? 0,
      rt: read?.rt ?? 0,
      active: session.phase === "fly",
      touched: read?.touched !== false,
    });
    node.hidden = !(advice.show && read?.connected);
    if (node.hidden || !read) return;
    const pressed = new Set();
    if (read.dartDown) pressed.add(read.kind === "sn30" ? 1 : 0);
    if (read.balloonDown) pressed.add(read.kind === "sn30" ? 0 : 1);
    if (read.startDown) pressed.add(9);
    node.innerHTML = padSvg(padKind(read.id), {pressed, axes: [read.roll, read.pitch, 0, 0]}, {labels: false, glow: advice.glow, width: 280});
  }

  function paint() {
    const flying = session.phase === "fly" || session.phase === "pause" || session.phase === "result";
    menu.hidden = session.phase !== "menu";
    panel.hidden = session.phase !== "pause" && session.phase !== "result";
    root.classList.toggle("solo", !session.split);
    right.hidden = !session.split;
    if (!menu.hidden) paintRows(menu, menuRows(session));
    const live = readPads().filter((pad) => pad && pad.connected !== false);
    const players = menuPlayersButton({split: session.split, live, p1Pad: session.p1Pad});
    if (!panel.hidden) {
      paintRows(panel, session.phase === "result" ? resultRows(session) : pauseRows(players.hidden ? "" : players.label));
    }
    const hudOn = flying && session.phase !== "menu";
    rowsL.hidden = !hudOn;
    rowsR.hidden = !hudOn || !session.split;
    if (hudOn) {
      paintRows(rowsL, hudRows(session, "p1"));
      if (session.split) paintRows(rowsR, hudRows(session, "p2"));
    }
    showCall(callL, "p1");
    showCall(callR, "p2");
    const showJoin = joinCardVisible({
      split: session.split,
      started: session.phase === "fly",
      paused: session.phase !== "fly",
      panelOpen: session.phase === "menu" || session.phase === "result",
      now: performance.now(),
      joinHideUntil: 0,
      playersUrl2: false,
      hasRival: true,
      live,
      p1Pad: session.p1Pad,
    });
    join.hidden = !showJoin;
    if (showJoin) {
      const other = live.find((pad) => pad.index !== session.p1Pad) ?? live[1];
      if (other && join.dataset.pad !== other.id) {
        join.dataset.pad = other.id;
        join.querySelector(".join-pad").innerHTML = padSvg(padKind(other.id), {}, {labels: false, glow: new Set([9]), width: 260});
      }
    }
    if (session.phase === "fly") {
      paintCoach(coachL, "p1", session._prev?.p1, 0);
      paintCoach(coachR, "p2", session._prev?.p2, 1);
    } else {
      coachL.hidden = true;
      coachR.hidden = true;
    }
  }

  function open() {
    root.hidden = false;
    setPaused(true);
    publish();
    last = 0;
    if (!raf) raf = requestAnimationFrame(frame);
    queueMicrotask(() => menu.querySelector("button")?.focus());
  }
  function close() {
    root.hidden = true;
    cancelAnimationFrame(raf);
    raf = 0;
    setPaused(false);
  }
  return {open, close, session, root, paint};
}

export function installToyFight(opts = {}) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("./toy_fight.css", import.meta.url).href;
  document.head.append(link);
  const ui = mountToyFight(opts);
  const heading = document.querySelector(".ready-program-heading");
  if (heading && !document.getElementById("toy-fight-open")) {
    const button = el("button", "toy-row toy-open", '<span class="sym">✈</span><span class="gauge"></span><span class="val">TOYS</span><span class="datum">2P</span>');
    button.type = "button";
    button.id = "toy-fight-open";
    button.title = "Two pads. Foam darts and water balloons.";
    button.setAttribute("aria-label", "Toys, two players");
    button.addEventListener("click", () => ui.open());
    heading.append(button);
  }
  return ui;
}
