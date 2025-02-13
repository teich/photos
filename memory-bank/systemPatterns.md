# System Patterns

## Architecture Overview

### Static Site Generation
- Next.js for static site generation
- No runtime database requirements
- Build-time data processing
- Pre-rendered pages for optimal performance

### File Structure
```
my-photo-blog/
├─ pages/              # Next.js pages
├─ data/              # YAML metadata
├─ public/photos/     # Media files
├─ lib/               # Utilities
└─ scripts/           # Build scripts
```

## Core Design Patterns

### 1. Media Processing Pattern
- **Pre-Build Processing**
  - Automated thumbnail generation (400px width)
  - Video preview generation (3s, 480p)
  - Integrated with build pipeline
  - Sharp for image optimization (80% quality)
  - FFmpeg for video processing
  - Suffix-based naming (-thumb, -preview)
  - Orphaned file cleanup
  - Progress reporting and error handling

### 2. Data Management Pattern
- **Folder-Level Metadata**
  - YAML files for section metadata
  - No individual file metadata
  - Automated file enumeration
  - Build-time data aggregation

### 3. Routing Pattern
- **Dynamic Routes**
  - Gallery page (/)
  - Detail pages (/photo/[slug])
  - Static path generation
  - SEO-friendly URLs

### 4. Component Architecture
- **Gallery Components**
  - Masonry grid layout
  - Lazy loading containers
  - Media type handlers
  - Navigation components

### 5. Navigation Pattern
- **Responsive Navigation**
  - Desktop: Hover-reveal nav
  - Mobile: Hamburger menu
  - Section-based organization
  - Smooth scroll anchors

## Technical Patterns

### 1. Data Loading
```typescript
// Build-time data loading pattern
export async function getStaticProps() {
  const mediaItems = loadMediaItems();
  return { props: { mediaItems } };
}
```

### 2. Media Optimization
```typescript
// Media processing patterns
interface ProcessingResult {
  success: boolean;
  error?: string;
}

// Image processing
async function processImage(filePath: string): Promise<ProcessingResult> {
  return sharp(filePath)
    .resize(400, null, {
      withoutEnlargement: true,
      fit: 'inside'
    })
    .jpeg({ quality: 80 })
    .toFile(thumbPath);
}

// Video processing
async function processVideo(filePath: string): Promise<ProcessingResult> {
  // Extract thumbnail at 1s
  await ffmpeg(filePath).screenshots({
    timestamps: ['1'],
    filename: `${basename}-thumb.jpg`,
    size: '400x?'
  });
  
  // Generate preview
  await ffmpeg(filePath)
    .duration(3)
    .size('480x?')
    .output(previewPath);
}
```

### 3. Route Generation
```typescript
// Dynamic route pattern
export async function getStaticPaths() {
  const items = loadMediaItems();
  return {
    paths: items.map(item => ({
      params: { slug: item.slug }
    })),
    fallback: false
  };
}
```

## Performance Patterns

### 1. Lazy Loading
- IntersectionObserver for media loading
- Progressive image loading
- Deferred video loading
- Viewport-based rendering

### 2. Resource Optimization
- Thumbnail generation
- Video preview creation
- Responsive image sizing
- Format optimization

### 3. Navigation Performance
- Client-side navigation
- Preloaded section data
- Smooth scroll implementation
- Minimal initial payload

## Component Patterns

### 1. Media Components
```typescript
interface MediaProps {
  item: MediaItem;
  loading: "lazy" | "eager";
  priority?: boolean;
}
```

### 2. Layout Components

#### Justified Grid Layout
```typescript
// Configuration pattern
interface GalleryConfig {
  horizontalSpacing: number;  // Spacing between photos in a row
  verticalSpacing: number;    // Spacing between rows
  targetRowHeight: number;    // Target height for each row
}

// Layout engine pattern
interface LayoutOptions {
  containerWidth: number;
  targetRowHeight: number;
  spacing: number;
  tolerance: number;
}

// Layout calculation pattern
function layoutRow(items: MediaItem[], options: LayoutOptions): LayoutRow {
  // 1. Calculate total aspect ratio
  const totalAspectRatio = items.reduce((sum, item) => 
    sum + (item.dimensions?.aspectRatio || 1), 0);

  // 2. Calculate available width accounting for spacing
  const availableWidth = spacing > 0 
    ? containerWidth - ((items.length - 1) * spacing)
    : containerWidth;

  // 3. Calculate base dimensions
  const rowHeight = availableWidth / totalAspectRatio;
  
  // 4. Scale widths to exactly fill container
  const layoutItems = items.map(item => ({
    ...item,
    width: rowHeight * (item.dimensions?.aspectRatio || 1)
  }));
  
  // 5. Apply proportional scaling for exact container width
  const totalWidth = layoutItems.reduce((sum, item) => sum + item.width, 0);
  const scaleFactor = containerWidth / totalWidth;
  layoutItems.forEach(item => item.width *= scaleFactor);

  return { items: layoutItems, height: rowHeight };
}
```

#### Spacing Implementation
```typescript
// CSS-based spacing pattern using gap
<div style={{ display: 'flex', flexDirection: 'column', gap: `${verticalSpacing}px` }}>
  {rows.map(row => (
    <div style={{ display: 'flex', gap: `${horizontalSpacing}px` }}>
      {/* Row items */}
    </div>
  ))}
</div>
```

### 3. Navigation Components
```typescript
interface NavProps {
  sections: Section[];
  currentSection?: string;
}
```

## Build Process Patterns

### 1. Development Flow
1. Add media to folders
2. Update section YAML if needed
3. Run thumbnail generation
4. Build static site

### 2. Deployment Flow
1. Process all media
2. Generate static pages
3. Deploy static assets
4. Update CDN if used
