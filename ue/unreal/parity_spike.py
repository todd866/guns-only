"""Unreal parity spike: render the web RC game's reference views with Lumen.

Run inside the Unreal Editor (UE 5.x, Python Editor Script Plugin enabled), e.g.

  UnrealEditor-Cmd "<project>.uproject" -unattended -nosplash -RenderOffscreen \
      -ExecutePythonScript="<repo>/ue/unreal/parity_spike.py --repo <repo> --track housing"

What it does, in order (each step is idempotent, so a rerun resumes):
  1. Calibrate axes: writes a tiny GLB with three marker nodes at +X, +Y, +Z (metres, glTF
     convention, which is also three.js's: +Y up, right-handed), imports it as a scene, and reads
     back where Unreal put them. That gives the exact web->UE mapping instead of a guess.
  2. Imports the district GLB (web/wwwroot/rc/assets/districts/<track>.glb) and the buggy as a
     scene through Interchange, keeping node transforms. COL_* collision nodes are hidden.
  3. Builds the lighting the web game lacks: sun (atmosphere sun light), SkyAtmosphere,
     real-time SkyLight, VolumetricCloud, height fog, and an unbound post-process volume with
     Lumen GI and reflections. Project settings for Lumen/VSM live in DefaultEngine.ini (README).
  4. For each view in ue/views/<track>.json: places a camera at the same pose and FOV as the web
     camera, places the buggy at the car pose, and writes ue/renders/<track>-<view>.png at the
     same 1280x800, next to the web screenshot of the same name for a side-by-side.

Nothing here is tuned to look good yet; the point is an honest same-view comparison.
"""
import argparse
import threading
import traceback
import json
import math
import os
import struct
import sys

import unreal

TRACK_GLB = {
    'hub': 'web/wwwroot/rc/assets/districts/skatepark.glb',
    'housing': 'web/wwwroot/rc/assets/districts/housing.glb',
    'bx': 'web/wwwroot/rc/assets/districts/bx.glb',
    'school': 'web/wwwroot/rc/assets/districts/school.glb',
}
BUGGY_GLB = 'web/wwwroot/rc/assets/buggy.glb'
CM_PER_M = 100.0

actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)


def log(msg):
    unreal.log(f'[parity-spike] {msg}')


# ---------------------------------------------------------------- 1. axis calibration
def write_marker_glb(path):
    """Three 0.2 m cubes at (10,0,0), (0,10,0), (0,0,10) metres, glTF/three.js frame."""
    s = 0.1
    corners = [(x, y, z) for x in (-s, s) for y in (-s, s) for z in (-s, s)]
    idx = [0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3]
    pos = b''.join(struct.pack('<3f', *c) for c in corners)
    ind = b''.join(struct.pack('<H', i) for i in idx)
    ind += b'\0' * (-len(ind) % 4)
    blob = pos + ind
    doc = {
        'asset': {'version': '2.0'},
        'scene': 0,
        'scenes': [{'nodes': [0, 1, 2]}],
        'nodes': [
            {'name': 'MARK_X', 'mesh': 0, 'translation': [10, 0, 0]},
            {'name': 'MARK_Y', 'mesh': 0, 'translation': [0, 10, 0]},
            {'name': 'MARK_Z', 'mesh': 0, 'translation': [0, 0, 10]},
        ],
        'meshes': [{'primitives': [{'attributes': {'POSITION': 0}, 'indices': 1}]}],
        'buffers': [{'byteLength': len(blob)}],
        'bufferViews': [
            {'buffer': 0, 'byteOffset': 0, 'byteLength': len(pos)},
            {'buffer': 0, 'byteOffset': len(pos), 'byteLength': len(idx) * 2},
        ],
        'accessors': [
            {'bufferView': 0, 'componentType': 5126, 'count': 8, 'type': 'VEC3',
             'min': [-s, -s, -s], 'max': [s, s, s]},
            {'bufferView': 1, 'componentType': 5123, 'count': len(idx), 'type': 'SCALAR'},
        ],
    }
    js = json.dumps(doc).encode()
    js += b' ' * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    with open(path, 'wb') as fh:
        fh.write(struct.pack('<4sII', b'glTF', 2, total))
        fh.write(struct.pack('<I4s', len(js), b'JSON') + js)
        fh.write(struct.pack('<I4s', len(blob), b'BIN\0') + blob)


