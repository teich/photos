import fs from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import exifReader from 'exif-reader';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

// Configure S3 client for R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.S3_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.ACCESS_KEY_ID!,
    secretAccessKey: process.env.SECRET_ACCESS_KEY!
  }
});

// R2 bucket name and domain
const BUCKET_NAME = 'photos';
const DOMAIN = process.env.NEXT_PUBLIC_DOMAIN;

if (!DOMAIN) {
  throw new Error('NEXT_PUBLIC_DOMAIN environment variable is required');
}

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

// Get input directory from command line args or use default
const DEFAULT_PHOTOS_DIR = path.join(os.homedir(), 'Pictures', 'web');
const inputDir = process.argv[2] || DEFAULT_PHOTOS_DIR;
const ORIGINALS_DIR = path.resolve(inputDir);  // Source directory for original files
const TMP_DIR = path.join(os.tmpdir(), 'photos-processing');  // Temporary processing directory
const TMP_METADATA_PATH = path.join(TMP_DIR, 'metadata.json');  // Temporary metadata file

// In-memory metadata state
let processingState: { sections: { [key: string]: SectionMetadata } } = { sections: {} };

// Ensure R2 credentials are set
if (!process.env.ACCESS_KEY_ID || !process.env.SECRET_ACCESS_KEY || !process.env.S3_ENDPOINT) {
  console.error('Error: R2 credentials are not properly configured');
  process.exit(1);
}

/**
 * Calculate content hash for a file
 */
async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('error', err => reject(err));
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// Validate input directory
if (!fs.existsSync(ORIGINALS_DIR)) {
  console.error(`Error: Directory not found: ${ORIGINALS_DIR}`);
  console.error(`Please create the directory or specify a different path.`);
  process.exit(1);
}
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
  type: 'image' | 'video';
  contentHash: string;
  urls: {
    original: string;
    thumb: string;
    preview?: string;  // For videos only
  };
}

interface SectionMetadata {
  images: {
    [filename: string]: MediaMetadata;
  };
}

interface BlobUploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

interface ProcessingResult {
  success: boolean;
  error?: string;
  dimensions?: MediaMetadata;
  newFilename?: string;
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
        } else {
          throw new Error('No capture date found in EXIF');
        }
      } catch (exifError) {
        // Fallback to file creation time
        const stats = fs.statSync(sourcePath);
        const date = stats.birthtime;
        dateStr = date.toISOString()
          .replace('T', '-')
          .replace(/:/g, '')
          .split('.')[0];
      }
    } else {
      // No EXIF data, use file creation time
      const stats = fs.statSync(sourcePath);
      const date = stats.birthtime;
      dateStr = date.toISOString()
        .replace('T', '-')
        .replace(/:/g, '')
        .split('.')[0];
    }
  } catch (error) {
    // If all else fails, use current date
    const date = new Date();
    dateStr = date.toISOString()
      .replace('T', '-')
      .replace(/:/g, '')
      .split('.')[0];
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
 * Check if an object exists in R2
 */
async function checkObjectExists(key: string): Promise<boolean> {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });
    await s3Client.send(command);
    return true;
  } catch (error) {
    if ((error as any).name === 'NotFound') {
      return false;
    }
    throw error;
  }
}

/**
 * Find existing metadata entry by content hash
 */
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

/**
 * Get date-based path components
 */
function getDateBasedPath(dateStr: string): { year: string; month: string } {
  const date = new Date(dateStr);
  return {
    year: date.getFullYear().toString(),
    month: (date.getMonth() + 1).toString().padStart(2, '0')
  };
}

/**
 * Upload a file to R2 if it doesn't already exist
 */
