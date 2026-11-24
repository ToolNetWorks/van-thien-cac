---
name: plotwist-cinema
description: >-
  Applies Plotwist-inspired cinematic media web UI patterns, tracking workflows,
  and anti-vibecode product design standards (Cinematic Movie Details, Watch Status
  tracking, 5-Star Ratings & Reviews, ItemHoverCard, Command Search Ctrl+K, Share
  feedback, and guest-first persistence). Use when building, upgrading, or reviewing
  movie, anime, or series web interfaces in this workspace.
---

# Plotwist Cinema UI & Product Skill

Standards and implementation patterns adapted from [plotwist-app/plotwist](https://github.com/plotwist-app/plotwist) for media catalog and streaming web apps while preserving each project's native visual theme.

## Core Design Principles

1. **No Generic Vibecoded UI**: Use cohesive design tokens (palette, radii, typography, spacing) matching the project's identity. Never mix mismatched default component themes.
2. **Guest-First Local Persistence**: Never block core media tracking (watch status, favorites, episode progress, ratings/reviews) behind a mandatory login wall; persist cleanly in `localStorage` / cookies with graceful fallback when storage is unavailable.
3. **Dual-Aspect Media Discipline**:
   - Store both `poster_vertical` (2:3) and `cover_horizontal` (16:9) per title.
   - Use `cover_horizontal` for 16:9 cards, hero featured banners, detail backdrops, and search previews with `object-fit: cover`.
   - Use `poster_vertical` for classic overlapping poster previews (hover cards, info tabs).
4. **Touch-Safe Responsive Ergonomics**: All primary actions must be reachable by tap on mobile without requiring hover interactions. Hover preview cards activate strictly under `@media (hover: hover) and (pointer: fine)`.
5. **Zero Junk Icons & Decorative Unicode**: Never scatter decorative icons, trash icons, emoji, or raw Unicode glyphs (`★`, `✓`, `◇`, `✦`, `↗`) on cards, status pills, buttons, dividers, or empty states. Favor crisp typography and restrict SVG icons strictly to essential UI chrome (`search`, `menu`, `close`).

## Required UI Modules & Patterns

Refer to [Design Patterns Reference](./references/design-patterns.md) for detailed layout specs and token rules.

### 1. Cinematic Movie Details
- Full-width backdrop (`cover_horizontal`) with dual radial + bottom readability gradients into the page surface.
- Overlapping cover frame + clear metadata stack (eyebrow kicker, title, star rating, year, format, status, genres, synopsis).
- Unified primary action cluster: **Watch / Continue Episode**, **Watch Status**, **Rate & Review**, **Favorite**, and **Share Link** (with copy/Web Share toast).
- Structured content tabs below the banner: **Episodes** (with watched indicators), **Reviews**, and **Details**.

### 2. Item Status Tracker (`watching` | `plan` | `completed` | `dropped`)
- Allow one-click status assignment and removal on movie detail pages.
- Surface status pills on movie cards and filterable tabs inside the user's personal library/watchlist view (`#/yeu-thich`).
- Automatically set status to `watching` (unless already `completed`) and record watched episodes when playback opens.

### 3. Item Review (5-Star Rating & Notes)
- Interactive 1–5 star rating + optional spoiler flag + short review note in a modal dialog.
- Button state reflects existing review (filled gold star + score).
- Render user reviews in the detail page's Reviews tab with edit/delete and spoiler-reveal controls.

### 4. Item Hover Card (Desktop Only)
- Hovering a `.movie-card` reveals a compact floating preview after a short intent delay (`~250ms`):
  - Top 16:9 banner (`cover_horizontal`)
  - Overlapping vertical mini-poster (`poster_vertical`)
  - Title, year, format, rating, status badge, and 3-line synopsis clamp.

### 5. Command Search (`Ctrl+K` / `⌘K` / `/`)
- Keyboard-accessible palette supporting `ArrowUp`, `ArrowDown`, `Enter`, and `Escape`.
- Groups quick navigation shortcuts alongside live movie search results (matching title, subtitle, genres, description).

## Verification Steps

After modifying any media UI files, verify:
1. Run structural & data checks:
   ```bash
   python3 tools/check_site.py
   ```
2. Validate JS syntax and CSS brace integrity:
   ```bash
   node --check app.js
   ```
3. Confirm HTTP `200` on served assets (`index.html`, `styles.css`, `app.js`, `data/movies.json`) and test both desktop hover cards and mobile touch layout.