def import_scene(glb_path, content_path):
    """Import a glTF as a scene (actors with node transforms) into the current level."""
    manager = unreal.InterchangeManager.get_interchange_manager_scripted()
    source = unreal.InterchangeManager.create_source_data(glb_path)
    params = unreal.ImportAssetParameters()
    params.is_automated = True
    before = {a.get_path_name() for a in actors.get_all_level_actors()}
    manager.import_scene(content_path, source, params)
    return [a for a in actors.get_all_level_actors() if a.get_path_name() not in before]


def calibrate(tmp_dir):
    path = os.path.join(tmp_dir, 'axis-markers.glb')
    write_marker_glb(path)
    new = import_scene(path, '/Game/ParitySpike/Calibration')
    found = {}
    for a in new:
        label = a.get_actor_label()
        for axis in 'XYZ':
            if f'MARK_{axis}' in label:
                found[axis] = a.get_actor_location()
    if set(found) != set('XYZ'):
        raise RuntimeError(f'calibration markers not found among {[a.get_actor_label() for a in new]}')
    # Column j = where web axis j lands in UE, per metre.
    m = [[found[ax].x / 10.0, found[ax].y / 10.0, found[ax].z / 10.0] for ax in 'XYZ']
    for a in new:
        actors.destroy_actor(a)
    log(f'axis map (web X,Y,Z -> UE cm): {m}')
    return m


def web_to_ue(m, v):
    """Map a web (three.js, metres) vector into UE (cm) using the calibrated columns."""
    x, y, z = v
    return unreal.Vector(m[0][0] * x + m[1][0] * y + m[2][0] * z,
                         m[0][1] * x + m[1][1] * y + m[2][1] * z,
                         m[0][2] * x + m[1][2] * y + m[2][2] * z)


def quat_rotate(q, v):
    """Rotate v by three.js quaternion q = [x, y, z, w]."""
    qx, qy, qz, qw = q
    vx, vy, vz = v
    tx = 2 * (qy * vz - qz * vy)
    ty = 2 * (qz * vx - qx * vz)
    tz = 2 * (qx * vy - qy * vx)
    return (vx + qw * tx + (qy * tz - qz * ty),
            vy + qw * ty + (qz * tx - qx * tz),
            vz + qw * tz + (qx * ty - qy * tx))


def web_rotation_y_to_ue(m, yaw):
    """three.js rotation.y = yaw, expressed as a UE rotator via the calibrated axis map."""
    c, s = math.cos(yaw), math.sin(yaw)
    rot_web = lambda v: (c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2])

    def ue_to_web(v):  # M is a scaled signed permutation, so its inverse is M^T / |col|^2
        cols = [m[0], m[1], m[2]]
        return tuple(sum(cols[j][k] * v[k] for k in range(3)) / sum(x * x for x in cols[j]) for j in range(3))

    def image(e):
        w = rot_web(ue_to_web(e))
        u = web_to_ue(m, w)
        n = math.sqrt(u.x * u.x + u.y * u.y + u.z * u.z)
        return unreal.Vector(u.x / n, u.y / n, u.z / n)

    return unreal.MathLibrary.make_rot_from_xz(image((1, 0, 0)), image((0, 0, 1)))


