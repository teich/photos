import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

// Configure S3 client for R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.S3_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.ACCESS_KEY_ID!,
    secretAccessKey: process.env.SECRET_ACCESS_KEY!
  }
});

// R2 bucket name
const BUCKET_NAME = 'photos';

// Prefixes to clear
const CACHE_PREFIXES = ['thumbs/', 'previews/', 'metadata/'];

// Ensure R2 credentials are set
if (!process.env.ACCESS_KEY_ID || !process.env.SECRET_ACCESS_KEY || !process.env.S3_ENDPOINT) {
  console.error('Error: R2 credentials are not properly configured');
  process.exit(1);
}

/**
 * List all objects with a given prefix
 */
async function listObjects(prefix: string): Promise<string[]> {
  const objects: string[] = [];
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      ContinuationToken: continuationToken
    });

    const response = await s3Client.send(command);
    
    if (response.Contents) {
      objects.push(...response.Contents.map(obj => obj.Key!));
    }
    
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return objects;
}

/**
 * Delete objects in batches
 */
async function deleteObjects(keys: string[]) {
  // Delete in batches of 1000 (S3 limit)
  const batchSize = 1000;
  const batches = [];
  
  for (let i = 0; i < keys.length; i += batchSize) {
    batches.push(keys.slice(i, i + batchSize));
  }

  for (const batch of batches) {
    const command = new DeleteObjectsCommand({
      Bucket: BUCKET_NAME,
      Delete: {
        Objects: batch.map(Key => ({ Key })),
        Quiet: true
      }
    });

    await s3Client.send(command);
    process.stdout.write(`Deleted ${batch.length} objects\n`);
  }
}

async function main() {
  try {
    console.log('Starting cache clear...');
    
    // List and delete objects for each prefix
    for (const prefix of CACHE_PREFIXES) {
      process.stdout.write(`\nListing objects in ${prefix}... `);
      const objects = await listObjects(prefix);
      process.stdout.write(`found ${objects.length} objects\n`);
      
      if (objects.length > 0) {
        process.stdout.write(`Deleting objects from ${prefix}...\n`);
        await deleteObjects(objects);
      }
    }

    console.log('\nCache clear completed successfully');
    console.log('You can now run npm run process-media to regenerate the assets');
  } catch (error) {
    console.error('Error clearing cache:', error);
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
