# Plotwist Design Patterns Reference

Distilled from `plotwist-app/plotwist`:
- `docs/superpowers/specs/2026-09-06-cinematic-movie-details-design.md`
- `.cursor/rules/product-principles.mdc`
- `apps/web/src/components/{item-status,item-review,item-hover-card,command-search,poster-card,share-page-button}`

## 1. Cinematic Movie Detail Layout

### Desktop
1. Full-width backdrop hero with dark vertical + radial readability gradients blending seamlessly into `--bg`.
2. Overlapping media cover anchored cleanly to the left of the title/metadata column.
3. Title, year/format/status specs, star score, genres, and overview form one scannable block.
4. Primary actions (Play/Resume, Watch Status, Review, Favorite, Share) stay grouped in one horizontal cluster.
5. Sub-content (Episodes, Reviews, Metadata Info) sits in a tabbed reading container below the banner.

### Mobile
1. Backdrop stays compact so title and primary actions remain near the fold.
2. Title and metadata wrap cleanly with zero horizontal overflow.
3. Every action is a direct touch target (`min-height: 40px`) with no hover dependency.

## 2. ItemHoverCard Anatomy
```text
+-----------------------------------+
|  16:9 Banner (cover_horizontal)   |
+-----------------------------------+
| [2:3 Poster]  Title               |
| (overlaps     Year · Format · ★   |
|  upward)      3-line overview...  |
+-----------------------------------+
```
- Shown only on `@media (hover: hover) and (pointer: fine)`.
- Must use `pointer-events: none` or safe hover bridging so it never traps clicks or blocks bookmark buttons.

## 3. Watch Status Enum
| Key | Vietnamese Label | Meaning |
| --- | --- | --- |
| `watching` | Đang xem | Currently watching series/movie |
| `plan` | Muốn xem | Planned watchlist |
| `completed` | Đã xem | Finished watching |
| `dropped` | Tạm dừng | On hold / dropped |

## 4. Storage Keys (Static SPA)
- `vtc-favorites-v1`: `string[]` (movie IDs)
- `vtc-watch-progress-v1`: `Record<"${movieId}:${ep}", number>` (seconds)
- `vtc-statuses-v1`: `Record<movieId, "watching"|"plan"|"completed"|"dropped">`
- `vtc-watched-eps-v1`: `Record<movieId, number[]>`
- `vtc-reviews-v1`: `Record<movieId, { rating: number, text: string, spoiler: boolean, updatedAt: number }>`

## 5. Product Craft Rules (from `product-principles.mdc`)
- Default to clarity and strong typographic hierarchy over noisy decoration.
- Every interactive state change (copy link, status change, save review) gives immediate, restrained visual feedback (toast or updated badge).
- Never break existing theme assets (in Vân Thiên Các: xianxia ink-gold palette, drifting side clouds, flying crane layer).