def place_roots(m, new_actors, anchor_m, yaw):
    """Apply the web district placement (anchor in metres, yaw about +Y) to imported root actors."""
    placement = unreal.Transform(web_to_ue(m, [a * CM_PER_M for a in anchor_m]),
                                 web_rotation_y_to_ue(m, yaw), unreal.Vector(1, 1, 1))
    roots = [a for a in new_actors if a.get_attach_parent_actor() is None]
    for a in roots:
        a.set_actor_transform(unreal.MathLibrary.compose_transforms(a.get_actor_transform(), placement),
                              False, False)
    return len(roots)


# ---------------------------------------------------------------- 3. lighting
def build_lighting():
    spawned = []
    sun = actors.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 1000),
                                        unreal.Rotator(0, -38, 135))  # afternoon sun, warm
    comp = sun.get_component_by_class(unreal.DirectionalLightComponent)
    comp.set_editor_property('atmosphere_sun_light', True)
    comp.set_editor_property('intensity', 8.0)
    comp.set_editor_property('light_color', unreal.Color(255, 236, 210, 255))
    spawned.append(sun)
    spawned.append(actors.spawn_actor_from_class(unreal.SkyAtmosphere, unreal.Vector(0, 0, 0)))
    sky = actors.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 500))
    sky.get_component_by_class(unreal.SkyLightComponent).set_editor_property('real_time_capture', True)
    spawned.append(sky)
    spawned.append(actors.spawn_actor_from_class(unreal.VolumetricCloud, unreal.Vector(0, 0, 0)))
    spawned.append(actors.spawn_actor_from_class(unreal.ExponentialHeightFog, unreal.Vector(0, 0, 0)))
    ppv = actors.spawn_actor_from_class(unreal.PostProcessVolume, unreal.Vector(0, 0, 0))
    ppv.set_editor_property('unbound', True)
    spawned.append(ppv)
    return spawned


def hide_collision(new_actors):
    hidden = 0
    for a in new_actors:
        if a.get_actor_label().startswith('COL_'):
            a.set_actor_hidden_in_game(True)
            a.set_is_temporarily_hidden_in_editor(True)
            hidden += 1
    return hidden


