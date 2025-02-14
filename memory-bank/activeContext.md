# Active Context

## Current Focus

### Project Phase: Blob Storage Migration
We are migrating all media to Vercel Blob storage for improved scalability and maintainability. The plan includes:

1. **Media Storage Strategy**
   - Move all media (images and videos) to Vercel Blob
   - Remove media files from git completely
   - Use content-based hashing for idempotent uploads
   - Single root-level metadata.json

2. **Processing Pipeline**
   ```typescript
   photos/[section]/           → process-media → /tmp/processed/[section]/ → upload to blob → cleanup /tmp
   original.{jpg,mp4}         →  ┌─ original.{jpg,mp4} → blob://[hash]
                                └─ thumb.{jpg} → blob://[hash]
                                └─ preview.mp4 (for videos) → blob://[hash]
   ```

3. **Development Workflow**
   - Process media with npm run process-media
   - Use /tmp for intermediate processing
   - Upload to blob with content hashing
   - Clean build process (npm run build)

## Recent Decisions

### Architecture Decisions
1. **Storage Structure**
   - Remove /public/photos completely
   - Use /tmp for intermediate processing
   - Store all media in Vercel Blob
   - Single metadata.json at root

2. **Data Management**
   ```typescript
   {
     sections: {
       [sectionName: string]: {
         items: {
           id: string,
           originalUrl: string,  // blob URL
           thumbUrl: string,     // blob URL
           previewUrl?: string,  // blob URL for videos
           dimensions: {
             width: number,
             height: number,
             aspectRatio: number
           },
           type: 'image' | 'video'
         }[]
       }
     }
   }
   ```

3. **Build Process**
   ```mermaid
   graph TD
       A[Add media to /photos] --> B[npm run process-media]
       B --> C[Process to /tmp]
       C --> D[Upload to blob]
       D --> E[Generate metadata.json]
       E --> F[Cleanup /tmp]
       F --> G[npm run build]
       G --> H[Deploy to Vercel]
   ```
## Active Considerations

### Implementation Strategy
1. **Media Processing**
   - Content-based hashing for idempotency
   - Efficient blob uploads
   - Progress reporting
   - Error handling

2. **Performance**
   - Blob URL caching
   - Optimized metadata loading
   - Efficient media delivery
   - CDN integration

### Development Flow
1. **Content Updates**
   - Simplified media processing
   - Automated blob uploads
   - Clean build process
   - Error recovery

2. **Build Pipeline**
   - Separate media processing from build
   - Efficient temporary storage
   - Reliable cleanup
   - Progress monitoring

## Next Steps

### Immediate Tasks
1. ✓ **Script Updates**
   - ✓ Modify process-media.ts for blob uploads
   - ✓ Implement content hashing
   - ✓ Add progress reporting
   - ✓ Handle errors gracefully

2. **Testing & Validation**
   - Test with sample images
   - Test with sample videos
   - Verify metadata structure
   - Check blob URLs

2. **Code Changes**
   - Update lib/media.ts for blob URLs
   - Modify Gallery/Lightbox components
   - Implement URL caching
   - Update type definitions

3. **Infrastructure**
   - Configure Vercel Blob storage
   - Set up temporary storage
   - Update build process
   - Test deployment flow

## Implementation Notes

### Current Priorities
1. Implement blob storage migration
2. Update media processing
3. Modify component code
4. Test and validate changes

### Known Constraints
1. Build process separation
2. ✓ Temporary storage management (using /tmp)
3. ✓ Idempotent processing (using content hashing)
4. ✓ Error handling requirements

### Implementation Progress
1. **Completed**
   - Blob storage configuration
   - Content-based hashing
   - Temporary directory management
   - Progress reporting
   - Error handling
   - Metadata structure
   - Media processing script
   - Media library updates

2. **Testing Setup**
   - test-media.ts script for validating:
     - Section loading
     - Media item retrieval
     - Metadata structure
     - Blob URL access
     - Content hashing
   - Progress reporting in process-media.ts
   - Temporary file cleanup
   - Error handling validation

3. **In Progress**
   - Testing and validation
   - Component updates
   - URL caching strategy

4. **Next Up**
   - Run test suite with sample media
   - Modify Gallery/Lightbox components
   - Implement URL caching
   - Test deployment flow

### Testing Strategy
1. **Media Processing**
   ```bash
   # Process media files
   npm run process-media

   # Validate results
   npm run test-media
   ```

2. **Validation Points**
   - Metadata structure
   - Blob URL accessibility
   - Content hash verification
   - Section organization
   - Thumbnail generation
   - Video preview creation
