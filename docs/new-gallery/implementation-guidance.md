# Implementation Guidance

This document captures the important engineering direction for the clean implementation. It intentionally avoids specifying ordinary framework details that are easy to infer during implementation.

## Preferred App Shape

Build a static-first client app.

Good fit:

- Vite.
- React.
- TypeScript.
- Static `gallery.json`.
- Static media assets or public object-storage URLs.

Avoid unless a clear need appears:

- Server rendering.
- Backend API routes.
- Runtime metadata fetching from a private service.
- Framework image optimizers.
- Databases.

The browsing experience should work from static files plus generated media URLs.

## Generated Manifest

The web app should not scan folders at runtime. A processing script should scan source media and generate a manifest.

The manifest should include:

- Root album.
- Album records by slug/path.
- Media records by stable ID.
- Ordered entries for each album.
- Media type.
- Dimensions and aspect ratio.
- Original filename.
- Content hash.
- URLs for original, thumbnail, and optional video preview.
- Optional title/caption/capture date.
- Album counts and cover media.

Stable IDs matter. Prefer IDs derived from album path and media slug rather than random IDs.

Example IDs:

```text
trail/01
trail/clip
desert-sunset
```

## Processing Script

The processing script is important because it handles original media, generated assets, and future object storage. Keep it understandable and safe.

Responsibilities:

- Scan the source folder tree.
- Read optional `index.json` files.
- Compute content hashes.
- Extract dimensions and capture dates when available.
- Generate image thumbnails.
- Generate video posters/previews.
- Write processed assets.
- Write the static manifest.
- Cache enough information to skip unchanged work.

The script should never modify files in the source media folder.

Start with local output:

```text
public/gallery.json
public/media/originals/
public/media/thumbnails/
public/media/previews/
```

Future object storage should be behind a small storage abstraction. Do not mix R2-specific logic throughout scanning and processing code.

Do not use `public/media` as the canonical source directory. Treat it as disposable generated output.

The source directory should be explicit and separate from generated output, for example:

```text
~/Pictures/gallery-source/
```

or a configured path passed to the processor.

## Data Safety

Prefer orphaned generated assets over accidental deletion.

Important rules:

- Never delete source originals.
- Never rely on gitignored generated media as the only copy of original media.
- Do not automatically delete remote assets in the first version.
- If deletion is added later, implement dry-run first.
- If duplicate media share a content hash, deleting one manifest entry must not delete shared assets still referenced by another entry.
- Keep metadata/reference deletion separate from asset deletion.
- Keep original uploads in object storage if object storage is used; thumbnails and previews are disposable, originals are recovery material.

The previous implementation had risk around deleting shared content-hash assets. Avoid repeating that design.

The previous implementation also allowed ignored files under `public/photos` to become accidental source material. Avoid repeating that design. A repo reclone should not be expected to restore original photos unless they were deliberately checked in, which is not recommended for large personal media.

## Recovery Inventory

The generated manifest should double as a lightweight inventory of published media.

Include enough information to answer:

- What media existed?
- Which album/path did it belong to?
- What was the original filename?
- What content hash identified it?
- Where is the published original stored?

This enables a future recovery command such as:

```bash
npm run restore-source -- --dest ~/Pictures/gallery-source-recovered
```

The restore command does not need to exist initially, but storage keys and manifest data should make it possible.

## Incremental Processing

Incremental processing is useful but should stay simple.

Cache by:

- Source path.
- File size.
- Modified time.
- Content hash.
- Processor settings version.

If processor settings change, regenerate affected derived assets.

Support:

- Normal incremental run.
- `--force` to regenerate.
- `--dry-run` for any future destructive operation.

## Routing

The route resolver should be data-driven from the manifest.

It should answer:

- Is this path the root gallery?
- Is this path an album?
- Is this path a media item?
- If media, what gallery context owns previous/next navigation?
- If media, what gallery path should close return to?

Keep route resolution separate from React components so it can be tested.

## Tests Worth Having

Do not overbuild tests, but protect the unusual behavior.

Useful tests:

- Folder scan creates expected albums and media entries.
- `index.json` title, cover, and order are respected.
- Missing `index.json` fallback works.
- Duplicate content hashes can share asset URLs while remaining separate manifest entries.
- Album counts are correct.
- Route resolution works for root media, album pages, and album media.
- Justified layout returns stable tiles and fills rows within expected constraints.
- Scroll-restoration helper picks the correct gallery path and media ID.

Mock image/video processing in most tests. The value is in manifest/routing/layout correctness, not testing Sharp or FFmpeg.

## Dependencies

Use dependencies where they reduce real complexity.

Good candidates:

- Sharp for image processing.
- FFmpeg tooling for video previews.
- A mature lightbox library if it supports the route/viewing model cleanly.

Be cautious with:

- Heavy gallery frameworks that dictate layout or routing.
- Large masonry packages if a small justified layout function better matches the desired look.
- Framework-specific image optimization.

## Portability

Keep Cloudflare portability in mind without making the initial version Cloudflare-specific.

Useful constraints:

- Static build output.
- No server-only route behavior.
- Public media URLs in the manifest.
- Storage implementation can later switch from local files to R2.

The app should still be pleasant to develop locally with media emitted into `public/media`.

## Design Tone

The UI should be quiet and media-first.

Do:

- Show the gallery immediately.
- Use minimal navigation.
- Use subtle album overlays.
- Make the lightbox full-screen and direct.
- Make mobile and desktop both feel intentional.

Avoid:

- Landing pages.
- Hero sections.
- Marketing copy.
- Decorative cards around the whole app.
- UI that competes with the photos.
