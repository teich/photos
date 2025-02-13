# Technical Context

## Development Stack

### Core Technologies
- **Next.js**: Static site generation framework
- **TypeScript**: Type-safe development
- **React**: UI component library
- **TailwindCSS**: Utility-first styling

### Media Processing
- **Sharp**: Image processing and optimization
- **FFmpeg**: Video processing and preview generation
- **js-yaml**: YAML parsing for metadata

### Build Tools
- **Node.js**: Runtime environment
- **npm/yarn**: Package management
- **ESLint**: Code quality
- **Prettier**: Code formatting

## Development Setup

### Prerequisites
```bash
# Required software
- Node.js (v18+)
- FFmpeg (for video processing)
- Git (for version control)
```

### Project Installation
```bash
git clone [repository]
cd my-photo-blog
npm install
```

### Development Commands
```bash
# Start development server
npm run dev

# Generate thumbnails/previews
npm run process-media

# Build for production
npm run build

# Export static site
npm run export
```

## Technical Requirements

### Performance Targets
- Initial page load < 2s
- Time to Interactive < 3s
- Lazy loading for media
- Optimized asset delivery

### Browser Support
- Modern browsers (last 2 versions)
- Mobile browsers
- Progressive enhancement

### Media Specifications
- Images: Up to 10MB
- Videos: Up to 350MB
- Supported formats:
  - Images: jpg, png, webp
  - Videos: mp4, mov

## Dependencies

### Production Dependencies
```json
{
  "next": "^14.0.0",
  "react": "^18.0.0",
  "react-dom": "^18.0.0",
  "sharp": "^0.32.0",
  "js-yaml": "^4.1.0",
  "tailwindcss": "^3.0.0"
}
```

### Development Dependencies
```json
{
  "@types/node": "^18.0.0",
  "@types/react": "^18.0.0",
  "typescript": "^5.0.0",
  "eslint": "^8.0.0",
  "prettier": "^3.0.0"
}
```

## Configuration Files

### Next.js Config
```typescript
// next.config.ts
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true
  }
};

export default nextConfig;
```

### TypeScript Config
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "strict": true,
    "jsx": "preserve"
  }
}
```

### Tailwind Config
```typescript
// tailwind.config.ts
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {}
  }
};
```

## Development Constraints

### Build Process
- Static site generation only
- No server-side operations
- Pre-build media processing
- Automated optimization

### Data Management
- File-based content organization
- YAML for metadata
- No database requirements
- Build-time data aggregation

### Asset Handling
- Automated thumbnail generation
- Video preview creation
- Optimized delivery strategy
- CDN-friendly structure

## Deployment Requirements

### Static Hosting
- Any static file host
- CDN support recommended
- No server requirements
- Simple cache configuration

### Environment Variables
- None required in production
- Development-only processing flags
- Build-time configuration

### Build Artifacts
- Static HTML/CSS/JS
- Optimized media assets
- Pre-generated thumbnails
- Asset manifests
