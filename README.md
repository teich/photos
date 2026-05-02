# Photos

A static-first personal photo and video gallery. Source media lives in an explicit local folder; generated assets and `public/gallery.json` are disposable build output.

## Develop

```bash
npm install
npm run process-media -- --source ~/Pictures/gallery-source
npm run dev
```

## Build

```bash
npm run process-media -- --source ~/Pictures/gallery-source --media-base-url https://blobs.zednine.com
npm run build
```

Video processing uses local `ffmpeg` and `ffprobe` when available. The processor writes silent looping MP4 previews to `public/media/previews/` and JPEG poster frames to `public/media/posters/`; the lightbox still opens the original video with normal controls. If `ffmpeg` is unavailable or broken, processing falls back to the original video URL for the grid preview.

For production, sync `public/media` to the R2 bucket behind `https://blobs.zednine.com`, then deploy the app as a Cloudflare Worker with static assets:

```bash
npm run publish
```

`npm run publish` defaults to:

- source media: `~/Pictures/gallery-source`
- public media base URL: `https://blobs.zednine.com`
- R2 destination: `r2:photos/media`

Override those defaults with `--source`, `--media-base-url`, and `--rclone-dest`, or with `GALLERY_SOURCE`, `GALLERY_MEDIA_BASE_URL`, and `GALLERY_RCLONE_DEST`.

The production build removes `dist/media` after Vite copies `public/`, so the Worker deploy only uploads the app shell and `gallery.json`. Generated media stays in R2.

The app reads `/gallery.json` in the browser and renders all routes client-side:

- `/` root gallery
- `/trail` album gallery
- `/trail/01` media view inside an album
- `/desert-sunset` root media view

Static hosting should be configured with an SPA fallback to `index.html` so direct media and album URLs work.

## Album Metadata

Each directory can include an optional `index.json`:

```json
{
  "title": "Trail",
  "cover": "01.jpg",
  "display": "folder",
  "order": ["01.jpg", "02.jpg", "clip.mov"]
}
```

Directories inline into their parent by default while keeping their own filtered route, such as `/trail`.

Use `"display": "folder"` to show a directory as an album tile instead. For example, `2026-trail/index.json` can contain:

```json
{
  "title": "2026 Trail",
  "display": "folder"
}
```
