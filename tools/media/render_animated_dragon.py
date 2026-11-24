#!/usr/bin/env python3
"""Render a lightweight, seamless looping transparent Animated WebP of the exact
3D reclining Xianxia dragon perched on the footer:
- All 4 claws & resting contact base stay 100% PINNED to the footer ledge
- Head & antlers gently lift and nod with calm imperial breathing
- Golden mane hairs & long curved whiskers ripple in the mountain breeze
- Chest & arched emerald-jade spine rise/relax smoothly with breathing
- Long feathered tail plume swishes lazily in a smooth serpentine wave
- Natural amber eyelid blink once per 4-second cycle + subtle spirit eye gleam
- Dynamic 3D contact + directional cast drop shadow updated every frame!
Outputs a single compact RGBA animated WebP (~350-550 KB, 0 JS, 0 GPU lag)."""
from pathlib import Path
import time
import numpy as np
from PIL import Image, ImageFilter

SRC = Path('/root/.gemini/antigravity-cli/brain/662c537e-c82b-41f7-9d03-7f6d019da7e2/xianxia_dragon_ledge_cutout_1795306738026.jpg')
OUT_WEBP = Path('/root/van-thien-cac/assets/creatures/dragon/footer-dragon.webp')

TARGET_W = 500  # Crisp ~1.35x high-DPI for ~390px desktop display while staying ultra-lightweight!
FRAMES = 32     # 32 seamless frames @ 120ms = 3.84s calm majestic loop
FRAME_MS = 120


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-np.clip(x, -20.0, 20.0)))


def gauss2d(xg, yg, cx, cy, sx, sy):
    return np.exp(-0.5 * (((xg - cx) / sx) ** 2 + ((yg - cy) / sy) ** 2))


def bilinear_warp_rgba(img, src_x, src_y):
    """Fast vectorized bilinear inverse-mapping for (H, W, 4) float32 RGBA image."""
    h, w, _ = img.shape
    x = np.clip(src_x, 0.0, w - 1.001)
    y = np.clip(src_y, 0.0, h - 1.001)
    x0 = x.astype(np.int32)
    y0 = y.astype(np.int32)
    x1 = x0 + 1
    y1 = y0 + 1
    dx = (x - x0)[..., None]
    dy = (y - y0)[..., None]
    return (
        (img[y0, x0] * (1.0 - dx) + img[y0, x1] * dx) * (1.0 - dy)
        + (img[y1, x0] * (1.0 - dx) + img[y1, x1] * dx) * dy
    )


