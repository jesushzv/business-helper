import { put } from '@vercel/blob';
import fs from 'fs';
import path from 'path';

async function uploadAllAssets() {
  const token = process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN;

  if (!token) {
    console.error('\n❌ Missing BLOB_READ_WRITE_TOKEN environment variable.\n');
    console.log('To upload your media files directly to Vercel Blob CDN:');
    console.log('1. Go to Vercel Dashboard -> Storage -> [Your Blob Store] -> Settings');
    console.log('2. Copy your "BLOB_READ_WRITE_TOKEN" (starts with vercel_blob_rw_...)');
    console.log('3. Run: BLOB_READ_WRITE_TOKEN="<your_token>" npm run sync-blob\n');
    process.exit(1);
  }

  const demoDir = path.resolve(process.cwd(), 'public/assets/demo');
  if (!fs.existsSync(demoDir)) {
    console.error(`❌ Directory not found: ${demoDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(demoDir).filter((f) => !f.startsWith('.'));
  console.log(`🚀 Syncing ${files.length} demo assets to Vercel Blob CDN...\n`);

  let successCount = 0;
  for (const filename of files) {
    const filePath = path.join(demoDir, filename);
    const fileBuffer = fs.readFileSync(filePath);
    const pathname = `assets/demo/${filename}`;

    try {
      const blob = await put(pathname, fileBuffer, {
        access: 'public',
        addRandomSuffix: false,
        token,
      });
      console.log(`✓ [${++successCount}/${files.length}] Uploaded: ${blob.url}`);
    } catch (err) {
      console.error(`X Failed to upload ${pathname}:`, err.message);
    }
  }

  console.log(`\n✅ Completed! ${successCount} assets uploaded to Vercel Blob CDN.`);
}

uploadAllAssets().catch((err) => {
  console.error('Fatal error during Vercel Blob sync:', err);
  process.exit(1);
});
