#!/usr/bin/env python3
"""
Convert generated albedo textures to 1024x1024 seamless PNGs and derive tangent-space
DirectX normal maps (*_Normal.png, G=+V down for UE5) and calibrated roughness maps (*_Roughness.png).
Runs inside Blender 5.2.0 LTS Python (uses numpy + stdlib zlib, zero third-party deps).
"""
import os
import struct
import zlib
import numpy as np
import bpy

ARTIFACT_DIR = "/Users/iantodd/.gemini/antigravity/brain/5a13e2d1-ef89-456e-9dbd-a7b2f52e5623"
OUT_DIR = "/Users/iantodd/Projects/guns-only-rc-cache-release/.worktrees/ue5-native/ue/guns-only/Assets/Textures"

SPECS = [
    {
        "src": os.path.join(ARTIFACT_DIR, "t_ukraine_steppe_albedo_v3_1795474969008.jpg"),
        "base": "T_Ukraine_Steppe",
        "feather_seam": True,
        "normal_strength": 1.7,
        "rough_min": 0.62,
        "rough_max": 0.94,
        "invert_rough": True,
    },
    {
        "src": os.path.join(ARTIFACT_DIR, "t_ukraine_highland_albedo_v2_1795474958247.jpg"),
        "base": "T_Ukraine_Highland",
        "feather_seam": True,
        "normal_strength": 2.4,
        "rough_min": 0.56,
        "rough_max": 0.95,
        "invert_rough": True,
    },
    {
        "src": os.path.join(ARTIFACT_DIR, "t_runway_asphalt_albedo_final_1795474976942.jpg"),
        "base": "T_Runway_Asphalt",
        "feather_seam": False,
        "normal_strength": 2.8,
        "rough_min": 0.42,
        "rough_max": 0.88,
        "invert_rough": False,
    },
    {
        "src": os.path.join(ARTIFACT_DIR, "t_f22_ram_albedo_v2_1795474945687.jpg"),
        "base": "T_F22_RAM",
        "feather_seam": False,
        "normal_strength": 2.2,
        "rough_min": 0.26,
        "rough_max": 0.62,
        "invert_rough": False,
    },
    {
        "src": os.path.join(ARTIFACT_DIR, "t_su27_splinter_albedo_1795474932381.jpg"),
        "base": "T_Su27_Splinter",
        "feather_seam": False,
        "normal_strength": 2.0,
        "rough_min": 0.30,
        "rough_max": 0.68,
        "invert_rough": False,
    },
    {
        "src": os.path.join(ARTIFACT_DIR, "t_cobra_jungle_albedo_1795479392424.jpg"),
        "base": "T_Cobra_Jungle",
        "feather_seam": True,
        "normal_strength": 2.0,
        "rough_min": 0.62,
        "rough_max": 0.94,
        "invert_rough": True,
    },
    {
        "src": os.path.join(ARTIFACT_DIR, "t_ah1g_olivedrab_albedo_1795479393303.jpg"),
        "base": "T_AH1G_OliveDrab",
        "feather_seam": False,
        "normal_strength": 2.1,
        "rough_min": 0.36,
        "rough_max": 0.72,
        "invert_rough": False,
    },
]

EMISSIVE_ONLY = (
    os.path.join(ARTIFACT_DIR, "t_cockpit_mfd_emissive_v2_1795474964098.jpg"),
    "T_Cockpit_MFD_Emissive.png",
)


def write_png_rgb(path: str, rgb_uint8: np.ndarray) -> None:
    """Write top-to-bottom uint8 RGB array (H, W, 3) cleanly with exact bytes (no color transform)."""
    h, w, c = rgb_uint8.shape
    assert c == 3
    raw_rows = b"".join(b"\x00" + rgb_uint8[y].tobytes() for y in range(h))

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack("!I", len(data)) + tag + data + struct.pack("!I", crc)

    ihdr = struct.pack("!IIBBBBB", w, h, 8, 2, 0, 0, 0)
    png_bytes = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw_rows, level=6))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png_bytes)


def load_resized_srgb(src_path: str, size: int = 1024) -> np.ndarray:
    """Load JPEG via Blender, scale to 1024x1024, return top-down float32 [0..1] RGB in sRGB."""
    img = bpy.data.images.load(src_path, check_existing=False)
    img.colorspace_settings.name = "Non-Color"  # read encoded JPEG values directly without linearize
    if img.size[0] != size or img.size[1] != size:
        img.scale(size, size)
    buf = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    bpy.data.images.remove(img)
    # Blender pixel rows run bottom-to-top; flip vertically for top-down image coords
    arr = buf.reshape((size, size, 4))[::-1, :, :3].copy()
    return np.clip(arr, 0.0, 1.0)


