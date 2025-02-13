import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

// Configure ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Configuration
const PHOTOS_DIR = 'public/photos';
const THUMBNAIL_WIDTH = 800;  // Increased from 400 to 800 for better quality
const THUMBNAIL_QUALITY = 85;  // Slightly increased quality
const VIDEO_PREVIEW_DURATION = 3; // seconds
const VIDEO_PREVIEW_SIZE = '480x?'; // height will maintain aspect ratio

// Supported file types
const SUPPORTED_IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.webp'];
const SUPPORTED_VIDEO_TYPES = ['.mp4', '.mov'];

interface MediaDimensions {
  width: number;
  height: number;
  aspectRatio: number;
}

interface SectionMetadata {
  images: {
    [filename: string]: MediaDimensions;
  };
}

interface ProcessingResult {
  success: boolean;
  error?: string;
  dimensions?: MediaDimensions;
}

/**
 * Process an image file to create an optimized thumbnail and extract dimensions
 */
async function processImage(filePath: string): Promise<ProcessingResult> {
  try {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const basename = path.basename(filePath, ext);

    // Skip if this is already a thumbnail
    if (basename.includes('-thumb')) {
      return { success: true };
    }

    const thumbPath = path.join(dir, `${basename}-thumb${ext}`);

    // Get image metadata
    const metadata = await sharp(filePath).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('Could not extract image dimensions');
    }

    const dimensions: MediaDimensions = {
      width: metadata.width,
      height: metadata.height,
      aspectRatio: metadata.width / metadata.height
    };

    // Skip thumbnail creation if it already exists
    if (!fs.existsSync(thumbPath)) {
      await sharp(filePath)
        .resize(THUMBNAIL_WIDTH, null, {
          withoutEnlargement: true,
          fit: 'inside'
        })
        .jpeg({ quality: THUMBNAIL_QUALITY })
        .toFile(thumbPath);

    }

    return { success: true, dimensions };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Process a video file to create a thumbnail and preview
 */
async function processVideo(filePath: string): Promise<ProcessingResult> {
  return new Promise((resolve) => {
    try {
      const dir = path.dirname(filePath);
      const ext = path.extname(filePath);
      const basename = path.basename(filePath, ext);
      const thumbPath = path.join(dir, `${basename}-thumb.jpg`);
      const previewPath = path.join(dir, `${basename}-preview.mp4`);

      // Skip if both thumbnail and preview already exist
      if (fs.existsSync(thumbPath) && fs.existsSync(previewPath)) {
        resolve({ success: true });
        return;
      }

      // Create thumbnail from video frame
      ffmpeg(filePath)
        .screenshots({
          timestamps: ['1'],
          filename: `${basename}-thumb.jpg`,
          folder: dir,
          size: '800x?'  // Match the new thumbnail width
        })
        .on('end', () => {
          // Create preview video
          ffmpeg(filePath)
            .duration(VIDEO_PREVIEW_DURATION)
            .size(VIDEO_PREVIEW_SIZE)
            .output(previewPath)
            .on('end', () => {
              resolve({ success: true });
            })
            .on('error', (err: Error) => {
              resolve({
                success: false,
                error: `Error creating preview: ${err.message}`
              });
            })
            .run();
        })
        .on('error', (err: Error) => {
          resolve({
            success: false,
            error: `Error creating thumbnail: ${err.message}`
          });
        });
    } catch (error) {
      resolve({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}

/**
 * Update metadata for a section directory
 */
async function updateSectionMetadata(dir: string, filename: string, dimensions: MediaDimensions) {
  const metadataPath = path.join(dir, 'metadata.json');
  let metadata: SectionMetadata = { images: {} };

  // Skip if this is a thumbnail or preview
  if (filename.includes('-thumb') || filename.includes('-preview')) {
    return;
  }

  // Read existing metadata if it exists
  if (fs.existsSync(metadataPath)) {
    try {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    } catch (error) {
    }
  }

  // Update metadata
  metadata.images[filename] = dimensions;

  // Write updated metadata
  try {
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  } catch (error) {
  }
}

/**
 * Process all media files in a directory
 */
async function processDirectory(dir: string) {
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // Recursively process subdirectories
      await processDirectory(fullPath);
    } else {
      const ext = path.extname(item).toLowerCase();
      
      if (SUPPORTED_IMAGE_TYPES.includes(ext)) {
        const result = await processImage(fullPath);
        if (!result.success) {
        } else if (result.dimensions) {
          await updateSectionMetadata(dir, item, result.dimensions);
        }
      } else if (SUPPORTED_VIDEO_TYPES.includes(ext)) {
        const result = await processVideo(fullPath);
        if (!result.success) {
        }
      }
    }
  }
}

/**
 * Clean up orphaned processed files and metadata
 */
function cleanupOrphaned(dir: string) {
  const items = fs.readdirSync(dir);
  const metadataPath = path.join(dir, 'metadata.json');
  let metadata: SectionMetadata | undefined;

  // Read metadata if it exists
  if (fs.existsSync(metadataPath)) {
    try {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    } catch (error) {
    }
  }

  // Track if metadata needs updating
  let metadataChanged = false;

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // Recursively clean subdirectories
      cleanupOrphaned(fullPath);
    } else {
      const basename = path.basename(item);
      const ext = path.extname(item);

      // Handle thumbnails and previews
      if (basename.includes('-thumb') || basename.includes('-preview')) {
        // Get original filename by removing -thumb/-preview suffix
        const originalBasename = basename
          .replace('-thumb', '')
          .replace('-preview', '');
        
        // For thumbnails/previews, check if original exists with any supported extension
        const possibleExts = [...SUPPORTED_IMAGE_TYPES, ...SUPPORTED_VIDEO_TYPES];
        const originalExists = possibleExts.some(originalExt => 
          fs.existsSync(path.join(dir, originalBasename.replace(ext, originalExt)))
        );

        if (!originalExists) {
          // Delete orphaned thumbnail/preview
          fs.unlinkSync(fullPath);
        }
      }
      
      // Handle metadata cleanup
      if (metadata?.images && !basename.includes('-thumb') && !basename.includes('-preview')) {
        // Check if file exists for metadata entry
        if (metadata.images[basename] && !fs.existsSync(fullPath)) {
          delete metadata.images[basename];
          metadataChanged = true;
        }
      }
    }
  }

  // Update metadata file if changes were made
  if (metadataChanged && metadata) {
    try {
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    } catch (error) {
    }
  }
}

// Main execution
async function main() {
  
  try {
    await processDirectory(PHOTOS_DIR);
    cleanupOrphaned(PHOTOS_DIR);
  } catch (error) {
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  process.exit(1);
});