async function uploadToR2(filePath: string, contentHash: string, dateStr?: string): Promise<BlobUploadResult> {
  try {
    const fileContent = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    const isThumb = filePath.includes('-thumb');
    const isPreview = filePath.includes('-preview');
    
    // Determine the appropriate directory
    let directory = 'originals';
    if (isThumb) {
      directory = 'thumbs';
    } else if (isPreview) {
      directory = 'previews';
    }

    // Get date-based path if available
    let datePath = '';
    if (dateStr) {
      const { year, month } = getDateBasedPath(dateStr);
      datePath = `${year}/${month}/`;
    }

    // Construct the object key
    const key = `${directory}/${datePath}${contentHash}${ext}`;
    const publicUrl = `${DOMAIN}/${key}`;

    // Check if object already exists
    if (await checkObjectExists(key)) {
      process.stdout.write('s'); // 's' for skipped
      return { success: true, url: publicUrl };
    }

    // Upload if doesn't exist
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileContent,
      ContentType: ext === '.jpg' ? 'image/jpeg' : 
                  ext === '.mp4' ? 'video/mp4' : 
                  ext === '.mov' ? 'video/quicktime' : 
                  'application/octet-stream'
    });

    await s3Client.send(command);
    process.stdout.write('+'); // '+' for uploaded
    return { success: true, url: publicUrl };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during R2 upload'
    };
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

    // Get image metadata with enhanced error handling
    let metadata;
    try {
      metadata = await sharp(sourcePath).metadata();
      if (!metadata.width || !metadata.height) {
        // Try alternative method using buffer
        const buffer = await sharp(sourcePath).toBuffer();
        const fallbackMetadata = await sharp(buffer).metadata();
        if (!fallbackMetadata.width || !fallbackMetadata.height) {
          throw new Error('Could not extract image dimensions');
        }
        metadata.width = fallbackMetadata.width;
        metadata.height = fallbackMetadata.height;
      }
    } catch (error) {
      console.error(`Error extracting dimensions for ${sourcePath}:`, error);
      throw error;
    }

    // Calculate content hashes
    const originalHash = await calculateFileHash(sourcePath);
    
    // Create temporary paths for processing
    const tmpOriginalPath = path.join(TMP_DIR, `${originalHash}${ext}`);
    const tmpThumbPath = path.join(TMP_DIR, `${originalHash}-thumb.jpg`);
    
    // Ensure tmp directory exists
    ensureDir(TMP_DIR);
    
    // Copy original to tmp
    fs.copyFileSync(sourcePath, tmpOriginalPath);

    // Extract date from the standardized filename
    const dateMatch = newFilename.match(/^(\d{4}-\d{2}-\d{2})/);
    const dateStr = dateMatch ? dateMatch[1] : undefined;

    // Upload original to R2
    const originalUpload = await uploadToR2(tmpOriginalPath, originalHash, dateStr);
    if (!originalUpload.success || !originalUpload.url) {
      throw new Error(`Failed to upload original: ${originalUpload.error}`);
    }

    const dimensions: MediaMetadata = {
      width: metadata.width,
      height: metadata.height,
      aspectRatio: metadata.width / metadata.height,
      originalFilename: path.basename(sourcePath),
      type: 'image',
      contentHash: originalHash,
      urls: {
        original: originalUpload.url,
        thumb: '', // Will be set after thumbnail upload
      }
    };

    // Create and upload thumbnail
    try {
      // Create thumbnail pipeline
      const pipeline = sharp(sourcePath)
        .resize(THUMBNAIL_WIDTH, null, {
          withoutEnlargement: true,
          fit: 'inside'
        })
        .jpeg({ quality: THUMBNAIL_QUALITY });

      // Write to tmp file
      await pipeline.toFile(tmpThumbPath);
      
      // Upload thumbnail
      const thumbUpload = await uploadToR2(tmpThumbPath, `${originalHash}-thumb`, dateStr);
      if (!thumbUpload.success || !thumbUpload.url) {
        throw new Error(`Failed to upload thumbnail: ${thumbUpload.error}`);
      }
      dimensions.urls.thumb = thumbUpload.url;
    } catch (thumbError) {
      console.error(`Error processing thumbnail for ${sourcePath}:`, thumbError);
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
  return new Promise(async (resolve) => {
    try {
      const ext = path.extname(sourcePath);
      const originalBasename = path.basename(sourcePath, ext);
      
      // Get video dimensions first with enhanced error handling
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
        let videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
        if (!videoStream) {
          // Try alternative streams or rotation metadata
          const rotatedStream = metadata.streams.find((s: any) => 
            s.codec_type === 'video' && (s.tags?.rotate || s.side_data_list?.some((d: any) => d.rotation))
          );
          if (rotatedStream) {
            videoStream = rotatedStream;
          } else {
            throw new Error('No valid video stream found');
          }
        }

        // Handle potential rotation
        let width = videoStream.width || 0;
        let height = videoStream.height || 0;
        
        // Check for rotation metadata
        const rotation = videoStream.tags?.rotate || 
          (videoStream.side_data_list?.find((d: any) => d.rotation)?.rotation || 0);
        
        // Swap dimensions if video is rotated 90 or 270 degrees
        if (rotation === '90' || rotation === '270' || rotation === 90 || rotation === 270) {
          [width, height] = [height, width];
        }

        // Generate standardized filename
        const newFilename = await generateStandardFilename(sourcePath, destDir, ext);
        const newBasename = path.basename(newFilename, ext);
        const thumbPath = path.join(destDir, `${newBasename}-thumb.jpg`);
        const previewPath = path.join(destDir, `${newBasename}-preview.mp4`);

        // Calculate content hashes
        const originalHash = await calculateFileHash(sourcePath);
        
        // Create temporary paths for processing
        const tmpOriginalPath = path.join(TMP_DIR, `${originalHash}${ext}`);
        const tmpThumbPath = path.join(TMP_DIR, `${originalHash}-thumb.jpg`);
        const tmpPreviewPath = path.join(TMP_DIR, `${originalHash}-preview.mp4`);
        
        // Ensure tmp directory exists
        ensureDir(TMP_DIR);
        
        // Copy original to tmp
        fs.copyFileSync(sourcePath, tmpOriginalPath);

        // Extract date from the standardized filename
        const dateMatch = newFilename.match(/^(\d{4}-\d{2}-\d{2})/);
        const dateStr = dateMatch ? dateMatch[1] : undefined;

        // Upload original to R2
        const originalUpload = await uploadToR2(tmpOriginalPath, originalHash, dateStr);
        if (!originalUpload.success || !originalUpload.url) {
          throw new Error(`Failed to upload original: ${originalUpload.error}`);
        }

        const dimensions: MediaMetadata = {
          width,
          height,
          aspectRatio: width / height,
          originalFilename: path.basename(sourcePath),
          type: 'video',
          contentHash: originalHash,
          urls: {
            original: originalUpload.url,
            thumb: '', // Will be set after thumbnail upload
            preview: '', // Will be set after preview upload
          }
        };

        // Create thumbnail and preview
        try {
          // Create thumbnail
          await new Promise<void>((thumbResolve, thumbReject) => {
            ffmpeg(sourcePath)
              .screenshots({
                timestamps: ['1'],
                filename: `${originalHash}-thumb.jpg`,
                folder: TMP_DIR,
                size: '800x?'
              })
              .on('end', () => thumbResolve())
              .on('error', (err) => thumbReject(err));
          });

          // Upload thumbnail
          const thumbUpload = await uploadToR2(tmpThumbPath, `${originalHash}-thumb`, dateStr);
          if (!thumbUpload.success || !thumbUpload.url) {
            throw new Error(`Failed to upload thumbnail: ${thumbUpload.error}`);
          }
          dimensions.urls.thumb = thumbUpload.url;

          // Create preview
          await new Promise<void>((previewResolve, previewReject) => {
            ffmpeg(sourcePath)
              .duration(VIDEO_PREVIEW_DURATION)
              .size(VIDEO_PREVIEW_SIZE)
              .output(tmpPreviewPath)
              .on('end', () => previewResolve())
              .on('error', (err) => previewReject(err))
              .run();
          });

          // Upload preview
          const previewUpload = await uploadToR2(tmpPreviewPath, `${originalHash}-preview`, dateStr);
          if (!previewUpload.success || !previewUpload.url) {
            throw new Error(`Failed to upload preview: ${previewUpload.error}`);
          }
          dimensions.urls.preview = previewUpload.url;

          resolve({ 
            success: true,
            newFilename,
            dimensions
          });
        } catch (error) {
          resolve({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error processing video assets'
          });
        }
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
 * Update in-memory metadata state
 */
function updateMetadata(section: string, filename: string, metadata: MediaMetadata) {
  // Skip if this is a thumbnail or preview
  if (filename.includes('-thumb') || filename.includes('-preview')) {
    return;
  }

  // Initialize section if it doesn't exist
  if (!processingState.sections[section]) {
    processingState.sections[section] = { images: {} };
  }

  // Update metadata
  processingState.sections[section].images[filename] = metadata;

  // Write to tmp for recovery/debugging
  try {
    fs.writeFileSync(TMP_METADATA_PATH, JSON.stringify(processingState, null, 2));
  } catch (error) {
    console.error(`Error writing temporary metadata: ${error}`);
  }
}

/**
 * Process all media files in a directory
 */
async function processDirectory(sourceDir: string, section: string = '') {
  const items = fs.readdirSync(sourceDir);
  const mediaFiles = items.filter(item => {
    const ext = path.extname(item).toLowerCase();
    return SUPPORTED_IMAGE_TYPES.includes(ext) || SUPPORTED_VIDEO_TYPES.includes(ext);
  });

  if (mediaFiles.length > 0) {
    process.stdout.write(`\nProcessing ${mediaFiles.length} files in ${section || 'root'}: `);
  }

  for (const item of items) {
    const sourcePath = path.join(sourceDir, item);
    const stat = fs.statSync(sourcePath);

    if (stat.isDirectory()) {
      // Process subdirectory with nested section name
      const subSection = section ? `${section}/${item}` : item;
      await processDirectory(sourcePath, subSection);
      continue;
    }

    const ext = path.extname(item).toLowerCase();
    if (!SUPPORTED_IMAGE_TYPES.includes(ext) && !SUPPORTED_VIDEO_TYPES.includes(ext)) {
      continue;
    }

    // Calculate content hash first
    const contentHash = await calculateFileHash(sourcePath);
    
    // Check if this content hash exists anywhere in the metadata
    const existing = findExistingByHash(contentHash, processingState);
    if (existing) {
      process.stdout.write('s'); // 's' for skipped
      
      // If it's in a different section, add a reference to it
      if (existing.section !== section) {
        if (!processingState.sections[section]) {
          processingState.sections[section] = { images: {} };
        }
        processingState.sections[section].images[existing.filename] = existing.metadata;
      }
      continue;
    }
      
    if (SUPPORTED_IMAGE_TYPES.includes(ext)) {
      // Generate standardized filename
      const newFilename = await generateStandardFilename(sourcePath, TMP_DIR, ext);
      const result = await processImage(sourcePath, TMP_DIR, newFilename);
      if (!result.success) {
        process.stdout.write('x'); // 'x' for error
        console.error(`\nError processing image ${item}: ${result.error}`);
      } else if (result.dimensions) {
        await updateMetadata(section, newFilename, result.dimensions);
      }
    } else if (SUPPORTED_VIDEO_TYPES.includes(ext)) {
      const result = await processVideo(sourcePath, TMP_DIR);
      if (!result.success) {
        process.stdout.write('x'); // 'x' for error
        console.error(`\nError processing video ${item}: ${result.error}`);
      } else if (result.dimensions && result.newFilename) {
        await updateMetadata(section, result.newFilename, result.dimensions);
      }
    }
  }
}

/**
 * Upload metadata to R2
 */
async function uploadMetadata(): Promise<string> {
  process.stdout.write('\nUploading metadata... ');
  
  try {
    // Use in-memory state
    const metadata = processingState;
    
    // Generate timestamp for versioning
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Upload versioned metadata
    const versionedKey = `metadata/metadata-${timestamp}.json`;
    const versionedCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: versionedKey,
      Body: JSON.stringify(metadata, null, 2),
      ContentType: 'application/json'
    });
    await s3Client.send(versionedCommand);

    // Upload latest metadata
    const latestKey = 'metadata/latest.json';
    const latestCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: latestKey,
      Body: JSON.stringify(metadata, null, 2),
      ContentType: 'application/json'
    });
    await s3Client.send(latestCommand);

    process.stdout.write('done\n');
    return `${DOMAIN}/metadata/latest.json`;
  } catch (error) {
    console.error('Error uploading metadata:', error);
    throw error;
  }
}

/**
 * Clean up temporary directory
 */
async function cleanupTmp() {
  if (fs.existsSync(TMP_DIR)) {
    try {
      fs.rmSync(TMP_DIR, { recursive: true, force: true });
    } catch (error) {
      console.error('Error cleaning up temporary directory:', error);
    }
  }
}

async function main() {
  try {
    // Create directories if they don't exist
    ensureDir(ORIGINALS_DIR);
    ensureDir(TMP_DIR);

    console.log('Starting media processing...');
    console.log(`Source directory: ${ORIGINALS_DIR}`);

    // Reset processing state for this run
    processingState = { sections: {} };

    // Process all media files
    await processDirectory(ORIGINALS_DIR);
    
    // Clean up temporary files
    await cleanupTmp();
    
    // Upload metadata to R2
    const metadataUrl = await uploadMetadata();
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
