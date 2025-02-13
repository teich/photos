import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import exifReader from 'exif-reader';

interface ExifData {
  Photo?: {
    DateTimeOriginal?: string;
  };
  Image?: {
    DateTime?: string;
  };
}

// Configure ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Configuration
const ORIGINALS_DIR = 'photos';  // Source directory for original files
const PUBLIC_DIR = 'public/photos';  // Destination directory for web assets
const THUMBNAIL_WIDTH = 800;
const THUMBNAIL_QUALITY = 85;
const VIDEO_PREVIEW_DURATION = 3; // seconds
const VIDEO_PREVIEW_SIZE = '480x?'; // height will maintain aspect ratio

// Supported file types
const SUPPORTED_IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.webp'];
const SUPPORTED_VIDEO_TYPES = ['.mp4', '.mov'];

interface MediaMetadata {
  width: number;
  height: number;
  aspectRatio: number;
  originalFilename: string;
}

interface SectionMetadata {
  images: {
    [filename: string]: MediaMetadata;
  };
}

interface ProcessingResult {
  success: boolean;
  error?: string;
  dimensions?: MediaMetadata;
  newFilename?: string;
}

/**
 * Generate a standardized filename in YYYY-MM-DD-SERIAL format
 */
async function generateStandardFilename(
  sourcePath: string,
  destDir: string,
  ext: string
): Promise<string> {
  // Get date from EXIF data or fallback to file creation time
  let dateStr: string;
  try {
    const metadata = await sharp(sourcePath).metadata();
    
    // Try to get the capture date from EXIF data
    if (metadata.exif) {
      try {
        // Parse EXIF data using exif-reader
        const exifData = exifReader(metadata.exif) as ExifData;
        
        // Get DateTimeOriginal first, then DateTime as fallback
        const captureDate = exifData.Photo?.DateTimeOriginal || exifData.Image?.DateTime;
        
        if (captureDate) {
          // Parse the ISO date string
          const date = new Date(captureDate);
          // Format as YYYY-MM-DD-HHMMSS
          dateStr = date.toISOString()
            .replace('T', '-')
            .replace(/:/g, '')
            .split('.')[0];
          console.log(`Using EXIF capture date: ${dateStr}`);
        } else {
          throw new Error('No capture date found in EXIF');
        }
      } catch (exifError) {
        console.log('Error parsing EXIF:', exifError);
        // Fallback to file creation time
        const stats = fs.statSync(sourcePath);
        const date = stats.birthtime;
        dateStr = date.toISOString()
          .replace('T', '-')
          .replace(/:/g, '')
          .split('.')[0];
        console.log(`EXIF parse error, using file creation time: ${dateStr}`);
      }
    } else {
      // No EXIF data, use file creation time
      const stats = fs.statSync(sourcePath);
      const date = stats.birthtime;
      dateStr = date.toISOString()
        .replace('T', '-')
        .replace(/:/g, '')
        .split('.')[0];
      console.log(`No EXIF data found, using file creation time: ${dateStr}`);
    }
  } catch (error) {
    // If all else fails, use current date
    const date = new Date();
    dateStr = date.toISOString()
      .replace('T', '-')
      .replace(/:/g, '')
      .split('.')[0];
    console.log(`Error getting date, using current time: ${dateStr}`);
    console.error('Date extraction error:', error);
  }

  // Find existing files with the same timestamp to determine serial number
  const files = fs.readdirSync(destDir);
  const existingSerials = files
    .filter(f => f.startsWith(dateStr))
    .map(f => {
      const match = f.match(new RegExp(`${dateStr}-(\\d+)`));
      return match ? parseInt(match[1]) : 0;
    });

  // Get the next available serial number
  const serial = existingSerials.length > 0 
    ? Math.max(...existingSerials) + 1 
    : 1;

  // Format serial as padded number (001, 002, etc.)
  const serialStr = serial.toString().padStart(3, '0');

  return `${dateStr}-${serialStr}${ext}`;
}

/**
 * Ensure directory exists, create if it doesn't
 */
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Process an image file to create web assets
 */
