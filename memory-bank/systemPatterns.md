# System Patterns

## Architecture Overview

### Server Components with Server Actions
- Next.js App Router with server components
- Server actions for data operations
- Runtime file system access
- Dynamic page rendering

### File Structure
```
my-photo-blog/
├─ app/                # Next.js App Router
│  ├─ page.tsx        # Main gallery page
│  ├─ [id]/           # Dynamic image routes
│  └─ components/     # Shared components
├─ public/photos/     # Media files
├─ lib/               # Utilities
└─ scripts/          # Build scripts
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
- **Server Actions**
  - Direct file system access
  - Runtime metadata loading
  - Folder-based organization
  - Automatic file discovery

### 3. Routing Pattern
- **Simple Dynamic Routes**
  - Gallery page (/)
  - Media pages (/[id])
  - Clean URLs
  - Standard navigation

### 4. Component Architecture
- **Gallery Components**
  - Justified grid layout
  - Lazy loading containers
  - Media type handlers
  - Navigation components

### 5. Navigation Pattern
- **Lightbox Navigation**
  - Escape to grid view
  - Left/right arrow navigation
  - Click overlay to close
  - Hover-reveal controls

## Technical Patterns

### 1. Media Storage Pattern
- **Development Storage**
  ```
  public/photos/
  ├── [section-folders]/    # e.g. "2024-baja"
      ├── original.jpg      # Original files
      ├── original-thumb.jpg # Generated thumbnail
      ├── original-preview.mp4 # Generated video preview
      └── metadata.json     # Dimensions and metadata
  ```

- **Production Storage**
  - Images: Next/Image optimization on Vercel
  - Videos: Vercel Blob storage
  - Thumbnails/Previews: In git repository
  - Metadata: In git repository

### 2. Data Loading
```typescript
// Server action pattern
'use server'

export async function getMediaSections(): Promise<Section[]> {
  // Direct file system access
  const sections = await readSections();
  return sections;
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
- Standard page transitions
- Built-in Next.js caching
- Smooth animations
- Minimal client state

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

### 3. Lightbox Component
```typescript
interface LightboxProps {
  item: MediaItem;
  allItems: MediaItem[];
}
```

## Build Process Patterns

### 1. Development Flow
1. Add media to folders
2. Run thumbnail generation
3. Start development server
4. Media loads dynamically

### 2. Deployment Flow
1. Process all media
2. Deploy to Vercel
3. Server components handle dynamic loading
