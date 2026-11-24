#!/usr/bin/env python3
"""Render a seamless 16:9 looping photorealistic Chinese xianxia Animated WebP
(Vân Hải Tiên Cung) with 100% artifact-free continuously pouring waterfalls
(clamped local 3-phase advection on water-only fill + continuous periodic vertical
foam/trough ribbons) and rising plunge spray.

Why Animated WebP (CSS background-image) instead of <video>:
- Immune to iOS in-app WKWebView (Zalo/Telegram/Messenger) forcing native QuickTime
  fullscreen playback or rendering the grey play triangle over the page.
- Autoplays seamlessly everywhere (including iOS Low Power Mode) with zero JS.
- Non-waterfall pixels stay bit-identical to Frame 0 so WebP inter-frame delta
  compression keeps the file lightweight while preserving native HD crispness.
"""
from pathlib import Path
import subprocess
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC_IMAGE = Path('/root/.gemini/antigravity-cli/brain/662c537e-c82b-41f7-9d03-7f6d019da7e2/van_hai_tien_cung_1795296320609.jpg')
ASSETS_DIR = Path('/root/van-thien-cac/assets/scenes')
OUT_ANIM_WEBP = ASSETS_DIR / 'tien-gioi-real-loop.webp'
OUT_STATIC_WEBP = ASSETS_DIR / 'tien-gioi-real.webp'

W, H = 1280, 720
FPS = 15
DURATION = 3
FRAMES = FPS * DURATION  # 45 seamless frames (~66.7ms/frame)


