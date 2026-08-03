import test from "node:test";
import assert from "node:assert/strict";
import {
  COBRA_GROUND_WAR_PRESENTATION_SCHEMA,
  createCobraGroundWarPresentation,
} from "../cobra_ground_war.js";

function fakeThree() {
  class Color {
    constructor(hex) { this.hex = hex; }
    setHex(hex) { this.hex = hex; return this; }
  }
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  }
  class Object3D {
    constructor() {
      this.children = [];
      this.position = new Vector3();
      this.scale = { setScalar(value) { this.value = value; } };
      this.visible = true;
      this.userData = {};
      this.parent = null;
    }
    add(...objects) {
      for (const object of objects) {
        object.parent = this;
        this.children.push(object);
      }
      return this;
    }
    remove(...objects) {
      for (const object of objects) {
        this.children = this.children.filter((child) => child !== object);
        object.parent = null;
      }
      return this;
    }
    removeFromParent() {
      this.parent?.remove(this);
    }
  }
  class Group extends Object3D {}
  class Mesh extends Object3D {
    constructor(geometry, material) {
      super();
      this.geometry = geometry;
      this.material = material;
    }
  }
  class Line extends Mesh {}
  class BoxGeometry {
    dispose() {}
  }
  class CylinderGeometry {
    dispose() {}
  }
  class SphereGeometry {
    dispose() {}
  }
  class BufferGeometry {
    constructor() { this.attributes = {}; }
    setAttribute(name, attribute) { this.attributes[name] = attribute; }
    dispose() {}
  }
  class BufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
    }
  }
  class MeshStandardMaterial {
    constructor(params = {}) {
      Object.assign(this, params);
      this.color = new Color(params.color ?? 0xffffff);
    }
    dispose() {}
  }
  class LineBasicMaterial extends MeshStandardMaterial {}
  return {
    Group,
    Mesh,
    Line,
    BoxGeometry,
    CylinderGeometry,
    SphereGeometry,
    BufferGeometry,
    BufferAttribute,
    MeshStandardMaterial,
    LineBasicMaterial,
  };
}

test("ground war presentation schema and sync create faction markers from snapshot", () => {
  const presentation = createCobraGroundWarPresentation(fakeThree());
  assert.equal(presentation.group.userData.schema, COBRA_GROUND_WAR_PRESENTATION_SCHEMA);

  presentation.sync({
    control: 0.2,
    sites: [{
      id: "site.iron-bell-bridge.v1",
      landmark_id: "landmark.cobra-canyon.iron-bell-bridge.v1",
      label: "Iron Bell Bridge",
      local_control: 0.4,
      x_m: 0,
      y_m: 100,
      z_m: 0,
      capture_radius_m: 220,
    }],
    units: [{
      id: "ground.hostile.infantryclump.001",
      faction: "hostile",
      role: "infantry",
      alive: true,
      health: 40,
      max_health: 40,
      x_m: 10,
      y_m: 101,
      z_m: -20,
      home_site_id: "site.iron-bell-bridge.v1",
    }, {
      id: "ground.friendly.softvehicle.002",
      faction: "friendly",
      role: "soft-vehicle",
      alive: true,
      health: 80,
      max_health: 90,
      x_m: -12,
      y_m: 101,
      z_m: 8,
      home_site_id: "site.iron-bell-bridge.v1",
    }],
    events: [{
      kind: "gun-kill",
      faction: "hostile",
      x_m: 10,
      y_m: 101,
      z_m: -20,
    }],
  });

  const unitRoot = presentation.group.children.find((child) => child.name === "COBRA_GROUND_WAR_UNITS");
  const siteRoot = presentation.group.children.find((child) => child.name === "COBRA_GROUND_WAR_SITES");
  assert.equal(unitRoot.children.length, 2);
  assert.equal(siteRoot.children.length, 1);
  presentation.dispose();
  assert.equal(unitRoot.children.length, 0);
});
