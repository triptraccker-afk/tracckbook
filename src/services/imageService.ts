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
  maxSizeMB: 1.5, // Increased to 1.5MB for even faster processing
  maxWidthOrHeight: 1024, // Reduced to 1024 for speed (receipts don't need more)
  useWebWorker: true,
  initialQuality: 0.8, // Faster initial encoding
  alwaysKeepType: true,
  preserveExif: false 
};

async function compressFile(file: File): Promise<File> {
  // Only compress images
  if (!file.type.startsWith('image/')) return file;
  
  // Skip if already reasonable size (under 2MB skipping saves processing time)
  if (file.size < 2.0 * 1024 * 1024) {
    console.log(`[ImageService] Skipping compression for ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB).`);
    return file;
  }
  
  try {
    console.log(`[ImageService] Fast-Optimizing ${file.name}...`);
    const startTime = Date.now();
    const compressedBlob = await imageCompression(file, compressionOptions);
    const compressedFile = new File([compressedBlob], file.name, {
      type: file.type,
      lastModified: Date.now(),
    });
    console.log(`[ImageService] Optimized to ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB in ${Date.now() - startTime}ms`);
    return compressedFile;
  } catch (error) {
    console.error('[ImageService] Optimization failed, using original:', error);
    return file;
  }
}

/**
 * Register the uploaded image URL in our own database
 */
async function registerImageWithServer(imageUrl: string, publicId: string, options?: { userId?: string, userName?: string, userEmail?: string, folder?: string }): Promise<any> {
  const apiEndpoint = '/api/images/register';
  
  console.log(`[ImageService] Registering image at relative path: ${apiEndpoint}`);
  try {
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        imageUrl,
        publicId,
        userId: options?.userId,
        userName: options?.userName,
        userEmail: options?.userEmail,
        folder: options?.folder
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[ImageService] Registration failed (HTTP ${response.status}): ${errorText}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error('[ImageService] Error registering image on server:', error);
    // Return null instead of throwing to allow the UI to continue since the image is already on Cloudinary
    return null;
  }
}

export async function fetchImages(): Promise<ImageRecord[]> {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const cacheBuster = `t=${Date.now()}`;
      const apiEndpoint = `/api/images?${cacheBuster}`;
      
      console.log(`[ImageService] Fetching images from: ${apiEndpoint}`);
      const response = await fetch(apiEndpoint, { method: 'GET' });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      return await response.json();
    } catch (error: any) {
      attempt++;
      console.warn(`[ImageService] Fetch attempt ${attempt} failed:`, error.message);
      if (attempt >= maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  return [];
}

export async function deleteImage(publicId: string): Promise<void> {
  const apiEndpoint = `/api/images/${encodeURIComponent(publicId)}`;
  try {
    console.log(`[ImageService] Deleting image: ${apiEndpoint}`);
    const response = await fetch(apiEndpoint, { method: 'DELETE' });
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
 * Parallel batch upload for speed
 */
export async function uploadMultipleImages(files: File[], options?: { userId?: string, userName?: string, userEmail?: string, folder?: string }): Promise<UploadResponse> {
  console.log(`[ImageService] >>> BATCH UPLOAD START (Parallel) - ${files.length} files <<<`);
  
  const uploadPromises = files.map(file => 
    uploadImage(file, options).catch(e => {
      console.error(`[ImageService] Individual upload failed: ${file.name}`, e);
      return null;
    })
  );

  const results = await Promise.all(uploadPromises);
  const successfulResults = results.filter((r): r is UploadResponse => r !== null);

  if (successfulResults.length === 0) throw new Error('All uploads in batch failed');

  return {
    imageUrl: successfulResults[0].imageUrl,
    public_id: successfulResults[0].public_id,
    urls: successfulResults.map(r => r.imageUrl),
    db_ids: successfulResults.map(r => r.db_id || '').filter(Boolean)
  };
}
