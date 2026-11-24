#!/usr/bin/env python3
"""Generate seamlessly horizontally-tileable, volumetric domain-warped Xianxia
ethereal cloud veils (vân mây huyền ảo tu tiên) matched to the warm dawn-gold &
cool misty-pearl atmosphere of Vân Hải Tiên Cung:
  1. assets/cloud-veil-mist.webp  — billowing swirling pearl-silver & jade mist clouds
  2. assets/cloud-veil-gold.webp  — warm golden-sunrise backlit celestial cloud tendrils"""
from pathlib import Path
import numpy as np
from PIL import Image

ASSETS_DIR = Path('/root/van-thien-cac/assets/scenes')


def periodic_fbm(xx, yy, seed, octaves):
    rng = np.random.default_rng(seed)
    out = np.zeros_like(xx, dtype=np.float32)
    for fx, fy, amp in octaves:
        for _ in range(3):
            kx = int(rng.integers(max(1, fx // 2), fx + 1)) * int(rng.choice([-1, 1]))
            ky = int(rng.integers(max(1, fy // 2), fy + 1)) * int(rng.choice([-1, 1]))
            ph = float(rng.uniform(0, 2 * np.pi))
            out += (amp / 3.0) * np.cos(kx * xx + ky * yy + ph)
    out -= out.min()
    out /= (out.max() + 1e-6)
    return out


def domain_warped_cloud(w, h, seed_base):
    """Create swirling, layered ink-wash & volumetric xianxia cloud eddies (vân mây cuộn)."""
    x = np.linspace(0, 2 * np.pi, w, endpoint=False, dtype=np.float32)[None, :]
    y = np.linspace(0, 2 * np.pi, h, endpoint=False, dtype=np.float32)[:, None]
    xx = np.broadcast_to(x, (h, w))
    yy = np.broadcast_to(y, (h, w))

    wx1 = periodic_fbm(xx, yy, seed_base + 1, ((2, 1, 0.55), (4, 2, 0.30), (8, 4, 0.15))) - 0.5
    wy1 = periodic_fbm(xx, yy, seed_base + 2, ((2, 2, 0.55), (5, 3, 0.30), (9, 5, 0.15))) - 0.5

    xx2 = xx + 1.65 * wx1
    yy2 = yy + 1.35 * wy1
    wx2 = periodic_fbm(xx2, yy2, seed_base + 3, ((3, 2, 0.50), (7, 4, 0.32), (14, 8, 0.18))) - 0.5
    wy2 = periodic_fbm(xx2, yy2, seed_base + 4, ((4, 2, 0.50), (8, 5, 0.32), (16, 9, 0.18))) - 0.5

    xx3 = xx2 + 0.95 * wx2
    yy3 = yy2 + 0.78 * wy2
    density = periodic_fbm(
        xx3, yy3, seed_base + 5,
        ((2, 1, 0.32), (4, 2, 0.28), (9, 5, 0.24), (18, 10, 0.16))
    )

    # Volumetric ridge lighting: sunlit upper edges + silky curled wisps
    crest = np.clip((density - 0.38) / 0.54, 0.0, 1.0) ** 1.35
    wisps = np.clip((density - 0.28) / 0.68, 0.0, 1.0) ** 1.55

    # Smooth vertical feather envelope so top and bottom edges dissolve seamlessly into air
    yv = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
    v_env = np.clip(np.sin(np.pi * yv), 0.0, 1.0) ** 1.25
    return wisps * v_env, crest * v_env


def save_cloud_webp(path, rgb, alpha):
    rgba = np.zeros((alpha.shape[0], alpha.shape[1], 4), dtype=np.uint8)
    rgba[:, :, :3] = np.clip(rgb * 255.0 + 0.5, 0, 255).astype(np.uint8)
    rgba[:, :, 3] = np.clip(alpha * 255.0 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(rgba, mode='RGBA').save(path, format='WEBP', quality=88, method=6)
    kb = path.stat().st_size / 1024
    print(f'Saved {path} ({kb:.1f} KB)')


def main():
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    W, H = 1440, 440

    # 1. Silvery-pearl & soft celadon-mist swirling cloud veil (vân vụ tiên cảnh)
    wisps1, crest1 = domain_warped_cloud(W, H, seed_base=101)
    cool_col = np.array([0.78, 0.87, 0.93], dtype=np.float32)[None, None, :]
    pearl_col = np.array([0.98, 0.97, 0.95], dtype=np.float32)[None, None, :]
    rgb1 = cool_col * (1.0 - crest1[..., None]) + pearl_col * crest1[..., None]
    alpha1 = np.clip(wisps1 * 0.82, 0.0, 0.85)
    save_cloud_webp(ASSETS_DIR / 'cloud-veil-mist.webp', rgb1, alpha1)

    # 2. Golden-dawn backlit ethereal celestial cloud tendrils (tường vân ánh bình minh)
    wisps2, crest2 = domain_warped_cloud(W, H, seed_base=307)
    mist_warm = np.array([0.95, 0.85, 0.68], dtype=np.float32)[None, None, :]
    gold_rim = np.array([1.00, 0.94, 0.78], dtype=np.float32)[None, None, :]
    rgb2 = mist_warm * (1.0 - crest2[..., None]) + gold_rim * crest2[..., None]
    alpha2 = np.clip(wisps2 * 0.74, 0.0, 0.78)
    save_cloud_webp(ASSETS_DIR / 'cloud-veil-gold.webp', rgb2, alpha2)


if __name__ == '__main__':
    main()
