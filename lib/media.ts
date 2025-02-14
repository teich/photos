'use server'

import { join } from 'path';
import { cache } from 'react';

const METADATA_URL = process.env.NEXT_PUBLIC_METADATA_URL;
if (!METADATA_URL) {
  throw new Error('NEXT_PUBLIC_METADATA_URL environment variable is required');
}

// Cache the metadata fetch to avoid repeated requests
const getMetadataFromBlob = cache(async () => {
  try {
    const response = await fetch(METADATA_URL, {
      next: { revalidate: 60 } // Revalidate every minute
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch metadata: ${response.statusText}`);
    }
    
    return response.json() as Promise<RootMetadata>;
  } catch (error) {
    console.error('Error fetching metadata:', error);
    return { sections: {} };
  }
});

// Media dimension information
export interface MediaDimensions {
  width: number;
  height: number;
  aspectRatio: number;
}

// Metadata for each media item
export interface MediaMetadata {
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

// Section metadata structure
export interface SectionMetadata {
  images: {
    [filename: string]: MediaMetadata;
  };
}

// Root metadata structure
interface RootMetadata {
  sections: {
    [sectionName: string]: SectionMetadata;
  };
}

// Types for our media items
export interface MediaItem {
  id: string;           // Unique identifier (standardized filename)
  type: 'image' | 'video';
  section: string;      // Section name (e.g., "2024-baja")
  filename: string;     // Standardized filename
  originalFilename: string; // Original filename
  url: string;          // Blob URL for original
  thumbnailUrl: string; // Blob URL for thumbnail
  previewUrl?: string;  // Blob URL for video preview
  dimensions: MediaDimensions; // Image dimensions and aspect ratio
  contentHash: string;  // Content-based hash
}

export interface Section {
  name: string;        // Section name
  title: string;       // Display title
  items: MediaItem[];  // Media items in this section
}

/**
 * Get metadata from blob storage
 */
async function getRootMetadata(): Promise<RootMetadata> {
  return getMetadataFromBlob();
}

/**
 * Get all media sections and their contents
 */
export async function getMediaSections(): Promise<Section[]> {
  const metadata = await getRootMetadata();
  const sections: Section[] = [];

  // Process each section
  for (const [sectionName, sectionData] of Object.entries(metadata.sections)) {
    const items = getMediaItemsInSection(sectionName, sectionData);
    if (items.length > 0) {
      sections.push({
        name: sectionName,
        // Convert section name to display title (e.g., "2024-baja" -> "2024 Baja")
        title: sectionName.replace(/-/g, ' ').replace(/(\d{4})/, '$1 '),
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
function getMediaItemsInSection(sectionName: string, metadata: SectionMetadata): MediaItem[] {
  const items: MediaItem[] = [];

  // Process each item in the section
  for (const [filename, itemData] of Object.entries(metadata.images)) {
    const item: MediaItem = {
      id: join(sectionName, filename).replace(/\s+/g, '-'),
      type: itemData.type,
      section: sectionName,
      filename,
      originalFilename: itemData.originalFilename,
      url: itemData.urls.original,
      thumbnailUrl: itemData.urls.thumb,
      previewUrl: itemData.urls.preview,
      dimensions: {
        width: itemData.width,
        height: itemData.height,
        aspectRatio: itemData.aspectRatio
      },
      contentHash: itemData.contentHash
    };

    items.push(item);
  }

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
