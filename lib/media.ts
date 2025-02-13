'use server'

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

// Media dimension information
export interface MediaDimensions {
  width: number;
  height: number;
  aspectRatio: number;
}

// Metadata stored in section folders
export interface SectionMetadata {
  images: {
    [filename: string]: MediaDimensions;
  };
}

// Types for our media items
export interface MediaItem {
  id: string;           // Unique identifier
  type: 'image' | 'video';
  section: string;      // Folder name (e.g., "2024-baja")
  filename: string;     // Original filename
  path: string;         // Path relative to public/photos
  url: string;         // URL path for the media
  thumbnailUrl: string; // URL path for the thumbnail
  previewUrl?: string;  // URL path for video preview (videos only)
  dimensions?: MediaDimensions; // Image dimensions and aspect ratio
}

export interface Section {
  name: string;        // Folder name
  title: string;       // Display title
  items: MediaItem[];
}

const PHOTOS_DIR = join(process.cwd(), 'public/photos');
const SUPPORTED_IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.webp'];
const SUPPORTED_VIDEO_TYPES = ['.mp4', '.mov'];

/**
 * Get all media sections (folders) and their contents
 */
export async function getMediaSections(): Promise<Section[]> {
  const sections: Section[] = [];
  
  // Read the photos directory
  const sectionDirs = readdirSync(PHOTOS_DIR)
    .filter(item => {
      const fullPath = join(PHOTOS_DIR, item);
      return statSync(fullPath).isDirectory();
    });

  // Process each section
  for (const sectionDir of sectionDirs) {
    const items = await getMediaItemsInSection(sectionDir);
    if (items.length > 0) {
      sections.push({
        name: sectionDir,
        // Convert folder name to display title (e.g., "2024-baja" -> "2024 Baja")
        title: sectionDir.replace(/-/g, ' ').replace(/(\d{4})/, '$1 '),
        items
      });
    }
  }

  // Sort sections by name in reverse chronological order
  return sections.sort((a, b) => b.name.localeCompare(a.name));
}

/**
 * Get all media items in a specific section
 */
async function getMediaItemsInSection(sectionDir: string): Promise<MediaItem[]> {
  const sectionPath = join(PHOTOS_DIR, sectionDir);
  const items: MediaItem[] = [];

  // Try to read metadata file
  let metadata: SectionMetadata | undefined;
  const metadataPath = join(sectionPath, 'metadata.json');
  try {
    const metadataContent = readFileSync(metadataPath, 'utf8');
    metadata = JSON.parse(metadataContent);
    console.log(`Loaded metadata for section ${sectionDir}:`, metadata);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.error(`Error reading metadata for section ${sectionDir}:`, error);
    }
  }

  // Read all files in the section directory
  const files = readdirSync(sectionPath);

  // First pass: collect original files with metadata
  for (const filename of files) {
    const ext = extname(filename).toLowerCase();
    
    // Skip if not a supported media type
    if (![...SUPPORTED_IMAGE_TYPES, ...SUPPORTED_VIDEO_TYPES].includes(ext)) {
      continue;
    }

    // Skip thumbnail and preview files
    if (filename.includes('-thumb') || filename.includes('-preview')) {
      continue;
    }

    // Skip files without metadata (they might not be processed yet)
    if (!metadata?.images?.[filename]) {
      console.warn(`Missing metadata for file: ${filename}`);
      continue;
    }

    const type = SUPPORTED_IMAGE_TYPES.includes(ext) ? 'image' : 'video';
    const relativePath = join(sectionDir, filename).replace(/\\/g, '/');

    const item: MediaItem = {
      id: `${sectionDir}-${filename}`.replace(/\s+/g, '-'),
      type,
      section: sectionDir,
      filename,
      path: relativePath,
      url: `/photos/${relativePath}`,
      thumbnailUrl: `/photos/${join(
        sectionDir,
        `${filename.replace(ext, '')}-thumb${type === 'image' ? ext : '.jpg'}`
      ).replace(/\\/g, '/')}`,
      previewUrl: type === 'video'
        ? `/photos/${join(sectionDir, `${filename.replace(ext, '')}-preview.mp4`).replace(/\\/g, '/')}`
        : undefined,
      dimensions: metadata.images[filename]
    };

    items.push(item);
  }

  console.log(`Found ${items.length} valid items in section ${sectionDir}`);

  // Sort items by filename
  return items.sort((a, b) => a.filename.localeCompare(b.filename));
}

/**
 * Get all media items across all sections as a flat array
 */
export async function getAllMediaItems(): Promise<MediaItem[]> {
  const sections = await getMediaSections();
  return sections.flatMap(section => section.items);
}

/**
 * Get a specific media item by its ID
 */
export async function getMediaItemById(id: string): Promise<MediaItem | undefined> {
  const items = await getAllMediaItems();
  return items.find(item => item.id === id);
}