def make_tileable_fbm(w, h, seed, octaves=((3, 2, 0.50), (6, 4, 0.28), (12, 8, 0.14), (24, 14, 0.08))):
    rng = np.random.default_rng(seed)
    yy = np.linspace(0, 2 * np.pi, h, endpoint=False, dtype=np.float32)[:, None]
    xx = np.linspace(0, 2 * np.pi, w, endpoint=False, dtype=np.float32)[None, :]
    field = np.zeros((h, w), dtype=np.float32)
    for fx, fy, amp in octaves:
        for _ in range(3):
            kx = int(rng.integers(max(1, fx // 2), fx + 1)) * int(rng.choice([-1, 1]))
            ky = int(rng.integers(max(1, fy // 2), fy + 1)) * int(rng.choice([-1, 1]))
            ph = float(rng.uniform(0, 2 * np.pi))
            field += (amp / 3.0) * np.cos(kx * xx + ky * yy + ph)
    field -= field.min()
    field /= (field.max() + 1e-6)
    return field


def blur_mask(arr, radius):
    im = Image.fromarray(np.clip(arr * 255.0, 0, 255).astype(np.uint8), mode='L')
    im = im.filter(ImageFilter.GaussianBlur(radius=radius))
    return np.asarray(im, dtype=np.float32) / 255.0


def poly_mask(polys, feather=4.0):
    im = Image.new('L', (W, H), 0)
    draw = ImageDraw.Draw(im)
    for pts in polys:
        draw.polygon([(x * W, y * H) for x, y in pts], fill=255)
    if feather > 0:
        im = im.filter(ImageFilter.GaussianBlur(radius=feather))
    return np.asarray(im, dtype=np.float32) / 255.0


def shift_vertical_clamped(arr, dy):
    """Shift image DOWNWARD by dy >= 0 pixels (sampling y - dy) with edge clamping, NEVER wrapping."""
    h = arr.shape[0]
    i0 = int(np.floor(dy))
    frac = float(dy - i0)
    y_idx = np.arange(h, dtype=np.int32)
    idx0 = np.clip(y_idx - i0, 0, h - 1)
    idx1 = np.clip(y_idx - (i0 + 1), 0, h - 1)
    if frac <= 1e-5:
        return arr[idx0]
    return arr[idx0] * (1.0 - frac) + arr[idx1] * frac


def main():
    if not SRC_IMAGE.is_file():
        print(f'ERROR: Missing {SRC_IMAGE}', file=sys.stderr)
        sys.exit(1)

    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    raw = Image.open(SRC_IMAGE).convert('RGB')
    rw, rh = raw.size
    target_w = int(round(rh * 16 / 9))
    if target_w < rw:
        left = (rw - target_w) // 2
        raw = raw.crop((left, 0, left + target_w, rh))
    base_im = raw.resize((W, H), Image.Resampling.LANCZOS)
    base_im.save(OUT_STATIC_WEBP, format='WEBP', quality=90, method=6)
    print(f'Saved static 16:9 fallback: {OUT_STATIC_WEBP} ({OUT_STATIC_WEBP.stat().st_size / 1024:.1f} KB)')

    base_u8 = np.asarray(base_im, dtype=np.uint8)
    base = base_u8.astype(np.float32) / 255.0
    lum = 0.299 * base[:, :, 0] + 0.587 * base[:, :, 1] + 0.114 * base[:, :, 2]
    sat = np.max(base, axis=2) - np.min(base, axis=2)

    xg = np.linspace(0.0, 1.0, W, dtype=np.float32)[None, :]
    yg = np.linspace(0.0, 1.0, H, dtype=np.float32)[:, None]

    # --- 1. Exact Solid Architecture Exclusion Masks (100% razor-sharp bridge, pillars, palace, cliffs) ---
    bridge_and_pillars = poly_mask([
        [(0.0, 0.76), (0.14, 0.71), (0.31, 0.65), (0.45, 0.630), (0.575, 0.648),
         (0.580, 0.72), (0.560, 1.00), (0.0, 1.00)],
        [(0.40, 0.66), (0.56, 0.66), (0.56, 1.00), (0.40, 1.00)],
    ], feather=4.0)

    palace_solid = poly_mask([
        [(0.54, 0.05), (0.95, 0.05), (0.95, 0.37), (0.54, 0.37)],
        [(0.41, 0.17), (0.54, 0.17), (0.54, 0.45), (0.41, 0.45)],
    ], feather=4.0)

    # --- 2. Precise Masks for ONLY the 4 REAL Waterfalls in van_hai_tien_cung ---
    wf_zones = poly_mask([
        # WF1: Left-center cataract behind rainbow arch
        [(0.520, 0.40), (0.596, 0.39), (0.592, 0.67), (0.506, 0.66)],
        # WF2: Main central bright twin cataract under grand palace steps
        [(0.602, 0.39), (0.688, 0.395), (0.684, 0.69), (0.596, 0.69)],
        # WF3: Right canyon cascade under right palace terrace
        [(0.732, 0.36), (0.850, 0.34), (0.848, 0.68), (0.725, 0.68)],
        # WF4a: Foreground right cliff upper stream
        [(0.945, 0.51), (1.000, 0.51), (1.000, 0.72), (0.930, 0.72)],
        # WF4b: Foreground right cliff lower wide plunge
        [(0.860, 0.72), (1.000, 0.72), (1.000, 1.00), (0.830, 1.00)],
    ], feather=5.0)

    # Restrict strictly to actual bright white/silver water & foam (protects dark cliffs & pine trees!)
    water_sig = np.clip((lum - 0.38) / 0.28, 0.0, 1.0) * np.clip((0.36 - sat) / 0.22, 0.25, 1.0)
    wf_mask = blur_mask(
        np.clip(wf_zones * water_sig * (1.0 - bridge_and_pillars) * (1.0 - palace_solid), 0.0, 1.0),
        radius=1.8,
    )
    wf_rows = np.where(wf_mask.max(axis=1) > 0.005)[0]
    wf_cols = np.where(wf_mask.max(axis=0) > 0.005)[0]
    y0_wf, y1_wf = int(wf_rows[0]), int(wf_rows[-1]) + 1
    x0_wf, x1_wf = int(wf_cols[0]), int(wf_cols[-1]) + 1
    h_wf, w_wf = y1_wf - y0_wf, x1_wf - x0_wf
    print(f'Real waterfall mask max={wf_mask.max():.2f}, box=({x0_wf}..{x1_wf}, {y0_wf}..{y1_wf})')

    # Build a water-only source patch so local downward advection NEVER pulls dark cliff/roof pixels into water!
    wf_sub_mask = wf_mask[y0_wf:y1_wf, x0_wf:x1_wf, None]
    base_wf_sub = base[y0_wf:y1_wf, x0_wf:x1_wf]
    water_neutral = np.array([0.82, 0.87, 0.90], dtype=np.float32)[None, None, :]
    # Soft water-tinted replacement wherever wf_sub_mask is low
    wf_clean_sub = base_wf_sub * np.clip(wf_sub_mask * 1.4, 0.0, 1.0) + water_neutral * (1.0 - np.clip(wf_sub_mask * 1.4, 0.0, 1.0))

    # Periodic tileable vertical waterfall ribbon noise fields (seamless vertical wrap ONLY on noise!)
    # Tile heights chosen so 3s seamless loop matches exact physical pouring velocities:
    #   main = 720px / 3s = 240 px/s, fast = 3*360px / 3s = 360 px/s, surge = 360px / 3s = 120 px/s
    h_half = H // 2
    ribbon_main = make_tileable_fbm(
        w_wf, H, seed=77,
        octaves=((18, 3, 0.36), (36, 6, 0.30), (68, 12, 0.20), (108, 20, 0.14))
    )
    ribbon_main_signed = (ribbon_main - 0.50) * 2.0

    ribbon_fast_tile = make_tileable_fbm(
        w_wf, h_half, seed=131,
        octaves=((32, 2, 0.35), (64, 5, 0.35), (112, 9, 0.30))
    )
    ribbon_fast_crest = np.clip((ribbon_fast_tile - 0.46) * 2.5, 0.0, 1.0) ** 1.25

    surge_tile = make_tileable_fbm(
        w_wf, h_half, seed=219,
        octaves=((8, 2, 0.45), (18, 4, 0.35), (34, 7, 0.20))
    )
    surge_signed = (surge_tile - 0.50) * 2.0

    # --- 3. Localized Rising Waterfall Plunge Mist (zero changes outside waterfall/plunge zone!) ---
    # Keeping the palace, bridge, sky, trees, and cliffs bit-identical to Frame 0 lets WebP
    # inter-frame delta compression shrink frames 1..N-1 to only the pouring water region.
    plunge_mist = (
        0.75 * np.exp(-0.5 * (((xg - 0.55) / 0.062) ** 2 + ((yg - 0.66) / 0.052) ** 2))
        + 1.00 * np.exp(-0.5 * (((xg - 0.64) / 0.088) ** 2 + ((yg - 0.69) / 0.060) ** 2))
        + 0.85 * np.exp(-0.5 * (((xg - 0.78) / 0.075) ** 2 + ((yg - 0.68) / 0.055) ** 2))
        + 0.75 * np.exp(-0.5 * (((xg - 0.90) / 0.072) ** 2 + ((yg - 0.94) / 0.060) ** 2))
    )
    plunge_mist = np.clip(plunge_mist * (1.0 - bridge_and_pillars), 0.0, 1.0)
    # Hard-zero tiny Gaussian tails (<0.025) so non-plunge pixels stay 100% untouched
    plunge_mist = np.where(plunge_mist >= 0.025, np.clip((plunge_mist - 0.025) / 0.975, 0.0, 1.0), 0.0)

    # Combined active animation bounding box for fast, exact bit-identical static background
    active_mask = (wf_mask > 0.004) | (plunge_mist > 0.004)
    a_rows = np.where(active_mask.any(axis=1))[0]
    a_cols = np.where(active_mask.any(axis=0))[0]
    ya0, ya1 = int(a_rows[0]), int(a_rows[-1]) + 1
    xa0, xa1 = int(a_cols[0]), int(a_cols[-1]) + 1
    ha, wa = ya1 - ya0, xa1 - xa0
    print(f'Active animation box=({xa0}..{xa1}, {ya0}..{ya1}) -> {wa}x{ha} ({100.0 * wa * ha / (W * H):.1f}% of frame)')

    mist_up_tile = make_tileable_fbm(
        wa, h_half, seed=409,
        octaves=((3, 2, 0.42), (6, 4, 0.34), (12, 7, 0.24))
    )
    plunge_sub = plunge_mist[ya0:ya1, xa0:xa1, None]

    mist_cool_col = np.array([0.86, 0.93, 0.98], dtype=np.float32)
    trough_tint = np.array([0.66, 0.80, 0.88], dtype=np.float32)
    foam_col = np.array([0.99, 1.00, 1.00], dtype=np.float32)

    cmd = [
        'ffmpeg', '-y', '-loglevel', 'error',
        '-f', 'rawvideo', '-vcodec', 'rawvideo',
        '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
        '-i', '-',
        '-c:v', 'libwebp_anim',
        '-lossless', '0',
        '-compression_level', '5',
        '-q:v', '78',
        '-preset', 'picture',
        '-loop', '0',
        str(OUT_ANIM_WEBP),
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    print(f'Rendering {FRAMES} seamless Animated WebP frames ({W}x{H} @ {FPS}fps, {DURATION}s)...')
    # Helper indices to wrap half-height periodic tiles cleanly into waterfall/plunge heights
    wf_y_idx = np.arange(y0_wf, y1_wf, dtype=np.int32)
    pl_y_idx = np.arange(ya0, ya1, dtype=np.int32)

    for f in range(FRAMES):
        t = f / FRAMES

        frame_u8 = base_u8.copy()
        patch = base[ya0:ya1, xa0:xa1].copy()

        # --- A. All 4 REAL waterfalls POURING CONTINUOUSLY DOWNWARD (zero ghosting, zero seam!) ---
        wf_cycles = 3.0  # 1 cycle/sec over 3s loop
        wf_dist = 24.0
        wf_flow = np.zeros((h_wf, w_wf, 3), dtype=np.float32)
        for k in range(3):
            pk = (t * wf_cycles + k / 3.0) % 1.0
            wk = (0.5 - 0.5 * np.cos(2.0 * np.pi * pk)) / 1.5
            sk = shift_vertical_clamped(wf_clean_sub, pk * wf_dist)
            wf_flow += sk * wk

        # Continuous non-fading vertical foam & water-trough ribbons (exact periodic wrap!)
        shift_main = int(round(t * H)) % H
        shift_fast = int(round(t * 3.0 * h_half)) % h_half
        shift_surge = int(round(t * h_half)) % h_half

        r_main = ribbon_main_signed[(wf_y_idx - shift_main) % H, :][:, :, None]
        r_fast = ribbon_fast_crest[(wf_y_idx - shift_fast) % h_half, :][:, :, None]
        r_surge = surge_signed[(wf_y_idx - shift_surge) % h_half, :][:, :, None]

        trough_amt = np.clip(-r_main * 0.34 - r_surge * 0.14, 0.0, 0.42)
        crest_amt = np.clip(r_main * 0.28 + r_fast * 0.48 + np.clip(r_surge, 0.0, 1.0) * 0.18, 0.0, 0.65)

        wf_comp = wf_flow * (1.0 - trough_amt * (1.0 - trough_tint[None, None, :]))
        wf_comp = wf_comp + (1.0 - wf_comp) * crest_amt * foam_col[None, None, :]
        wf_comp = np.clip(wf_comp + r_fast * 0.08, 0.0, 1.0)

        # Write waterfall blend into active patch
        wy0, wy1 = y0_wf - ya0, y1_wf - ya0
        wx0, wx1 = x0_wf - xa0, x1_wf - xa0
        patch[wy0:wy1, wx0:wx1] = (
            patch[wy0:wy1, wx0:wx1] * (1.0 - wf_sub_mask)
            + wf_comp * wf_sub_mask
        )

        # --- B. Continuous rising plunge spray at waterfall bases ---
        sy_up = int(round(t * 2.0 * h_half)) % h_half
        sx_up = int(round(t * wa)) % wa
        m_up = np.roll(mist_up_tile[(pl_y_idx + sy_up) % h_half, :], sx_up, axis=1)[..., None]
        spray_alpha = plunge_sub * m_up * 0.34
        patch = patch + (1.0 - patch) * (spray_alpha * mist_cool_col[None, None, :])

        # Replace ONLY pixels inside active_mask so static background stays bit-identical
        patch_u8 = np.clip(patch * 255.0 + 0.5, 0, 255).astype(np.uint8)
        sub_active = active_mask[ya0:ya1, xa0:xa1, None]
        frame_u8[ya0:ya1, xa0:xa1] = np.where(sub_active, patch_u8, frame_u8[ya0:ya1, xa0:xa1])

        proc.stdin.write(frame_u8.tobytes())
        if (f + 1) % 15 == 0:
            print(f'  Rendered {f + 1}/{FRAMES} frames')

    proc.stdin.close()
    ret = proc.wait()
    if ret != 0:
        print(f'ERROR: ffmpeg exited {ret}', file=sys.stderr)
        sys.exit(ret)

    size_kb = OUT_ANIM_WEBP.stat().st_size / 1024.0
    print(f'DONE: {OUT_ANIM_WEBP} ({size_kb:.1f} KB / {size_kb / 1024.0:.2f} MB, {FRAMES} frames @ {FPS}fps, {DURATION}s)')


if __name__ == '__main__':
    main()
