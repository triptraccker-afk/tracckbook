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
}

export async function uploadImage(file: File, options?: { userId?: string, userName?: string, userEmail?: string, folder?: string }): Promise<UploadResponse> {
  const formData = new FormData();
  
  // Important: Append other fields BEFORE the file for some multer configurations to parse req.body correctly
  if (options?.userId) formData.append('userId', options.userId);
  if (options?.userName) formData.append('userName', options.userName);
  if (options?.userEmail) formData.append('userEmail', options.userEmail);
  if (options?.folder) formData.append('folder', options.folder);
  
  // Append the file LAST
  formData.append('image', file);

  console.log('[ImageService] FormData prepared:', {
    userId: options?.userId,
    userName: options?.userName,
    userEmail: options?.userEmail,
    folder: options?.folder,
    fileName: file.name
  });

  const apiEndpoint = getApiUrl(`/api/upload`);
  // Construct absolute URL for mobile browser stability
  const fullEndpoint = apiEndpoint.startsWith('http') ? apiEndpoint : `${window.location.origin}${apiEndpoint}`;

  try {
    console.log(`[ImageService] Uploading file to: ${fullEndpoint}...`);
    const response = await fetch(fullEndpoint, {
      method: 'POST',
      body: formData,
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

    console.log('[ImageService] Upload successful:', data.imageUrl);
    return data;
  } catch (error: any) {
    console.error('[ImageService] Fetch error:', error);
    throw error;
  }
}
