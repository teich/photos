# Plan for Building a Personal Photo/Video Blog

Below is a comprehensive plan in **raw Markdown** format. It addresses:

- Generating a mostly static site
- No individual YAML entry per file (only folder-level YAML)
- Handling large images (10MB) and large videos (~350MB)
- Creating a gallery page and direct `/photo/[slug]` routes
- Ensuring lazy loading and good performance
- Adding a minimal top navigation with a mobile-friendly hamburger menu

---

## 1. Project Overview

1. **Goal**: A single scrollable gallery page that displays ~500 images/videos in a masonry grid.  
2. **Navigation**:  
   - Hover-over or subtle top nav on desktop  
   - Hamburger menu on mobile  
   - Links jump to specific sections/folders (e.g., "Winter 2024 Trip")  
3. **Detail Page**:  
   - `/photo/[slug]` URL for direct linking and fullscreen display of a single item  
4. **Performance**:  
   - Thumbnails/previews for the main gallery  
   - Lazy loading to avoid fetching everything at once  
   - Full-res only loaded on the detail page  
5. **No Database**:  
   - Store minimal metadata in folder-level YAML  
   - Automatically enumerate files in each folder  
6. **Build Process**:  
   - Next.js for static generation  
   - A local script to generate thumbnails and small video previews

---

## 2. File & Data Organization

### 2.1 Folder Structure

```
my-photo-blog/
├─ pages/
│   ├─ index.tsx           // or .jsx
│   └─ photo/
│       └─ [slug].tsx      // or .jsx
├─ data/
│   ├─ winter-2024-trip.yaml
│   ├─ summer-2023.yaml
│   └─ ...                 // one YAML file per folder/section
├─ public/
│   └─ photos/
│       ├─ winter-2024-trip/
│       │   ├─ big-photo-1.jpg
│       │   ├─ big-video-1.mp4
│       │   ├─ ...
│       ├─ summer-2023/
│       └─ ...
├─ lib/
│   └─ loadMediaFolders.ts // utility to parse YAML & enumerate files
├─ scripts/
│   └─ generate-thumbs.js  // script to create thumbnails/previews
└─ ...
```

### 2.2 Folder-Level YAML

Each **folder** (like `winter-2024-trip`) has one YAML file, e.g. `winter-2024-trip.yaml`:

```yaml
title: "Winter 2024 Trip"
folderName: "winter-2024-trip"
description: "Photos and videos from January 2024..."
# You could add dates or tags if you like.
```

- No per-file entries. Instead, we rely on enumerating the actual files in public/photos/winter-2024-trip/.
- This YAML simply provides:
  - A title for the section (used in the nav)
  - A folderName to match the directory
  - (Optional) any special section-level data or grouping

## 3. Pre-Build Scripting (Thumbnail/Preview Generation)

### 3.1 Images
- Use a Node script (scripts/generate-thumbs.js) with Sharp.
- For each image in public/photos/[folder]/, generate a thumbnail named like filename-thumb.jpg.
- Example logic:
  - If big-photo-1.jpg exists, generate big-photo-1-thumb.jpg at, say, 800px wide.

### 3.2 Videos
- Use FFmpeg in the same script to generate low-res previews.
- For each .mp4 in public/photos/[folder]/, create something like filename-preview.mp4.
- Greatly reduce bitrate and resolution to ensure quick loading in the gallery.

### 3.3 YAML Notation
- You don't need to write new YAML entries, but after generating thumbnails, you might optionally update the folder's YAML if you need to track special cases.
- Otherwise, you can rely on enumerating public/photos/[folder]/ at build time to discover both the original and -thumb (or -preview) versions.

## 4. Next.js Data Loading & Structure

### 4.1 Data Loading Utility

Create a helper in lib/loadMediaFolders.ts that:
1. Reads each *.yaml file in data/.
2. Returns an array of folder-level objects, e.g.:

```typescript
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

interface FolderMeta {
  title: string;
  folderName: string;
  description?: string;
}

export function loadFolderMetas(): FolderMeta[] {
  const dataDir = path.join(process.cwd(), 'data');
  const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.yaml'));

  const metas: FolderMeta[] = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
    const parsed = yaml.load(content) as FolderMeta;
    metas.push(parsed);
  }
  return metas;
}
```

Then, for each folder, enumerate its files in public/photos/[folder]/ to build an array of items:

```typescript
import fs from 'fs';
import path from 'path';

export function loadMediaItems() {
  const folders = loadFolderMetas();
  let allItems = [];

  folders.forEach(folder => {
    const dir = path.join(process.cwd(), 'public', 'photos', folder.folderName);
    const files = fs.readdirSync(dir);

    // Filter out thumbs or previews if you want to treat them differently
    // Or store them in a dictionary for reference
    const mainFiles = files.filter(f =>
      !f.includes('-thumb') && !f.includes('-preview')
    );

    mainFiles.forEach(fileName => {
      // Build a slug from folderName + fileName, e.g. "winter-2024-trip_big-photo-1"
      const baseSlug = fileName.split('.').slice(0, -1).join('.'); // "big-photo-1"
      const slug = `${folder.folderName}-${baseSlug}`;

      // Determine if it's an image or video by extension
      const ext = path.extname(fileName).toLowerCase();
      const type = (ext === '.mp4' || ext === '.mov') ? 'video' : 'image';

      // Derive the thumbnail/preview name
      const thumbName = fileName.replace(ext, `-thumb${ext}`);
      const previewName = fileName.replace(ext, `-preview${ext}`);

      // Create an object with relevant info
      const item = {
        slug,
        folder: folder.folderName,
        sectionTitle: folder.title,
        fileName,         // big-photo-1.jpg
        thumbName,        // big-photo-1-thumb.jpg
        previewName,      // big-photo-1-preview.mp4 (for videos)
        type
      };

      allItems.push(item);
    });
  });

  return allItems;
}
```