def main():
    t_start = time.time()
    im = Image.open(SRC).convert('RGB')
    rgb = np.asarray(im, dtype=np.float32) / 255.0
    h0, w0, _ = rgb.shape

    # --- 1. Fringe-free alpha matte + white color decontamination ---
    min_ch = np.min(rgb, axis=2)
    dist_white = 1.0 - min_ch

    alpha = np.clip((dist_white - 0.045) / 0.165, 0.0, 1.0)
    core = np.clip((dist_white - 0.14) / 0.12, 0.0, 1.0)
    alpha = np.maximum(alpha, core)
    alpha = np.where(dist_white < 0.038, 0.0, alpha)

    a_im = Image.fromarray(np.clip(alpha * 255.0, 0, 255).astype(np.uint8), mode='L')
    a_soft = np.asarray(a_im.filter(ImageFilter.GaussianBlur(radius=0.6)), dtype=np.float32) / 255.0
    alpha = np.where(alpha > 0.96, 1.0, np.where(alpha < 0.03, 0.0, a_soft))

    a_safe = np.maximum(alpha, 0.18)[..., None]
    fg = np.clip((rgb - (1.0 - alpha[..., None]) * 1.0) / a_safe, 0.0, 1.0)
    # Match darkened golden-dawn Vân Hải Tiên Cung atmosphere
    fg[:, :, 0] *= 0.94
    fg[:, :, 1] *= 0.93
    fg[:, :, 2] *= 0.90

    # Tightly crop dragon
    ys, xs = np.where(alpha > 0.05)
    y0, y1 = max(0, int(ys.min()) - 8), min(h0, int(ys.max()) + 12)
    x0, x1 = max(0, int(xs.min()) - 12), min(w0, int(xs.max()) + 16)
    fg = fg[y0:y1, x0:x1]
    alpha = alpha[y0:y1, x0:x1]

    ch, cw = alpha.shape
    target_h = int(round(ch * (TARGET_W / cw)))

    # Generous padding for head nod, tail swish, and grounded 3D cast drop shadow
    pad_top, pad_bottom, pad_left, pad_right = 14, 36, 12, 22
    out_w = TARGET_W + pad_left + pad_right
    out_h = target_h + pad_top + pad_bottom

    fg_im = Image.fromarray(np.clip(fg * 255.0 + 0.5, 0, 255).astype(np.uint8), mode='RGB').resize(
        (TARGET_W, target_h), Image.Resampling.LANCZOS
    )
    a_rs = Image.fromarray(np.clip(alpha * 255.0 + 0.5, 0, 255).astype(np.uint8), mode='L').resize(
        (TARGET_W, target_h), Image.Resampling.LANCZOS
    )

    # Pre-multiplied RGBA canvas for artifact-free bilinear warping (zero dark fringe!)
    base_pil = Image.new('RGBA', (out_w, out_h), (0, 0, 0, 0))
    base_pil.paste(Image.merge('RGBA', (*fg_im.split(), a_rs)), (pad_left, pad_top))
    base_arr = np.asarray(base_pil, dtype=np.float32) / 255.0
    base_pm = base_arr.copy()
    base_pm[:, :, :3] *= base_pm[:, :, 3:4]

    # Normalized & pixel coordinate grids
    xg = np.linspace(0.0, 1.0, out_w, dtype=np.float32)[None, :]
    yg = np.linspace(0.0, 1.0, out_h, dtype=np.float32)[:, None]
    xp = np.arange(out_w, dtype=np.float32)[None, :]
    yp = np.arange(out_h, dtype=np.float32)[:, None]

    ledge_y = pad_top + int(round(target_h * 0.64))
    footer_zone = np.clip((yp - (ledge_y - 14)) / 32.0, 0.0, 1.0)

    # --- 2. Anatomical Kinematic Rig Weights (mapped directly from /tmp/dragon_grid.png) ---
    # 2a. Pinned Ground Anchors (all 4 paws + lower tail contact base stay LOCKED on footer!)
    pin_fl = gauss2d(xg, yg, 0.08, 0.72, 0.065, 0.075)
    pin_fr = gauss2d(xg, yg, 0.20, 0.76, 0.055, 0.095)
    pin_hl = gauss2d(xg, yg, 0.47, 0.71, 0.050, 0.055)
    pin_hr = gauss2d(xg, yg, 0.57, 0.71, 0.065, 0.060)
    pin_coil = gauss2d(xg, yg, 0.66, 0.66, 0.065, 0.055)
    pin_mask = np.clip((pin_fl + pin_fr + pin_hl + pin_hr + pin_coil) * 1.45, 0.0, 1.0)
    free_mask = 1.0 - pin_mask

    # 2b. Head, Antlers & Upper Neck (pivots smoothly around neck base (0.17, 0.54))
    w_head = sigmoid((0.52 - yg) / 0.075) * sigmoid((0.35 - xg) / 0.055) * free_mask

    # 2c. Flowing Golden Mane & Silky Curved Whiskers (breeze flutter)
    w_mane = (
        gauss2d(xg, yg, 0.245, 0.29, 0.055, 0.085)
        + gauss2d(xg, yg, 0.285, 0.37, 0.065, 0.055)
        + gauss2d(xg, yg, 0.100, 0.38, 0.042, 0.055)
    )
    w_mane = np.clip(w_mane, 0.0, 1.0) * free_mask

    # 2d. Breathing Chest & Arched Emerald-Jade Spine
    w_chest = gauss2d(xg, yg, 0.17, 0.53, 0.075, 0.095) * free_mask
    w_spine = gauss2d(xg, yg, 0.36, 0.44, 0.110, 0.115) * free_mask

    # 2e. Feathered Tail Plume (anchored smoothly at coil x=0.58, sweeping free to tip x=0.96)
    p_tail = np.clip((xg - 0.56) / 0.40, 0.0, 1.0)
    w_tail = (
        sigmoid((xg - 0.57) / 0.045)
        * sigmoid((0.63 - yg) / 0.055)
        * free_mask
    )

    # 2f. Eye region (exact pixel center from /tmp/dragon_grid.png: x=0.146, y=0.268)
    eye_cx, eye_cy = 0.146, 0.266
    eye_glow_mask = gauss2d(xg, yg, eye_cx, eye_cy, 0.014, 0.018)
    eye_lid_mask = gauss2d(xg, yg, eye_cx, eye_cy, 0.011, 0.011)
    lid_col = np.array([0.46, 0.42, 0.28], dtype=np.float32)  # Natural weathered golden-jade eyelid scale tone
    amber_col = np.array([1.00, 0.78, 0.32], dtype=np.float32)

    # Precompute constant base contact shadow ellipse along the footer ledge
    contact_base = (
        0.52 * np.exp(-0.5 * (((xg - 0.56) / 0.23) ** 2 + ((yp - (ledge_y + 18)) / 11.0) ** 2))
        + 0.44 * np.exp(-0.5 * (((xg - 0.22) / 0.10) ** 2 + ((yp - (ledge_y + 30)) / 12.0) ** 2))
    )

    pil_frames = []
    print(f'Rendering {FRAMES} animated 3D dragon frames ({out_w}x{out_h} @ {1000/FRAME_MS:.1f}fps)...')

    for f in range(FRAMES):
        t = f / FRAMES
        w2 = 2.0 * np.pi * t
        w4 = 4.0 * np.pi * t

        # Smooth periodic motion signals
        breath = np.sin(w2)                   # Calm 4-second celestial breath
        breath_lag = np.sin(w2 - 0.55)        # Follow-through phase delay on spine/chest

        # --- Compute forward displacement field (dx_fwd, dy_fwd) in pixels ---
        # 1) Head subtle lift & regal nod around neck pivot (0.17, 0.54)
        px_neck, py_neck = 0.17 * out_w, 0.54 * out_h
        theta = 0.036 * breath  # ±2.1° subtle regal head tilt
        dx_head = (-(yp - py_neck) * theta + 1.8 * np.cos(w2)) * w_head
        dy_head = ((xp - px_neck) * theta - 3.6 * breath) * w_head

        # 2) Wind-swept golden mane & whiskers (traveling mountain breeze left -> right)
        breeze = np.sin(w4 - xg * 24.0)
        breeze2 = np.cos(w2 - xg * 14.0)
        dx_mane = (1.8 * breeze + 1.0 * breeze2) * w_mane
        dy_mane = (2.8 * breeze + 1.4 * np.sin(w4 - xg * 32.0)) * w_mane

        # 3) Chest expansion & arched emerald-jade spine breathing
        dx_body = -1.6 * breath_lag * w_chest
        dy_body = (-3.0 * breath_lag * w_chest) + (-4.2 * breath_lag * w_spine)

        # 4) Lazy majestic serpentine tail swish + fine feather flutter
        tail_wave = np.sin(w2 - p_tail * 2.5)
        tail_flutter = np.sin(w4 - p_tail * 4.8)
        dx_tail = (2.6 * (p_tail ** 1.35) * np.cos(w2 - p_tail * 2.1)) * w_tail
        dy_tail = (9.8 * (p_tail ** 1.45) * tail_wave + 2.0 * (p_tail ** 1.8) * tail_flutter) * w_tail

        dx_total = dx_head + dx_mane + dx_body + dx_tail
        dy_total = dy_head + dy_mane + dy_body + dy_tail

        # Inverse warp (sample source at x - dx, y - dy) on premultiplied RGBA
        warped_pm = bilinear_warp_rgba(base_pm, xp - dx_total, yp - dy_total)
        a_out = np.clip(warped_pm[:, :, 3], 0.0, 1.0)
        rgb_out = np.where(a_out[..., None] > 1e-4, np.clip(warped_pm[:, :, :3] / np.maximum(a_out[..., None], 1e-4), 0.0, 1.0), 0.0)

        # --- Living Eye Blink (around t = 0.72 .. 0.82) + Subtle Spirit Amber Gleam ---
        # Shift eye coordinate with head motion so blink tracks exact eye position!
        eye_dx_px = float((-(eye_cy * out_h - py_neck) * theta + 1.8 * np.cos(w2)))
        eye_dy_px = float(((eye_cx * out_w - px_neck) * theta - 3.6 * breath))
        ecx_live = eye_cx + eye_dx_px / out_w
        ecy_live = eye_cy + eye_dy_px / out_h

        blink_phase = (t - 0.72) / 0.10
        blink_amt = float(np.sin(np.pi * blink_phase) ** 1.6) if 0.0 < blink_phase < 1.0 else 0.0
        if blink_amt > 0.01:
            lid_m = gauss2d(xg, yg, ecx_live, ecy_live, 0.0105, 0.0105) * blink_amt * 0.92 * a_out
            rgb_out = rgb_out * (1.0 - lid_m[..., None]) + lid_col[None, None, :] * lid_m[..., None]
        else:
            # Subtle warm amber living glint in the eye + sunlit chest scale gleam
            gleam = (0.14 + 0.10 * (0.5 + 0.5 * breath)) * gauss2d(xg, yg, ecx_live, ecy_live, 0.012, 0.014) * a_out
            rgb_out = np.clip(rgb_out + gleam[..., None] * amber_col[None, None, :], 0.0, 1.0)

        # --- Dynamic Per-Frame 3D Contact & Directional Cast Drop Shadow on Footer ---
        sh_broad_src = np.zeros_like(a_out)
        sh_broad_src[13:, 8:] = a_out[:-13, :-8]
        sh_broad_im = Image.fromarray(np.clip(sh_broad_src * 255.0, 0, 255).astype(np.uint8), mode='L').filter(
            ImageFilter.GaussianBlur(radius=11)
        )
        sh_broad = (np.asarray(sh_broad_im, dtype=np.float32) / 255.0) * footer_zone * 0.76

        sh_tight_src = np.zeros_like(a_out)
        sh_tight_src[5:, 3:] = a_out[:-5, :-3]
        sh_tight_im = Image.fromarray(np.clip(sh_tight_src * 255.0, 0, 255).astype(np.uint8), mode='L').filter(
            ImageFilter.GaussianBlur(radius=4)
        )
        sh_tight = (np.asarray(sh_tight_im, dtype=np.float32) / 255.0) * footer_zone * 0.72

        shadow_a = np.clip(1.0 - (1.0 - sh_broad) * (1.0 - sh_tight) * (1.0 - contact_base), 0.0, 0.88)

        # Composite shadow under deformed dragon (standard Porter-Duff Over)
        comp_a = a_out + shadow_a * (1.0 - a_out)
        sh_col = np.array([2.0 / 255.0, 6.0 / 255.0, 12.0 / 255.0], dtype=np.float32)[None, None, :]
        comp_rgb = np.where(
            comp_a[..., None] > 1e-4,
            (rgb_out * a_out[..., None] + sh_col * shadow_a[..., None] * (1.0 - a_out[..., None])) / np.maximum(comp_a[..., None], 1e-4),
            0.0,
        )

        rgba_u8 = np.zeros((out_h, out_w, 4), dtype=np.uint8)
        rgba_u8[:, :, :3] = np.clip(comp_rgb * 255.0 + 0.5, 0, 255).astype(np.uint8)
        rgba_u8[:, :, 3] = np.clip(comp_a * 255.0 + 0.5, 0, 255).astype(np.uint8)
        pil_frames.append(Image.fromarray(rgba_u8, mode='RGBA'))

    # Save diagnostic frames & motion difference heatmap
    bg_test = Image.new('RGBA', (out_w, out_h), (24, 38, 52, 255))
    f_inhale = FRAMES // 4
    f_blink = int(round(FRAMES * 0.76))
    Image.alpha_composite(bg_test, pil_frames[f_inhale]).save('/tmp/dragon_f10_inhale.png')
    Image.alpha_composite(bg_test, pil_frames[f_blink]).save('/tmp/dragon_f30_blink.png')
    d0 = np.asarray(pil_frames[f_inhale], dtype=np.float32)
    d1 = np.asarray(pil_frames[f_blink], dtype=np.float32)
    diff_map = np.clip(np.abs(d1[:, :, :3] - d0[:, :, :3]) * 5.0 + np.abs(d1[:, :, 3:4] - d0[:, :, 3:4]) * 3.0, 0, 255).astype(np.uint8)
    Image.fromarray(diff_map).save('/tmp/dragon_motion_diff.png')

    OUT_WEBP.parent.mkdir(parents=True, exist_ok=True)
    pil_frames[0].save(
        OUT_WEBP,
        format='WEBP',
        save_all=True,
        append_images=pil_frames[1:],
        duration=FRAME_MS,
        loop=0,
        quality=72,
        method=4,
        minimize_size=True,
    )
    kb = OUT_WEBP.stat().st_size / 1024
    elapsed = time.time() - t_start
    print(f'DONE: {OUT_WEBP} ({out_w}x{out_h}, {FRAMES} frames, {kb:.1f} KB) in {elapsed:.1f}s')


if __name__ == '__main__':
    main()
