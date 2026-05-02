# Layout and Viewing Learnings

## The Layout Is Product-Significant

The previous gallery invested real effort in the photo-wall layout. Do not casually replace it with a basic masonry grid.

The desired look is not standard Pinterest masonry. It is closer to a justified row layout:

- Rows fill the available width.
- Image widths vary according to aspect ratio.
- Row heights can vary within constraints.
- Very wide images should be allowed to feel wide.
- Portrait and landscape images should coexist without making the layout feel broken.
- Vertical seams should not line up in a rigid column pattern.
- The wall should feel flexible and photographic, not like uniform cards.

This is a special requirement. Preserve it.

## CSS Masonry Is Not a Drop-In Replacement

Native CSS masonry/Grid Lanes is promising, but do not rely on it unless support is verified for the target browsers at implementation time.

Even when available, native masonry is mostly a column-packing model. It does not automatically reproduce the previous gallery's justified-row feel.

Avoid these as the primary layout if the goal is to preserve the old visual character:

- CSS multi-column layout.
- Simple fixed-column masonry.
- Uniform square/rectangle card grids.

Those approaches tend to create visible column seams, awkward reading order, or too much cropping.

## Recommended Layout Direction

Use a small custom justified layout engine.

Keep it isolated and pure:

- Input: ordered media/album entries with aspect ratios.
- Input: actual container width.
- Output: tile rectangles or rows.
- No React state inside the layout algorithm.
- No DOM measurement inside the layout algorithm.

The React component should only:

- Observe container width.
- Call the layout function.
- Render tiles.
- Attach stable `data-media-id` attributes for scroll restoration.

Avoid the old fixed-desktop-width-plus-scale model. The new layout should compute directly for the current container width.

## Layout Inputs

Every visible grid item needs an aspect ratio:

- Images use their real dimensions.
- Videos use their video dimensions.
- Album tiles use the cover media aspect ratio.
- Missing dimensions can fall back to a conservative ratio, but generated manifests should normally include dimensions.

Albums should participate in the same layout as media. They should not be separate cards outside the grid.

## Layout Behavior

The layout should support:

- Configurable gap.
- Target row height.
- Minimum and maximum row height.
- Sensible handling for panoramas.
- Sensible handling for the final row.
- Stable output for the same inputs.

Useful policy choices:

- Let extremely wide items take much of a row, or occasionally become a row by themselves.
- Avoid stretching a tiny final row to full width if it looks bad.
- Keep item order predictable; visual cleverness should not make navigation confusing.

## Scroll Restoration

Scroll restoration is a core app-like behavior.

Expected behavior:

1. User opens a photo/video from a grid.
2. URL changes to that media item.
3. User closes the media view.
4. App returns to the gallery or album route.
5. Grid scrolls to the tile for that media item.

Direct shared links should also work:

1. User opens `/trail/01`.
2. Media view opens directly.
3. User closes it.
4. App shows `/trail` scrolled to `01`.

Implementation should not depend on module-global state. Use route state, browser history state, URL state, or session storage.

Each rendered tile should have a stable attribute such as:

```html
<a data-media-id="trail/01">...</a>
```

After layout/render is stable, find the element and scroll it into view.

## Lightbox

The lightbox/media viewer should feel polished, but it does not need to be custom if a library does the job well.

Requirements:

- Image and video support.
- Deep-link support.
- Keyboard navigation.
- Touch/swipe navigation.
- Previous/next.
- Close.
- Natural browser back behavior.

Using a mature lightbox library is encouraged if it does not fight the route model. Custom code is acceptable only where needed for route integration, videos, or scroll restoration.

## Video Tiles

Videos should appear naturally in the grid.

Expected behavior:

- Use a generated poster/thumbnail.
- Prefer a short generated preview for hover/autoplay if simple.
- Always provide a clear video affordance, such as a small play icon overlay.
- The lightbox opens the original video or a high-quality playable version.

Video support should not force a separate visual system from photos.

