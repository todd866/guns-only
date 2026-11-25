#!/usr/bin/env python3
"""
Copy canonical recorded aircraft audio loops from web/wwwroot/render/audio/samples/
and synthesize clean 44.1 kHz 16-bit PCM mono WAV combat/warning cues into Assets/Audio/,
and convert web/wwwroot/art/*.webp cards into Assets/UI/*.png.
"""
import math
import os
import random
import shutil
import struct
import subprocess
import wave

REPO_ROOT = "/Users/iantodd/Projects/guns-only-rc-cache-release/.worktrees/ue5-native"
SAMPLES_DIR = os.path.join(REPO_ROOT, "web", "wwwroot", "render", "audio", "samples")
ART_DIR = os.path.join(REPO_ROOT, "web", "wwwroot", "art")
COBRA_VEG_DIR = os.path.join(REPO_ROOT, "content", "packs", "cobra-vietnam", "assets", "vegetation")
COBRA_FOLIAGE_ATLAS = os.path.join(REPO_ROOT, "content", "packs", "cobra-vietnam", "environment", "foliage", "foliage-atlas.png")

ASSETS_DIR = os.path.join(REPO_ROOT, "ue", "guns-only", "Assets")
AUDIO_OUT = os.path.join(ASSETS_DIR, "Audio")
UI_OUT = os.path.join(ASSETS_DIR, "UI")
TEX_OUT = os.path.join(ASSETS_DIR, "Textures")

SR = 44100


def write_wav_mono(path: str, samples: list[float]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        buf = bytearray(len(samples) * 2)
        for i, v in enumerate(samples):
            iv = max(-32767, min(32767, int(v * 32767.0)))
            struct.pack_into("<h", buf, i * 2, iv)
        wf.writeframes(buf)


def copy_canonical_samples() -> None:
    os.makedirs(AUDIO_OUT, exist_ok=True)
    copies = [
        ("jet/f22_idle_loop.wav", "SW_F22_Idle.wav"),
        ("jet/f22_mil_loop.wav", "SW_F22_Mil.wav"),
        ("jet/f22_grit_loop.wav", "SW_F22_Grit.wav"),
        ("jet/rapier_idle_cockpit_loop.wav", "SW_Rapier_Idle.wav"),
        ("jet/rapier_mil_cockpit_loop.wav", "SW_Rapier_Mil.wav"),
        ("jet/rapier_grit_cockpit_loop.wav", "SW_Rapier_Grit.wav"),
        ("jet/fa18_cockpit_f14_surrogate_loop.wav", "SW_F14_Engine.wav"),
        ("rotorcraft/uh1h_t53_ah1g_surrogate_loop.wav", "SW_Cobra_Rotor.wav"),
        ("turboprop/at802_family_cabin_loop.wav", "SW_FireBoss_Prop.wav"),
    ]
    for src_rel, dst_name in copies:
        src = os.path.join(SAMPLES_DIR, src_rel)
        dst = os.path.join(AUDIO_OUT, dst_name)
        if not os.path.exists(src):
            raise RuntimeError(f"Missing canonical audio sample: {src}")
        # Convert float/24-bit/48k WAVs cleanly to 16-bit PCM 44.1k mono for guaranteed UE5 import
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", str(SR), "-sample_fmt", "s16", dst],
            check=True,
        )
        print(f"Prepared audio: {dst_name}")


