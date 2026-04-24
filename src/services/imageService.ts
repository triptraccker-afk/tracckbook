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

// Compression options for mobile stability
const compressionOptions = {
  maxSizeMB: 0.8, // Aim for under 1MB for serverless safety
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  initialQuality: 0.8
};

async function compressFile(file: File): Promise<File> {
  // Only compress images
  if (!file.type.startsWith('image/')) return file;
  
  // Skip if already small
  if (file.size < 1.1 * 1024 * 1024) return file;
  
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

export async function fetchImages(): Promise<ImageRecord[]> {
  const maxRetries = 5;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const cacheBuster = `t=${Date.now()}`;
      const url = getApiUrl(`/api/images?${cacheBuster}`);
      const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
      console.log(`[ImageService] Fetching images from: ${fullUrl}`);
      
      const response = await fetch(fullUrl, {
        method: 'GET'
      });
      
      if (!response.ok) {
        let errorBody = '';
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errorData = await response.json();
            errorBody = errorData.error || errorData.message || JSON.stringify(errorData);
          } else {
            errorBody = await response.text();
          }
        } catch (e) {
          errorBody = response.statusText;
        }
        
        console.error(`[ImageService] Request failed with status ${response.status}:`, errorBody.substring(0, 200));
        throw new Error(`Server returned ${response.status}: ${errorBody.substring(0, 100)}`);
      }
      
      const data = await response.json();
      console.log(`[ImageService] Successfully retrieved ${data?.length || 0} images.`);
      return data;
    } catch (error: any) {
      attempt++;
      const isNetworkError = error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('NetworkError'));
      console.error(`[ImageService] Sync attempt ${attempt} encountered ${isNetworkError ? 'Network Connectivity Issue' : 'Error'}:`, error.message);
      
      if (attempt >= maxRetries) {
        throw new Error(`Critical: Failed to sync images after ${maxRetries} attempts. Network status: ${error.message}`);
      }
      
      const delay = Math.min(Math.pow(2, attempt - 1) * 1000, 10000);
      console.log(`[ImageService] Scheduled retry in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return [];
}

export async function deleteImage(publicId: string): Promise<void> {
  const url = getApiUrl(`/api/images/${encodeURIComponent(publicId)}`);
  try {
    const response = await fetch(url, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Delete failed');
    }
  } catch (error) {
    console.error('[ImageService] Delete image error:', error);
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

export async function uploadImage(file: File, options?: { userId?: string, userName?: string, userEmail?: string, folder?: string }): Promise<UploadResponse> {
  // Compress before uploading
  const compressedFile = await compressFile(file);
  
  const formData = new FormData();
  
  // Important: Append other fields BEFORE the file for some multer configurations to parse req.body correctly
  if (options?.userId) formData.append('userId', options.userId);
  if (options?.userName) formData.append('userName', options.userName);
  if (options?.userEmail) formData.append('userEmail', options.userEmail);
  if (options?.folder) formData.append('folder', options.folder);
  
  // Append the compressed file
  formData.append('image', compressedFile);

  console.log('[ImageService] FormData prepared:', {
    userId: options?.userId,
    userName: options?.userName,
    userEmail: options?.userEmail,
    folder: options?.folder,
    fileName: compressedFile.name,
    size: (compressedFile.size / 1024).toFixed(1) + ' KB'
  });

  const apiEndpoint = getApiUrl(`/api/upload`);
  // Only prepend origin if it's a relative path starting with /
  const fullEndpoint = (apiEndpoint.startsWith('/') && !apiEndpoint.startsWith('//')) 
    ? `${window.location.origin}${apiEndpoint}` 
    : apiEndpoint;

  try {
    console.log(`[ImageService] Uploading file to: ${fullEndpoint}...`);
    const response = await fetch(fullEndpoint, {
      method: 'POST',
      body: formData,
      // Ensure we don't send credentials if cross-origin unless specifically needed
      credentials: apiEndpoint.startsWith('http') && !apiEndpoint.includes(window.location.hostname) ? 'omit' : 'include'
    });

    // Read the body once as text, then decide
    const responseText = await response.text();
    let data: any;
    
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      data = null;
    }

    if (!response.ok) {
      const errorMessage = data?.error || data?.message || responseText || response.statusText || 'Upload failed';
      console.error('[ImageService] Upload failed:', errorMessage);
      throw new Error(errorMessage);
    }

    if (!data) {
      console.error('[ImageService] Error: Received non-JSON response from server:', responseText.substring(0, 500));
      throw new Error('Server returned invalid format. Expected JSON, got text/html or plain text.');
    }

    console.log('[ImageService] Upload successful:', data.imageUrl || (data.urls ? data.urls.length + ' files' : 'unknown'));
    return data;
  } catch (error: any) {
    console.error('[ImageService] Fetch error:', error);
    throw error;
  }
}

/**
 * Upload multiple files with sequential compression
 */
export async function uploadMultipleImages(files: File[], options?: { userId?: string, userName?: string, userEmail?: string, folder?: string }): Promise<UploadResponse> {
  const formData = new FormData();
  
  if (options?.userId) formData.append('userId', options.userId);
  if (options?.userName) formData.append('userName', options.userName);
  if (options?.userEmail) formData.append('userEmail', options.userEmail);
  if (options?.folder) formData.append('folder', options.folder);

  // Compress sequentially to avoid high memory spikes in browser
  for (const file of files) {
    const compressed = await compressFile(file);
    formData.append('images', compressed);
    // Explicitly plural 'images' to match multer expectations for plural uploads
  }

  const apiEndpoint = getApiUrl(`/api/upload`);
  const fullEndpoint = (apiEndpoint.startsWith('/') && !apiEndpoint.startsWith('//')) 
    ? `${window.location.origin}${apiEndpoint}` 
    : apiEndpoint;

  try {
    const response = await fetch(fullEndpoint, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      throw new Error(`Invalid server response format: ${responseText.substring(0, 100)}`);
    }

    if (!response.ok) throw new Error(data.error || 'Batch upload failed');
    return data;
  } catch (error: any) {
    console.error('[ImageService] Batch upload error:', error);
    throw error;
  }
}
