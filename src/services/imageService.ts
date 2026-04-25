import imageCompression from 'browser-image-compression';
import { getApiUrl } from '../lib/api';

/**
 * Service for handling image uploads to Cloudinary via backend
 */

export interface ImageRecord {
  id?: string;
  image_url: string;
  public_id: string;
  created_at?: string;
}

// Cloudinary Config (Direct Upload)
const CLOUDINARY_CLOUD_NAME = 'dd2kcpetc';
const CLOUDINARY_UPLOAD_PRESET = 'trackbook_preset';

// Compression options for mobile stability
const compressionOptions = {
  maxSizeMB: 0.5, // Target ~500KB as requested
  maxWidthOrHeight: 1600,
  useWebWorker: true,
  initialQuality: 0.7
};

async function compressFile(file: File): Promise<File> {
  // Only compress images
  if (!file.type.startsWith('image/')) return file;
  
  // Skip if already small
  if (file.size < 0.8 * 1024 * 1024) return file;
  
  try {
    console.log(`[ImageService] Compressing ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)...`);
    const compressedBlob = await imageCompression(file, compressionOptions);
    const compressedFile = new File([compressedBlob], file.name, {
      type: file.type,
      lastModified: Date.now(),
    });
    console.log(`[ImageService] Compressed to ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`);
    return compressedFile;
  } catch (error) {
    console.error('[ImageService] Compression failed, using original:', error);
    return file;
  }
}

/**
 * Register the uploaded image URL in our own database
 */
async function registerImageWithServer(imageUrl: string, publicId: string, options?: { userId?: string, userName?: string, userEmail?: string, folder?: string }): Promise<any> {
  const apiEndpoint = getApiUrl(`/api/images/register`);
  try {
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl,
        publicId,
        userId: options?.userId,
        userName: options?.userName,
        userEmail: options?.userEmail,
        folder: options?.folder
      }),
      credentials: 'include'
    });
    
    if (!response.ok) {
      console.warn('[ImageService] Failed to register image in DB, but it exists on Cloudinary');
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error('[ImageService] Error registering image on server:', error);
    return null;
  }
}

export async function fetchImages(): Promise<ImageRecord[]> {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const cacheBuster = `t=${Date.now()}`;
      const url = getApiUrl(`/api/images?${cacheBuster}`);
      const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
      
      const response = await fetch(fullUrl, { method: 'GET' });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      return await response.json();
    } catch (error: any) {
      attempt++;
      if (attempt >= maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  return [];
}

export async function deleteImage(publicId: string): Promise<void> {
  const url = getApiUrl(`/api/images/${encodeURIComponent(publicId)}`);
  try {
    const response = await fetch(url, { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Delete failed');
    }
  } catch (error) {
    console.error('[ImageService] Delete error:', error);
    throw error;
  }
}

export interface UploadResponse {
  id?: string;
  imageUrl: string;
  public_id: string;
  db_id?: string;
  urls?: string[];
  db_ids?: string[];
  thumbnailUrl?: string;
}

/**
 * DIRECT UPLOAD TO CLOUDINARY (No server-side file processing)
 */
export async function uploadImage(file: File, options?: { userId?: string, userName?: string, userEmail?: string, folder?: string }): Promise<UploadResponse> {
  const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
  
  console.log("UPLOAD URL:", cloudinaryUrl);
  console.log(`[ImageService] >>> DIRECT UPLOAD START <<<`);
  console.log(`[ImageService] Target URL: ${cloudinaryUrl}`);
  console.log(`[ImageService] File: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);

  // 1. Compress Client-Side
  console.log(`[ImageService] Step 1: Compressing file...`);
  const compressedFile = await compressFile(file);
  console.log(`[ImageService] Compressed size: ${(compressedFile.size / 1024).toFixed(1)} KB`);
  
  // 2. Prepare Direct Cloudinary Upload
  console.log(`[ImageService] Step 2: Preparing FormData for Cloudinary...`);
  const formData = new FormData();
  formData.append('file', compressedFile);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  
  // Optional: User-specific folder structure
  if (options?.userId) {
    const sanitizedName = (options.userName || 'user').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const folderPath = `trackbook/users/${sanitizedName}_${options.userId.slice(0, 8)}/receipts`;
    formData.append('folder', folderPath);
    console.log(`[ImageService] Target folder: ${folderPath}`);
  }

  try {
    console.log(`[ImageService] Step 3: Fetching to Cloudinary API...`);
    const response = await fetch(cloudinaryUrl, {
      method: 'POST',
      body: formData
      // CRITICAL: NO custom headers (like Authorization) should be sent to Cloudinary for unsigned uploads
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[ImageService] Cloudinary API Error:', errorData);
      throw new Error(`Cloudinary Error: ${errorData.error?.message || 'Upload failed'}`);
    }

    const data = await response.json();
    console.log('[ImageService] Step 4: Cloudinary Success!', data.secure_url);

    // 3. Register with our server for DB persistence (metadata only - tiny JSON)
    console.log(`[ImageService] Step 5: Registering metadata with backend...`);
    const dbRecord = await registerImageWithServer(data.secure_url, data.public_id, options);

    return {
      imageUrl: data.secure_url,
      public_id: data.public_id,
      db_id: dbRecord?.db_id || dbRecord?.id
    };
  } catch (error: any) {
    console.error('[ImageService] CRITICAL UPLOAD FAILURE:', error);
    throw error;
  }
}

/**
 * Sequential batch upload
 */
export async function uploadMultipleImages(files: File[], options?: { userId?: string, userName?: string, userEmail?: string, folder?: string }): Promise<UploadResponse> {
  const urls: string[] = [];
  const db_ids: string[] = [];
  const public_ids: string[] = [];

  for (const file of files) {
    try {
      const result = await uploadImage(file, options);
      urls.push(result.imageUrl);
      public_ids.push(result.public_id);
      if (result.db_id) db_ids.push(result.db_id);
    } catch (e) {
      console.error(`[ImageService] Batch item failed:`, e);
      // Continue with others
    }
  }

  if (urls.length === 0) throw new Error('All uploads in batch failed');

  return {
    imageUrl: urls[0],
    public_id: public_ids[0],
    urls,
    db_ids
  };
}