def gen_combat_cues() -> None:
    rng = random.Random(42)

    # 1. M61A2 Vulcan 100 Hz (6000 rpm) rotary cannon loop (0.6 s seamless loop)
    n = int(SR * 0.6)
    lp = 0.0
    vulcan = []
    for i in range(n):
        t = i / SR
        phase = (t * 100.0) % 1.0
        pulse = math.exp(-phase * 14.0)
        noise = rng.uniform(-1.0, 1.0)
        lp = lp * 0.72 + noise * 0.28
        raw = 0.52 * math.sin(2.0 * math.pi * 100.0 * t) + 0.35 * pulse * lp + 0.25 * math.sin(2.0 * math.pi * 300.0 * t)
        vulcan.append(max(-0.95, min(0.95, raw * 0.85)))
    write_wav_mono(os.path.join(AUDIO_OUT, "SW_Vulcan_Loop.wav"), vulcan)

    # 2. M134 Minigun 66 Hz rotary buzz loop (0.6 s)
    n = int(SR * 0.6)
    lp = 0.0
    minigun = []
    for i in range(n):
        t = i / SR
        phase = (t * 66.6667) % 1.0
        pulse = math.exp(-phase * 12.0)
        noise = rng.uniform(-1.0, 1.0)
        lp = lp * 0.68 + noise * 0.32
        raw = 0.48 * math.sin(2.0 * math.pi * 66.6667 * t) + 0.40 * pulse * lp
        minigun.append(max(-0.95, min(0.95, raw * 0.85)))
    write_wav_mono(os.path.join(AUDIO_OUT, "SW_Minigun_Loop.wav"), minigun)

    # 3. AIM-9 Sidewinder seeker growl (loop, 1.0 s) & lock tone (loop, 0.5 s)
    n_growl = SR
    growl = []
    for i in range(n_growl):
        t = i / SR
        lfo = 0.7 + 0.3 * math.sin(2.0 * math.pi * 12.0 * t)
        s = 0.4 * math.sin(2.0 * math.pi * 410.0 * t) + 0.25 * math.sin(2.0 * math.pi * 820.0 * t) + 0.12 * rng.uniform(-1.0, 1.0)
        growl.append(s * lfo * 0.45)
    write_wav_mono(os.path.join(AUDIO_OUT, "SW_AIM9_Growl.wav"), growl)

    n_lock = int(SR * 0.5)
    lock = []
    for i in range(n_lock):
        t = i / SR
        s = 0.55 * math.sin(2.0 * math.pi * 1420.0 * t) + 0.25 * math.sin(2.0 * math.pi * 2840.0 * t)
        lock.append(s * 0.50)
    write_wav_mono(os.path.join(AUDIO_OUT, "SW_AIM9_Lock.wav"), lock)

    # 4. Hydra-70 / Fox-2 launch whoosh (0.75 s)
    n_rk = int(SR * 0.75)
    lp = 0.0
    rk = []
    for i in range(n_rk):
        t = i / SR
        env = min(1.0, t / 0.03) * math.exp(-t * 3.8)
        lp = lp * 0.84 + rng.uniform(-1.0, 1.0) * 0.16
        s = 0.65 * lp + 0.35 * math.sin(2.0 * math.pi * (160.0 - 70.0 * t) * t)
        rk.append(s * env * 0.90)
    write_wav_mono(os.path.join(AUDIO_OUT, "SW_Rocket_Launch.wav"), rk)

    # 5. Explosion boom + crackle (1.4 s)
    n_exp = int(SR * 1.4)
    lp = 0.0
    exp_s = []
    for i in range(n_exp):
        t = i / SR
        env = min(1.0, t / 0.015) * math.exp(-t * 2.6)
        lp = lp * 0.91 + rng.uniform(-1.0, 1.0) * 0.09
        sub = math.sin(2.0 * math.pi * (58.0 * math.exp(-t * 1.8) + 28.0) * t)
        exp_s.append(max(-0.98, min(0.98, (0.72 * lp + 0.45 * sub) * env)))
    write_wav_mono(os.path.join(AUDIO_OUT, "SW_Explosion.wav"), exp_s)

    # 6. Metallic Hit Impact thud (0.22 s)
    n_hit = int(SR * 0.22)
    hit = []
    for i in range(n_hit):
        t = i / SR
        env = math.exp(-t * 22.0)
        s = 0.6 * math.sin(2.0 * math.pi * 640.0 * t) + 0.4 * rng.uniform(-1.0, 1.0)
        hit.append(s * env * 0.85)
    write_wav_mono(os.path.join(AUDIO_OUT, "SW_Hit_Impact.wav"), hit)

    # 7. Auto-GCAS / Terrain warning deedle-deedle (0.65 s)
    n_warn = int(SR * 0.65)
    warn = []
    for i in range(n_warn):
        t = i / SR
        env = min(1.0, t / 0.01) * (1.0 if t < 0.60 else max(0.0, (0.65 - t) / 0.05))
        freq = 920.0 if (int(t * 9.0) % 2 == 0) else 690.0
        warn.append(0.55 * math.sin(2.0 * math.pi * freq * t) * env)
    write_wav_mono(os.path.join(AUDIO_OUT, "SW_PullUp_Warn.wav"), warn)

    # 8. Water drop release whoosh (0.9 s)
    n_drop = int(SR * 0.9)
    lp = 0.0
    drop = []
    for i in range(n_drop):
        t = i / SR
        env = min(1.0, t / 0.06) * math.exp(-t * 2.2)
        lp = lp * 0.78 + rng.uniform(-1.0, 1.0) * 0.22
        drop.append(lp * env * 0.80)
    write_wav_mono(os.path.join(AUDIO_OUT, "SW_Water_Drop.wav"), drop)

    # 9. Carrier Wire Trap Clunk (0.45 s)
    n_wire = int(SR * 0.45)
    wire = []
    for i in range(n_wire):
        t = i / SR
        env = math.exp(-t * 8.5)
        s = 0.6 * math.sin(2.0 * math.pi * 110.0 * t) + 0.35 * rng.uniform(-1.0, 1.0) * math.exp(-t * 16.0)
        wire.append(s * env * 0.85)
    write_wav_mono(os.path.join(AUDIO_OUT, "SW_Wire_Trap.wav"), wire)
    print("Generated 9 synthesized WAV combat/warning cues.")


