import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadsDir = path.resolve(__dirname, '../../uploads');

export const cloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
);
if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
}

function cloudinaryUpload(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'citizen-grievance/complaints',
        resource_type: 'image',
        format: 'webp',
        type: 'authenticated'
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({ storageKey: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

export async function storeComplaintImage(file) {
  // Decode the actual bytes (not only the client-supplied MIME type), strip EXIF,
  // resize, and compress to WebP before persistence.
  const meta = await sharp(file.buffer, { failOn: 'error' }).metadata();
  if (!['jpeg', 'png', 'webp'].includes(meta.format)) {
    const error = new Error('The file content is not a supported JPEG, PNG, or WebP image.');
    error.status = 415;
    throw error;
  }
  const optimized = await sharp(file.buffer)
    .rotate()
    .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();
  const sha256 = createHash('sha256').update(optimized).digest('hex');
  let storageKey;
  if (cloudinaryConfigured) {
    ({ storageKey } = await cloudinaryUpload(optimized));
  } else {
    await mkdir(uploadsDir, { recursive: true });
    storageKey = `${randomUUID()}.webp`;
    await writeFile(path.join(uploadsDir, storageKey), optimized, { flag: 'wx' });
  }
  return { storageKey, mimeType: 'image/webp', sizeBytes: optimized.length, sha256 };
}

export function getTimeLimitedCloudinaryUrl(storageKey) {
  if (!cloudinaryConfigured) throw new Error('Cloud image storage is not configured.');
  return cloudinary.utils.private_download_url(storageKey, 'webp', {
    resource_type: 'image',
    type: 'authenticated',
    expires_at: Math.floor(Date.now() / 1000) + 300,
    attachment: false
  });
}
