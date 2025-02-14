import { join } from 'path';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import our media functions
import { getMediaSections, getAllMediaItems, getMediaItemById } from '../lib/media';

async function testMedia() {
  try {
    console.log('\nTesting media functions...\n');

    // Test getMediaSections
    console.log('Testing getMediaSections()...');
    const sections = await getMediaSections();
    console.log(`Found ${sections.length} sections:`);
    for (const section of sections) {
      console.log(`- ${section.name}: ${section.items.length} items`);
    }

    // Test getAllMediaItems
    console.log('\nTesting getAllMediaItems()...');
    const items = await getAllMediaItems();
    console.log(`Found ${items.length} total items`);
    
    if (items.length > 0) {
      // Show details of first item
      const firstItem = items[0];
      console.log('\nFirst item details:');
      console.log('- ID:', firstItem.id);
      console.log('- Type:', firstItem.type);
      console.log('- Section:', firstItem.section);
      console.log('- Original filename:', firstItem.originalFilename);
      console.log('- Content hash:', firstItem.contentHash);
      console.log('- Original URL:', firstItem.url);
      console.log('- Thumbnail URL:', firstItem.thumbnailUrl);
      if (firstItem.previewUrl) {
        console.log('- Preview URL:', firstItem.previewUrl);
      }
      console.log('- Dimensions:', firstItem.dimensions);

      // Test getMediaItemById with this item's ID
      console.log('\nTesting getMediaItemById()...');
      const foundItem = await getMediaItemById(firstItem.id);
      if (foundItem) {
        console.log('Successfully retrieved item by ID');
      } else {
        console.error('Failed to retrieve item by ID');
      }
    }

    // Read metadata.json directly
    console.log('\nReading metadata.json...');
    try {
      const metadata = JSON.parse(readFileSync('metadata.json', 'utf8'));
      console.log('Metadata structure:');
      console.log('- Number of sections:', Object.keys(metadata.sections).length);
      for (const [section, data] of Object.entries<any>(metadata.sections)) {
        console.log(`- Section "${section}": ${Object.keys(data.images).length} images`);
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log('metadata.json not found - run process-media first');
      } else {
        console.error('Error reading metadata.json:', error);
      }
    }

    console.log('\nTests completed');
  } catch (error) {
    console.error('Test error:', error);
  }
}

// Run tests
testMedia().catch(console.error);
