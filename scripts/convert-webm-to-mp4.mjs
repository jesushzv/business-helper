import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const demoDir = path.resolve(process.cwd(), 'public/assets/demo');
const files = fs.readdirSync(demoDir).filter((f) => f.endsWith('.webm'));

console.log(`Found ${files.length} .webm files to convert to H.264 .mp4...`);

files.forEach((file) => {
  const webmPath = path.join(demoDir, file);
  const mp4Path = path.join(demoDir, file.replace('.webm', '.mp4'));

  console.log(`Converting ${file} -> ${file.replace('.webm', '.mp4')}...`);
  try {
    execSync(`ffmpeg -y -i "${webmPath}" -c:v libx264 -pix_fmt yuv420p -an "${mp4Path}"`, {
      stdio: 'inherit',
    });
    console.log(`✓ Created ${file.replace('.webm', '.mp4')}`);
  } catch (err) {
    console.error(`❌ Failed to convert ${file}:`, err.message);
  }
});

console.log('✅ All WebM files converted to MP4!');