# ---------------------------------------------------------------- 4. views
def place_camera(m, view, aspect):
    cam = view['camera']
    pos = web_to_ue(m, [c * CM_PER_M for c in cam['pos']])
    fwd = web_to_ue(m, quat_rotate(cam['quat'], (0, 0, -1)))   # three cameras look down -Z
    up = web_to_ue(m, quat_rotate(cam['quat'], (0, 1, 0)))
    rot = unreal.MathLibrary.make_rot_from_xz(fwd, up)
    actor = actors.spawn_actor_from_class(unreal.CameraActor, pos, rot)
    comp = actor.get_component_by_class(unreal.CameraComponent)
    # three.js fov is vertical; Unreal's is horizontal.
    hfov = math.degrees(2 * math.atan(math.tan(math.radians(cam['fov']) / 2) * aspect))
    comp.set_editor_property('field_of_view', hfov)
    comp.set_editor_property('aspect_ratio', aspect)
    comp.set_editor_property('constrain_aspect_ratio', True)
    return actor


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', required=True)
    ap.add_argument('--track', default='housing', choices=sorted(TRACK_GLB))
    args = ap.parse_args(argv)
    repo = os.path.abspath(args.repo)
    views = json.load(open(os.path.join(repo, 'ue', 'views', f'{args.track}.json')))
    out_dir = os.path.join(repo, 'ue', 'renders')
    os.makedirs(out_dir, exist_ok=True)
    tmp = os.path.join(unreal.Paths.project_saved_dir(), 'ParitySpike')
    os.makedirs(tmp, exist_ok=True)

    w, h = views['viewport']
    state = {'phase': 'wait', 'ticks': 0, 'handle': None, 'pending': None, 'queue': [], 'roots': [], 'm': None}

    def build():
        # Runs on a later editor tick: with -ExecCmds the script itself executes during startup,
        # and the editor then opens its startup map on top of anything built at frame 0.
        level_path = f'/Game/ParitySpike/{args.track}'
        if unreal.EditorAssetLibrary.does_asset_exist(level_path):
            # new_level() silently fails when the asset exists (run 4 built into Untitled_1).
            log(f'deleting stale level {level_path}: {unreal.EditorAssetLibrary.delete_asset(level_path)}')
        if not levels.new_level(level_path):
            raise RuntimeError(f'new_level({level_path}) failed')
        m = calibrate(tmp)
        district = import_scene(os.path.join(repo, TRACK_GLB[args.track]), f'/Game/ParitySpike/{args.track}')
        log(f'district actors: {len(district)}; collision hidden: {hide_collision(district)}')
        placed = views.get('district') or {'anchor': [0, 0, 0], 'yaw': 0}
        log(f"district roots placed: {place_roots(m, district, placed['anchor'], placed['yaw'])}")
        buggy = import_scene(os.path.join(repo, BUGGY_GLB), '/Game/ParitySpike/buggy')
        build_lighting()
        levels.save_current_level()
        state['m'] = m
        state['roots'] = [a for a in buggy if a.get_attach_parent_actor() is None]  # move roots only
        state['queue'] = list(views['views'])

    def pose(view):
        car, m = view['car'], state['m']
        # TODO(calibrate): the buggy's forward axis vs the web yaw is unverified; check the first
        # render against the web shot and fix the yaw offset here once.
        for b in state['roots']:
            b.set_actor_location(web_to_ue(m, [car['x'] * CM_PER_M, car['y'] * CM_PER_M, car['z'] * CM_PER_M]),
                                 False, False)
            b.set_actor_rotation(unreal.Rotator(0, 0, -math.degrees(car['yaw'])), False)
        cam = place_camera(m, view, w / h)
        return cam, os.path.join(out_dir, f"{args.track}-{view['name']}.png")

    def finish(code):
        unreal.unregister_slate_post_tick_callback(state['handle'])
        state['phase'] = 'finished'
        log(f'done (exit {code})')
        if os.environ.get('PARITY_KEEP_OPEN'):
            return
        levels.save_current_level()
        unreal.SystemLibrary.quit_editor()
        # The editor can hang on shutdown while shaders still compile; the stills are on disk.
        threading.Timer(90, lambda: os._exit(code)).start()

    # One screenshot at a time, driven by editor ticks: the request only renders on a later
    # frame, and several queued in one frame collapse into the last.
    def tick(_dt):
        if state.get('busy'):
            return  # take_high_res_screenshot and imports pump slate ticks synchronously; never re-enter
        state['busy'] = True
        state['ticks'] += 1
        try:
            if state['phase'] == 'wait':
                if state['ticks'] >= 30:
                    build()
                    state['phase'] = 'shoot'
                    state['ticks'] = 0
                return
            if state['phase'] != 'shoot':
                return
            if state['pending']:
                if os.path.exists(state['pending']):
                    log(f"wrote {state['pending']}")
                elif state['ticks'] < 900:
                    return
                else:
                    log(f"timed out waiting for {state['pending']}")
                state['pending'] = None
                state['ticks'] = 0
            if state['ticks'] < 10:
                return  # let the scene settle a few frames
            if not state['queue']:
                finish(0)
                return
            cam, name = pose(state['queue'].pop(0))
            state['pending'] = name
            state['ticks'] = 0
            log(f'queueing {name}')
            ok = unreal.AutomationLibrary.take_high_res_screenshot(w, h, name, camera=cam)
            log(f'queued {name}: {ok}')
        except Exception:
            log('callback failed:\n' + traceback.format_exc())
            finish(1)
        finally:
            state['busy'] = False

    state['handle'] = unreal.register_slate_post_tick_callback(tick)
    log('scheduled: build after 30 ticks, then one screenshot per settled frame; the editor quits when done')

if __name__ == '__main__':
    main(sys.argv[1:])