def convert_ui_and_foliage_textures() -> None:
    os.makedirs(UI_OUT, exist_ok=True)
    os.makedirs(TEX_OUT, exist_ok=True)
    cards = [
        ("jet-f22-generated-v4.webp", "T_Card_F22.png"),
        ("jet-cobra-generated-v4.webp", "T_Card_Cobra.png"),
        ("jet-rapier-hermeus-v1.webp", "T_Card_Rapier.png"),
        ("jet-f14.webp", "T_Card_F14.png"),
        ("aircraft-fireboss.webp", "T_Card_FireBoss.png"),
        ("menu-hangar.webp", "T_Card_Hangar.png"),
    ]
    for src_name, dst_name in cards:
        src = os.path.join(ART_DIR, src_name)
        dst = os.path.join(UI_OUT, dst_name)
        if not os.path.exists(src):
            raise RuntimeError(f"Missing art card: {src}")
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-vf", "scale=512:288:force_original_aspect_ratio=decrease", dst],
            check=True,
        )
        print(f"Converted card: {dst_name}")

    atlas_src = COBRA_FOLIAGE_ATLAS
    atlas_dst = os.path.join(TEX_OUT, "T_Cobra_Foliage_Atlas.png")
    if os.path.exists(atlas_src):
        shutil.copy2(atlas_src, atlas_dst)
        print("Copied T_Cobra_Foliage_Atlas.png")

    import json
    glb_extracts = [
        ("palm-cluster.glb", {"PalmTree_Trunk.png": "T_PalmTree_Trunk.png", "PalmTree_Leaves.png": "T_PalmTree_Leaves.png"}),
        ("plant-clumps.glb", {"Flowers.png": "T_Cobra_Plants.png"}),
    ]
    for glb_name, mapping in glb_extracts:
        glb_path = os.path.join(COBRA_VEG_DIR, glb_name)
        if not os.path.exists(glb_path):
            continue
        with open(glb_path, "rb") as f:
            data = f.read()
        jlen, _ = struct.unpack("<II", data[12:20])
        meta = json.loads(data[20:20 + jlen])
        bin_off = 20 + jlen
        blen, _ = struct.unpack("<II", data[bin_off:bin_off + 8])
        blob = data[bin_off + 8:bin_off + 8 + blen]
        for img in meta.get("images", []):
            out_name = mapping.get(img.get("name"))
            if not out_name:
                continue
            bv = meta["bufferViews"][img["bufferView"]]
            off = bv.get("byteOffset", 0)
            with open(os.path.join(TEX_OUT, out_name), "wb") as out_f:
                out_f.write(blob[off:off + bv["byteLength"]])
            print(f"Extracted {out_name} from {glb_name}")


if __name__ == "__main__":
    copy_canonical_samples()
    gen_combat_cues()
    convert_ui_and_foliage_textures()