### 4.2 pages/index.tsx

#### Static Props

```typescript
// pages/index.tsx
import { loadMediaItems } from '../lib/loadMediaFolders';

export async function getStaticProps() {
  const mediaItems = loadMediaItems();
  // Possibly sort or group them by folder
  return { props: { mediaItems } };
}
```

#### Rendering the Gallery
- Use a masonry layout.
- For each mediaItems entry:
  - If type === "image", display <img src="/photos/[folder]/[thumbName]" />.
  - If type === "video", display a <video src="/photos/[folder]/[previewName]" /> or something similar.
  - Wrap them in lazy loading (or let the browser handle loading="lazy" for images). For videos, consider using IntersectionObserver to set the src only when in view.
- Link to Detail Page
  - Use <Link href={/photo/${item.slug}}>...</Link> around each thumbnail so that clicking goes to pages/photo/[slug].tsx.

### 4.3 pages/photo/[slug].tsx

#### getStaticPaths

```typescript
import { loadMediaItems } from '../../lib/loadMediaFolders';

export async function getStaticPaths() {
  const mediaItems = loadMediaItems();
  const paths = mediaItems.map(item => ({
    params: { slug: item.slug },
  }));
  return { paths, fallback: false };
}
```

#### getStaticProps

```typescript
export async function getStaticProps({ params }) {
  const mediaItems = loadMediaItems();
  const item = mediaItems.find(m => m.slug === params.slug);

  return {
    props: { item },
  };
}
```

#### Render Full-Res
- If type === "image", show <img src="/photos/[folder]/[fileName]" />.
- If type === "video", show <video src="/photos/[folder]/[fileName]" controls autoplay />.
- Provide a back button or link to / or maintain a minimal header.

## 5. Lazy Loading & Performance

### 5.1 Large Images
- 10MB is quite big, so rely on the generated -thumb.jpg for the main gallery.
- Only load the full-res file on the detail page.

### 5.2 Large Videos
- For a 350MB file, ensure a lower-bitrate -preview.mp4 for the gallery.
- On the detail page, load the large file. Consider a "play" button so it doesn't auto-download.

### 5.3 IntersectionObserver
- Optionally, you can load <img src="..." /> only when the user scrolls near that item.
- For 500 items, a simple lazy load might suffice, but if performance is an issue, consider react-virtualized or react-window.

## 6. Navigation & Mobile Menu

### 6.1 Desktop Hover Nav
- A fixed bar at the top that is hidden by default:

```css
.nav-bar {
  position: fixed;
  top: 0; left: 0; right: 0;
  transform: translateY(-100%);
  transition: transform 0.3s ease;
  background-color: rgba(0, 0, 0, 0.8);
  z-index: 9999;
}
.nav-bar.show {
  transform: translateY(0);
}
```

- You can show it when the user hovers near the top, or toggles a state in React.

### 6.2 Mobile Hamburger
- At small breakpoints, use a hamburger icon. On click, show a vertical menu with links to each folder's section:
  - E.g., "Winter 2024 Trip," "Summer 2023," etc.
  - When a link is clicked, jump to /#winter-2024-trip or so.

## 7. CSS Requirements to Generate

You can provide the following specs to an AI code generator for CSS:

### 7.1 Masonry Layout
- 2–3 columns on desktop, 1–2 on mobile.
- Items have variable height, minimal gap.
- Use the CSS columns approach or a Flex-based library.

### 7.2 Images & Videos
- Thumbnails: max-width: 100%, maintain aspect ratio.
- Videos: max-width: 100%; max-height: some limit;

### 7.3 Navbar
- Hover-to-reveal for desktop, hamburger for mobile.

### 7.4 Detail Page
- Fullscreen or near-fullscreen background, item centered.
- A small close/back button in top-left or top-right.

## 8. Deployment & Hosting Considerations

### 8.1 Build & Export
- Run npm run build (or yarn build), then npm run export if you want a purely static export.
- If you rely on Next Image Optimization, that might require a server environment (like Vercel). But since we're generating our own thumbnails, we can skip Next's built-in image optimization if we prefer purely static hosting.

### 8.2 Large Files
- 500 items of ~10MB each plus multiple large videos can be bandwidth-heavy. You might consider hosting these on a CDN (e.g. AWS S3 + CloudFront) for better performance.

### 8.3 Link Sharing
- /photo/[slug] is fully static, so you can share that link. The slug is auto-generated from the folder name + file name.

### 8.4 No Database
- Everything is enumerated from the folder structure and minimal folder-level YAML, so you're free from maintaining any separate database.

## 9. Summary

1. Folder-Level YAML: Store only high-level metadata (title, etc.).
2. Enumerate Media: Build-time script scans each folder to find original and thumbnail/preview files.
3. Generate Thumbnails: Sharp and FFMPEG handle downsizing.
4. Gallery Page: Display all items in a lazy-loaded masonry grid, linking to detail routes.
5. Detail Route: /photo/[slug] for sharing or fullscreen.
6. Navigation: Subtle desktop nav + mobile hamburger.
7. Deployment: SSG via Next.js; optionally host large assets on a CDN.

This approach keeps everything static, no database, fast loading with thumbnails/previews, and provides a direct link for each photo or video.
