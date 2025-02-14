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
├─ photos/            # Original media files
├─ public/photos/     # Web-optimized assets
├─ lib/               # Utilities
└─ scripts/          # Build scripts
```

## Core Design Patterns

### 1. Media Processing Pattern
- **Pre-Build Processing**
  - Automated thumbnail generation (800px width)
  - Video preview generation (3s, 480p)
  - Integrated with build pipeline
  - Sharp for image optimization (85% quality)
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

#### Source Organization
```
~/Pictures/web/           # Default source directory (configurable)
├── [section-folders]/    # e.g. "2024-baja"
    ├── photo1.jpg       # Original images
    └── video1.mp4       # Original videos
```

#### Processing Pipeline
```
/tmp/photos-processing/  # Temporary processing directory
├── [content-hash].jpg   # Original with content-based name
├── [hash]-thumb.jpg     # Generated thumbnail
├── [hash]-preview.mp4   # Generated video preview
└── metadata.json        # Temporary metadata state
```

#### Blob Storage Structure
```
photos/                 # Root blob container
├── originals/         # Full-size media
│   ├── YYYY/MM/      # Date-based organization
│   └── [hash].ext    # Content-addressed storage
├── thumbs/           # Thumbnail images
│   ├── YYYY/MM/
│   └── [hash]-thumb.jpg
├── previews/         # Video previews
│   ├── YYYY/MM/
│   └── [hash]-preview.mp4
└── metadata/         # Metadata storage
    ├── latest.json              # Current state
    └── metadata-[timestamp].json # Version history
```

### 2. Content Addressing Pattern

#### Hash Generation
```typescript
async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
```

#### Deduplication Strategy
```typescript
function findExistingByHash(
  hash: string,
  metadata: { sections: { [key: string]: SectionMetadata } }
): { section: string; filename: string; metadata: MediaMetadata } | undefined {
  for (const [section, sectionData] of Object.entries(metadata.sections)) {
    for (const [filename, itemData] of Object.entries(sectionData.images)) {
      if (itemData.contentHash === hash) {
        return { section, filename, metadata: itemData };
      }
    }
  }
  return undefined;
}
```

### 3. Metadata Management Pattern

#### Section-Based Organization
```typescript
interface SectionMetadata {
  images: {
    [filename: string]: MediaMetadata;
  };
}

interface MediaMetadata {
  width: number;
  height: number;
  aspectRatio: number;
  originalFilename: string;
  type: 'image' | 'video';
  contentHash: string;
  urls: {
    original: string;
    thumb: string;
    preview?: string;
  };
}
```

#### State Management
```typescript
// In-memory state during processing
let processingState: { 
  sections: { 
    [key: string]: SectionMetadata 
  } 
} = { sections: {} };

// Initialize once at start
function initializeProcessingState() {
  processingState = { sections: {} };
}

// Update per file
function updateMetadata(section: string, filename: string, metadata: MediaMetadata) {
  if (!processingState.sections[section]) {
    processingState.sections[section] = { images: {} };
  }
  processingState.sections[section].images[filename] = metadata;
}
```

#### Version Control
- Timestamp-based versioning for metadata files
- Latest.json always points to current state
- Historical versions preserved with ISO timestamp names

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
    .resize(800, null, {
      withoutEnlargement: true,
      fit: 'inside'
    })
    .jpeg({ quality: 85 })
    .toFile(thumbPath);
}

// Video processing
async function processVideo(filePath: string): Promise<ProcessingResult> {
  // Extract thumbnail at 1s
  await ffmpeg(filePath).screenshots({
    timestamps: ['1'],
    filename: `${basename}-thumb.jpg`,
    size: '800x?'
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

The gallery uses a sophisticated layout engine that maintains a consistent desktop-like experience across all devices:

```typescript
// Configuration pattern
interface GalleryConfig {
  horizontalSpacing: number;  // Spacing between photos in a row
  verticalSpacing: number;    // Spacing between rows
  targetRowHeight: number;    // Target height for each row
  desktopWidth: number;      // Fixed desktop layout width (1200px)
}

// Layout engine pattern
interface LayoutOptions {
  targetRowHeight: number;
  spacing: number;
  tolerance: number;
}

// Scale factor hook for responsive scaling
function useScaleFactor() {
  const [scale, setScale] = useState(1);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : DESKTOP_WIDTH
  );

  // Calculate scale based on available width
  useEffect(() => {
    const availableWidth = windowWidth - PADDING;
    if (availableWidth >= DESKTOP_WIDTH) {
      setScale(1);
    } else {
      const calculatedScale = availableWidth / DESKTOP_WIDTH;
      setScale(Math.max(calculatedScale, MIN_SCALE));
    }
  }, [windowWidth]);

  return scale;
}

// Layout calculation pattern
function layoutRow(items: MediaItem[], options: LayoutOptions): LayoutRow {
  // 1. Calculate total aspect ratio
  const totalAspectRatio = items.reduce((sum, item) => 
    sum + (item.dimensions?.aspectRatio || 1), 0);

  // 2. Calculate available width accounting for spacing
  const availableWidth = spacing > 0 
    ? DESKTOP_WIDTH - ((items.length - 1) * spacing)
    : DESKTOP_WIDTH;

  // 3. Calculate base dimensions
  const rowHeight = availableWidth / totalAspectRatio;
  
  // 4. Scale widths to exactly fill container
  const layoutItems = items.map(item => ({
    ...item,
    width: rowHeight * (item.dimensions?.aspectRatio || 1)
  }));
  
  // 5. Apply proportional scaling for exact container width
  const totalWidth = layoutItems.reduce((sum, item) => sum + item.width, 0);
  const scaleFactor = DESKTOP_WIDTH / totalWidth;
  layoutItems.forEach(item => item.width *= scaleFactor);

  return { items: layoutItems, height: rowHeight };
}

// Responsive container styles
const styles = {
  wrapper: {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    overflow: 'hidden',
    opacity: windowWidth ? 1 : 0,
    transition: 'opacity 0.2s ease-in'
  },
  container: {
    width: `${DESKTOP_WIDTH}px`,
    transform: `scale(${scale})`,
    transformOrigin: 'center top',
    willChange: 'transform',
    transition: 'transform 0.2s ease-out'
  }
};
```

Key features:
- Uses fixed desktop width (1200px) for layout calculations
- Scales entire layout proportionally on smaller screens
- Maintains consistent visual rhythm across devices
- Smooth transitions for scaling and opacity changes
- Proper SSR handling with opacity transitions
- Performance optimized with willChange and debounced updates

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
