import { put } from '@vercel/blob';
import { readFileSync } from 'fs';
import { join } from 'path';

async function testBlobUpload() {
  try {
    // Create a small test file
    const testContent = 'Hello Blob Storage!';
    const testBuffer = Buffer.from(testContent);

    console.log('Uploading test file to Vercel Blob...');
    
    const { url } = await put('test.txt', testBuffer, {
      access: 'public',
    });

    console.log('Successfully uploaded to:', url);
    console.log('Blob storage is configured correctly!');
  } catch (error) {
    console.error('Error testing blob storage:', error);
    process.exit(1);
  }
}

testBlobUpload();
