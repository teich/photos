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
npm run process-media -- --source ~/Pictures/gallery-source
npm run build
```

The app reads `/gallery.json` in the browser and renders all routes client-side:

- `/` root gallery
- `/trail` album gallery
- `/trail/01` media view inside an album
- `/desert-sunset` root media view

Static hosting should be configured with an SPA fallback to `index.html` so direct media and album URLs work.