def feather_border_seamless(rgb: np.ndarray, band: int = 72) -> np.ndarray:
    """Blend outer border ring smoothly toward half-shifted interior so 4 borders wrap seamlessly."""
    h, w, _ = rgb.shape
    dx = np.minimum(np.arange(w, dtype=np.float32), (w - 1) - np.arange(w, dtype=np.float32))
    dy = np.minimum(np.arange(h, dtype=np.float32), (h - 1) - np.arange(h, dtype=np.float32))
    wx = np.where(dx < band, 0.5 * (1.0 + np.cos(np.pi * dx / float(band))), 0.0)
    wy = np.where(dy < band, 0.5 * (1.0 + np.cos(np.pi * dy / float(band))), 0.0)
    mask = np.maximum(wy[:, None], wx[None, :])[:, :, None]
    rolled = np.roll(np.roll(rgb, h // 2, axis=0), w // 2, axis=1)
    return np.clip(rgb * (1.0 - mask) + rolled * mask, 0.0, 1.0)


def derive_normal_and_roughness(
    rgb: np.ndarray,
    strength: float,
    rough_min: float,
    rough_max: float,
    invert_rough: bool,
):
    """Compute wraparound Sobel DirectX normal map (+Y down) and calibrated roughness map."""
    lum = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]

    # Periodic Sobel kernel in top-down coordinates (x right, y down)
    lm = np.roll(lum, 1, axis=1)
    lp = np.roll(lum, -1, axis=1)
    gx = (
        (np.roll(lp, 1, axis=0) + 2.0 * lp + np.roll(lp, -1, axis=0))
        - (np.roll(lm, 1, axis=0) + 2.0 * lm + np.roll(lm, -1, axis=0))
    ) * 0.25

    tm = np.roll(lum, 1, axis=0)   # y - 1 (up)
    bp = np.roll(lum, -1, axis=0)  # y + 1 (down)
    gy = (
        (np.roll(bp, 1, axis=1) + 2.0 * bp + np.roll(bp, -1, axis=1))
        - (np.roll(tm, 1, axis=1) + 2.0 * tm + np.roll(tm, -1, axis=1))
    ) * 0.25

    # DirectX tangent space: +X = right (+u), +Y = down (+v)
    nx = -strength * gx
    ny = -strength * gy
    nz = np.ones_like(lum)
    inv_len = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack([0.5 + 0.5 * nx * inv_len, 0.5 + 0.5 * ny * inv_len, 0.5 + 0.5 * nz * inv_len], axis=-1)
    normal_u8 = np.clip(np.round(normal * 255.0), 0, 255).astype(np.uint8)

    # Calibrated roughness + micro-variation from local gradient magnitude
    grad_mag = np.clip(np.sqrt(gx * gx + gy * gy) * 3.0, 0.0, 1.0)
    t_val = (1.0 - lum) if invert_rough else lum
    rough = rough_min + (rough_max - rough_min) * np.clip(t_val * 0.85 + grad_mag * 0.15, 0.0, 1.0)
    rough_u8_1c = np.clip(np.round(rough * 255.0), 0, 255).astype(np.uint8)
    rough_u8 = np.repeat(rough_u8_1c[:, :, None], 3, axis=-1)
    return normal_u8, rough_u8


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for spec in SPECS:
        rgb = load_resized_srgb(spec["src"], 1024)
        if spec["feather_seam"]:
            rgb = feather_border_seamless(rgb, band=56)
        albedo_u8 = np.clip(np.round(rgb * 255.0), 0, 255).astype(np.uint8)
        normal_u8, rough_u8 = derive_normal_and_roughness(
            rgb,
            spec["normal_strength"],
            spec["rough_min"],
            spec["rough_max"],
            spec["invert_rough"],
        )

        p_alb = os.path.join(OUT_DIR, f"{spec['base']}_Albedo.png")
        p_nrm = os.path.join(OUT_DIR, f"{spec['base']}_Normal.png")
        p_rgh = os.path.join(OUT_DIR, f"{spec['base']}_Roughness.png")
        write_png_rgb(p_alb, albedo_u8)
        write_png_rgb(p_nrm, normal_u8)
        write_png_rgb(p_rgh, rough_u8)
        print(f"Wrote {spec['base']}: Albedo, Normal (mean B={normal_u8[:,:,2].mean():.1f}), Roughness (mean={rough_u8[:,:,0].mean():.1f})")

    mfd_rgb = load_resized_srgb(EMISSIVE_ONLY[0], 1024)
    mfd_u8 = np.clip(np.round(mfd_rgb * 255.0), 0, 255).astype(np.uint8)
    write_png_rgb(os.path.join(OUT_DIR, EMISSIVE_ONLY[1]), mfd_u8)
    print(f"Wrote {EMISSIVE_ONLY[1]}")


if __name__ == "__main__":
    main()
