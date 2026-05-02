# Requirements

## Purpose

This is a personal photo and video gallery. It is for one person publishing a small, curated collection, not for multiple users, public uploads, administration, or large-scale content management.

Optimize for:

- Quick publishing from local files.
- Fast, polished viewing.
- Durable links for sharing individual photos, videos, and albums.
- A codebase that is easy for AI coding agents to understand and modify.
- Static hosting, with an easy path to Cloudflare Pages and R2.

Do not optimize for:

- Auth.
- Upload UI.
- Admin dashboards.
- A database.
- CMS workflows.
- Comments, likes, search, tagging, or social features.
- Heavy framework-specific server behavior.

## Content Model

The gallery should support two kinds of visible entries:

- Media: an image or video.
- Album: a folder-like collection of media and, optionally, nested albums.

The home grid should be allowed to mix standalone media and album tiles. An album tile should visually belong in the same grid as photos, using a cover image/video thumbnail plus a subtle title/count overlay.

Albums are first-class, not a later add-on. Example use case:

- A trail album with 4 photos and 1 video.
- The home grid shows a tile for that trail.
- Clicking the tile opens the album.
- Clicking any item opens a lightbox/media view.

Nested albums may be supported if the folder scanner naturally allows them, but the UI should not be designed around a deep tree. One or two levels is enough.

## Authoring Workflow

The source of truth should be a local folder tree.

Example:

```text
source-media/
  index.json
  desert-sunset.jpg
  trail/
    index.json
    01.jpg
    02.jpg
    03.jpg
    04.jpg
    clip.mov
```

Optional `index.json` files can provide title, cover, description, and explicit ordering.

Example root metadata:

```json
{
  "title": "Photos",
  "order": ["desert-sunset.jpg", "trail"]
}
```

Example album metadata:

```json
{
  "title": "Trail",
  "cover": "01.jpg",
  "description": "Short optional caption",
  "order": ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "clip.mov"]
}
```

If metadata is missing, the app should still work:

- Folder name becomes album title.
- First suitable media item becomes cover.
- Media order falls back to filename or capture date.

## Source of Truth and Recovery

Original media must not live only in the repository's `public/` directory.

The previous architecture made ignored `public/photos` files act like source media. That was fragile: deleting the folder or recloning the repo could lose the local record of what had been published.

Use explicit layers instead:

```text
~/Pictures/gallery-source/       canonical originals, backed up outside git
repo/source-metadata/            small tracked metadata if needed
repo/public/media/               generated output, disposable
object storage                   published assets and optional recovery archive
```

Rules:

- `public/` is generated output, never canonical source.
- The processing script reads from a source directory outside generated output.
- Source originals should be backed up outside git, such as Time Machine, iCloud Drive, Dropbox, Backblaze, NAS, or object storage.
- Generated thumbnails, previews, and copied public assets can be deleted and recreated.
- Original uploaded media should be kept in object storage if object storage is used.
- The manifest should contain enough inventory information to know what was published even if the local source folder is missing.

Useful manifest inventory fields:

- Stable media ID.
- Source-relative path.
- Original filename.
- Content hash.
- Media type.
- Dimensions.
- Published original URL or storage key.

It should eventually be possible to reconstruct a source folder from published originals using the manifest and object storage. This does not need to be the first feature, but the architecture should not prevent it.

## Routing Requirements

URLs should be simple, durable, and understandable.

Expected route behavior:

```text
/                  root gallery
/trail             album gallery
/trail/01          media view for item 01 inside trail
/desert-sunset     media view for root-level item
```

Direct visits to media URLs must work. A shared photo link should open the photo/video first. Closing it should show the gallery or album grid at the item location.

Previous/next navigation should stay within the current album/root gallery context. It should not unexpectedly jump across the whole site unless that is an intentional mode.

## Viewing Requirements

The media viewing experience is a primary feature.

Required:

- Full-screen image viewing.
- Video viewing in the same flow.
- Keyboard navigation.
- Touch/swipe navigation.
- Previous/next controls.
- Close control and Escape handling.
- Direct-linked media opens correctly.
- Closing returns to the correct grid.
- Return grid scrolls to the media item.

Nice to have:

- Captions from optional metadata.
- Video preview thumbnails in the grid.
- Muted video preview on hover or autoplay where appropriate.

## Deployment Requirements

The app should be deployable as static files.

Preferred shape:

- Static app build output.
- Static `gallery.json` manifest.
- Generated thumbnails/previews/original media either included in the static output or hosted from object storage.

Cloudflare should be easy later:

- Cloudflare Pages can serve the static app.
- Cloudflare R2 can host media assets.
- The manifest can contain public R2/custom-domain URLs.

Avoid requiring a server runtime for normal browsing.