async function processImage(sourcePath: string, destDir: string, newFilename: string): Promise<ProcessingResult> {
  try {
    const ext = path.extname(sourcePath);
    const originalBasename = path.basename(sourcePath, ext);
    
    // Skip if this is already a thumbnail
    if (originalBasename.includes('-thumb')) {
      return { success: true };
    }

    const newBasename = path.basename(newFilename, ext);

    // Create destination paths
    const fullSizePath = path.join(destDir, newFilename);
    const thumbPath = path.join(destDir, `${newBasename}-thumb.jpg`);

    // Get image metadata
    const metadata = await sharp(sourcePath).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('Could not extract image dimensions');
    }

    const dimensions: MediaMetadata = {
      width: metadata.width,
      height: metadata.height,
      aspectRatio: metadata.width / metadata.height,
      originalFilename: path.basename(sourcePath)
    };

    // Copy full-size image to public directory
    if (!fs.existsSync(fullSizePath)) {
      fs.copyFileSync(sourcePath, fullSizePath);
    }

    // Always create thumbnail
    console.log(`Generating thumbnail for ${sourcePath} -> ${thumbPath}`);
    try {
      // Ensure thumbnail directory exists
      ensureDir(path.dirname(thumbPath));

      // Create thumbnail pipeline
      const pipeline = sharp(sourcePath)
        .resize(THUMBNAIL_WIDTH, null, {
          withoutEnlargement: true,
          fit: 'inside'
        })
        .jpeg({ quality: THUMBNAIL_QUALITY });

      // Get info about the pipeline
      const info = await pipeline.metadata();
      console.log(`Pipeline configured: ${info.width}x${info.height}, format: ${info.format}`);

      // Write the file
      await pipeline.toFile(thumbPath);
      
      // Wait a moment to ensure file is written
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify thumbnail was created
      if (fs.existsSync(thumbPath)) {
        const stats = fs.statSync(thumbPath);
        console.log(`Thumbnail created successfully: ${thumbPath} (${stats.size} bytes)`);
        
        // Double check the file is readable
        try {
          await sharp(thumbPath).metadata();
          console.log(`Thumbnail verified readable: ${thumbPath}`);
        } catch (verifyError) {
          console.error(`Thumbnail verification failed: ${verifyError}`);
          throw verifyError;
        }
      } else {
        console.error(`Thumbnail creation failed - file not found: ${thumbPath}`);
        throw new Error('Thumbnail file not created');
      }
    } catch (thumbError) {
      console.error(`Error creating thumbnail for ${sourcePath}:`, thumbError);
      throw thumbError;
    }

    return { success: true, dimensions, newFilename };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Process a video file to create web assets
 */
async function processVideo(sourcePath: string, destDir: string): Promise<ProcessingResult> {
  return new Promise((resolve) => {
    try {
      const ext = path.extname(sourcePath);
      const originalBasename = path.basename(sourcePath, ext);
      
      // Get video dimensions first
      new Promise<any>((probeResolve, probeReject) => {
        ffmpeg.ffprobe(sourcePath, (err, metadata) => {
          if (err) {
            probeReject(new Error(err.message));
            return;
          }
          probeResolve(metadata);
        });
      })
      .then(async (metadata) => {
        const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
        if (!videoStream) {
          throw new Error('No video stream found');
        }

        const width = videoStream.width || 0;
        const height = videoStream.height || 0;

        // Generate standardized filename
        const newFilename = await generateStandardFilename(sourcePath, destDir, ext);
          const newBasename = path.basename(newFilename, ext);
          const thumbPath = path.join(destDir, `${newBasename}-thumb.jpg`);
          const previewPath = path.join(destDir, `${newBasename}-preview.mp4`);

          // Skip if both thumbnail and preview already exist
          if (fs.existsSync(thumbPath) && fs.existsSync(previewPath)) {
            resolve({ 
              success: true, 
              newFilename,
              dimensions: {
                width,
                height,
                aspectRatio: width / height,
                originalFilename: path.basename(sourcePath)
              }
            });
            return;
          }

          // Create thumbnail from video frame
          ffmpeg(sourcePath)
            .screenshots({
              timestamps: ['1'],
              filename: `${newBasename}-thumb.jpg`,
              folder: destDir,
              size: '800x?'
            })
            .on('end', () => {
              // Create preview video
              ffmpeg(sourcePath)
                .duration(VIDEO_PREVIEW_DURATION)
                .size(VIDEO_PREVIEW_SIZE)
                .output(previewPath)
                .on('end', () => {
                  resolve({ 
                    success: true,
                    newFilename,
                    dimensions: {
                      width,
                      height,
                      aspectRatio: width / height,
                      originalFilename: path.basename(sourcePath)
                    }
                  });
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
      }).catch(error => {
        resolve({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
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
async function updateSectionMetadata(dir: string, filename: string, metadata: MediaMetadata) {
  const metadataPath = path.join(dir, 'metadata.json');
  let sectionMetadata: SectionMetadata = { images: {} };

  // Skip if this is a thumbnail or preview
  if (filename.includes('-thumb') || filename.includes('-preview')) {
    return;
  }

  // Read existing metadata if it exists
  if (fs.existsSync(metadataPath)) {
    try {
      sectionMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    } catch (error) {
      console.error(`Error reading metadata: ${error}`);
    }
  }

  // Update metadata
  sectionMetadata.images[filename] = metadata;

  // Write updated metadata
  try {
    fs.writeFileSync(metadataPath, JSON.stringify(sectionMetadata, null, 2));
  } catch (error) {
    console.error(`Error writing metadata: ${error}`);
  }
}

/**
 * Process all media files in a directory
 */
async function processDirectory(sourceDir: string, destDir: string) {
  // Ensure destination directory exists
  ensureDir(destDir);

  // Initialize metadata
  const metadataPath = path.join(destDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    fs.writeFileSync(metadataPath, JSON.stringify({ images: {} }, null, 2));
  }

  const items = fs.readdirSync(sourceDir);

  for (const item of items) {
    const sourcePath = path.join(sourceDir, item);
    const stat = fs.statSync(sourcePath);

    if (stat.isDirectory()) {
      // Create corresponding directory
      const subDestDir = path.join(destDir, item);
      ensureDir(subDestDir);
      
      // Recursively process subdirectories
      await processDirectory(sourcePath, subDestDir);
    } else {
      const ext = path.extname(item).toLowerCase();
      
      if (SUPPORTED_IMAGE_TYPES.includes(ext)) {
        // Generate standardized filename once and reuse it
        const newFilename = await generateStandardFilename(sourcePath, destDir, ext);
        const result = await processImage(sourcePath, destDir, newFilename);
        if (!result.success) {
          console.error(`Error processing image ${item}: ${result.error}`);
        } else if (result.dimensions) {
          await updateSectionMetadata(destDir, newFilename, result.dimensions);
        }
      } else if (SUPPORTED_VIDEO_TYPES.includes(ext)) {
        const result = await processVideo(sourcePath, destDir);
        if (!result.success) {
          console.error(`Error processing video ${item}: ${result.error}`);
        } else if (result.dimensions && result.newFilename) {
          await updateSectionMetadata(destDir, result.newFilename, result.dimensions);
        }
      }
    }
  }
}

/**
 * Clean up orphaned processed files and metadata
 */
/**
 * Clean up orphaned processed files and metadata
 */
function cleanupOrphaned(publicDir: string, originalsDir: string) {
  // Skip if originals directory doesn't exist yet
  if (!fs.existsSync(originalsDir)) {
    return;
  }

  // Read metadata first
  const metadataPath = path.join(publicDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    return; // Skip cleanup if no metadata exists yet
  }

  let metadata: SectionMetadata;
  try {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch (error) {
    console.error(`Error reading metadata: ${error}`);
    return;
  }

  // Get list of original files
  const originalFiles = fs.existsSync(originalsDir) ? fs.readdirSync(originalsDir) : [];

  // Process each file in the public directory
  const items = fs.readdirSync(publicDir);
  for (const item of items) {
    const publicPath = path.join(publicDir, item);
    const stat = fs.statSync(publicPath);

    if (stat.isDirectory()) {
      // Handle subdirectories recursively
      const originalDirPath = path.join(originalsDir, item);
      if (fs.existsSync(originalDirPath)) {
        cleanupOrphaned(publicPath, originalDirPath);
      } else {
        // Only remove empty directories
        try {
          const files = fs.readdirSync(publicPath);
          if (files.length === 0) {
            fs.rmdirSync(publicPath);
          }
        } catch (error) {
          console.error(`Error cleaning directory ${publicPath}:`, error);
        }
      }
      continue;
    }

    // Skip metadata.json
    if (item === 'metadata.json') {
      continue;
    }

    const basename = path.basename(item);
    const ext = path.extname(item);

    // Handle thumbnails and previews
    if (basename.includes('-thumb') || basename.includes('-preview')) {
      const mainBasename = basename
        .replace('-thumb', '')
        .replace('-preview', '');
      
      // Check if main file exists in metadata
      const mainFileExists = Object.keys(metadata.images).some(f => 
        f.startsWith(mainBasename) && !f.includes('-thumb') && !f.includes('-preview')
      );

      if (!mainFileExists) {
        console.log(`Cleaning up orphaned thumbnail/preview: ${publicPath}`);
        try {
          fs.unlinkSync(publicPath);
        } catch (error) {
          console.error(`Error deleting ${publicPath}:`, error);
        }
      }
      continue;
    }

    // Handle main files
    const fileMetadata = metadata.images[basename];
    if (!fileMetadata) {
      // File exists but no metadata - might be in process of being created
      console.log(`Skipping cleanup for ${basename} - no metadata yet`);
      continue;
    }

    // Check if original file still exists
    const originalExists = originalFiles.some(f => f === fileMetadata.originalFilename);
    if (!originalExists) {
      console.log(`Cleaning up orphaned file: ${publicPath}`);
      try {
        // Remove the file
        fs.unlinkSync(publicPath);
        // Remove metadata
        delete metadata.images[basename];
        // Remove associated thumbnails
        const thumbPath = path.join(publicDir, `${path.basename(basename, ext)}-thumb.jpg`);
        if (fs.existsSync(thumbPath)) {
          fs.unlinkSync(thumbPath);
        }
      } catch (error) {
        console.error(`Error cleaning up ${publicPath}:`, error);
      }
    }
  }

  // Write back metadata if it changed
  try {
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  } catch (error) {
    console.error(`Error writing metadata: ${error}`);
  }
}

// Main execution
async function main() {
  try {
    // Create directories if they don't exist
    ensureDir(ORIGINALS_DIR);
    ensureDir(PUBLIC_DIR);

    // Clean up any orphaned files first
    cleanupOrphaned(PUBLIC_DIR, ORIGINALS_DIR);
    
    // Process all media files
    await processDirectory(ORIGINALS_DIR, PUBLIC_DIR);
    
    console.log('Media processing completed successfully');
  } catch (error) {
    console.error('Error processing media:', error);
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
