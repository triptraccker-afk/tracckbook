import { supabase } from '../lib/supabase';

/**
 * Cloudinary Upload Service for Expense/Cashbook Images
 */

export async function getUserCloudinaryFolder(user?: { email?: string | null; id: string } | null): Promise<string> {
  let resolvedUser = user;
  if (!resolvedUser && supabase) {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user) {
      resolvedUser = data.session.user;
    }
  }

  if (resolvedUser) {
    const identifier = resolvedUser.email || resolvedUser.id;
    return `trackbook/${identifier}`;
  }

  throw new Error("No authenticated user found for Cloudinary folder generation.");
}

export async function uploadToCloudinary(fileDataUriOrFile: string | File, folder?: string): Promise<string> {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dd2kcpetc';
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'trackbook_preset';

  console.log(`[Cloudinary] Beginning upload process configured for:`, {
    cloudName,
    uploadPreset,
    isString: typeof fileDataUriOrFile === 'string',
    folder,
  });

  const formData = new FormData();
  formData.append('file', fileDataUriOrFile);
  formData.append('upload_preset', uploadPreset);
  if (folder) {
    formData.append('folder', folder);
  }

  try {
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
    console.log(`[Cloudinary] Posting request to: ${url}`);
    
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Cloudinary] API Error Response [${response.status}]:`, errorText);
      throw new Error(`Cloudinary upload failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('[Cloudinary] Successfully uploaded image. Response data parsed:', {
      public_id: data.public_id,
      secure_url: data.secure_url,
      format: data.format,
      bytes: data.bytes
    });

    if (!data.secure_url) {
      throw new Error('Cloudinary response did not contain a valid secure_url field');
    }

    return data.secure_url;
  } catch (error: any) {
    console.error('[Cloudinary] Failure in uploadToCloudinary catch block:', error);
    throw error;
  }
}

/**
 * Optimizes Cloudinary delivery URLs for ultra-low bandwidth usage
 * Also proxies any non-Cloudinary images through Cloudinary Fetch to protect Supabase egress
 */
/**
 * Centralized attachment URL resolver that maintains full backward compatibility.
 * Supports:
 * - Old Cloudinary URLs (using /upload/ or legacy transforms)
 * - Current Cloudinary URLs (using /image/upload/)
 * - Existing Supabase records (e.g., external URLs, base64 data, etc.)
 * - Future uploads
 * 
 * Never hardcodes Cloudinary folder paths. It dynamically extracts folder structure
 * from the stored URL segment.
 */
export function resolveAttachmentUrl(
  url: string,
  type: 'preview' | 'fullscreen' | 'export_strong' | 'export_low' | 'export_high' = 'preview'
): string {
  if (!url || typeof url !== 'string') return '';
  
  // 1. Direct pass-through for local references
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('local-img-')) {
    return url;
  }

  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dd2kcpetc';

  // Define transformations
  let transformation = '';
  if (type === 'preview') {
    transformation = 'f_auto,q_auto,w_300';
  } else if (type === 'fullscreen') {
    transformation = 'f_auto,q_auto,w_1200';
  } else if (type === 'export_strong') {
    transformation = 'f_jpg,q_35,w_800';
  } else if (type === 'export_low') {
    transformation = 'f_jpg,q_40,w_900';
  } else if (type === 'export_high') {
    transformation = 'f_jpg,q_82';
  }

  // 2. If it's a non-Cloudinary external URL, proxy it through Cloudinary Fetch for egress protection
  if (!url.includes('cloudinary.com')) {
    return `https://res.cloudinary.com/${cloudName}/image/fetch/${transformation}/${encodeURIComponent(url)}`;
  }

  // 3. For Cloudinary URLs, normalize and optimize them dynamically
  // Find where the delivery/resource type ends and folder/public_id path begins.
  // Standard splitters:
  // - /image/upload/
  // - /image/private/
  // - /image/authenticated/
  // - /raw/upload/
  // - /video/upload/
  // - /upload/
  let splitter = '/image/upload/';
  if (url.includes('/image/upload/')) {
    splitter = '/image/upload/';
  } else if (url.includes('/upload/')) {
    splitter = '/upload/';
  } else if (url.includes('/image/private/')) {
    splitter = '/image/private/';
  } else if (url.includes('/image/authenticated/')) {
    splitter = '/image/authenticated/';
  } else if (url.includes('/image/fetch/')) {
    // If it's already a fetch url, extract the original URL and re-proxy or update transformations
    const fetchParts = url.split('/image/fetch/');
    const remaining = fetchParts[1];
    if (remaining) {
      const segments = remaining.split('/');
      const cleanSegments = segments.filter(s => {
        if (!s) return false;
        const transformationKeys = ['w_', 'h_', 'q_', 'f_', 'c_', 'r_', 'dpr_', 'auto'];
        return !transformationKeys.some(key => s.startsWith(key) || s.includes(',' + key));
      });
      const originalUrlSegment = cleanSegments.join('/');
      let originalUrl = originalUrlSegment;
      try {
        originalUrl = decodeURIComponent(originalUrlSegment);
      } catch (e) {
        // use as-is if decoding fails
      }
      return `https://res.cloudinary.com/${cloudName}/image/fetch/${transformation}/${encodeURIComponent(originalUrl)}`;
    }
    splitter = '/image/fetch/';
  }

  const parts = url.split(splitter);
  if (parts.length < 2) return url;

  const prefix = parts[0]; // e.g. "https://res.cloudinary.com/dd2kcpetc"
  const remaining = parts[1]; // e.g. "v1700000000/trackbook/test@example.com/receipt123.jpg"

  if (!remaining) return url;

  // Split and filter out older transformations and version numbers
  const segments = remaining.split('/');
  const cleanSegments = segments.filter(s => {
    if (!s) return false;
    // Skip version tag (e.g. v170000000 or v1)
    if (/^v\d+$/.test(s)) return false;
    // Skip transformation segments
    const transformationKeys = ['w_', 'h_', 'q_', 'f_', 'c_', 'r_', 'dpr_', 'bo_', 'co_', 'e_', 'fl_', 'l_', 'p_', 'pg_', 'x_', 'y_', 'z_', 'auto'];
    const isTransformation = transformationKeys.some(key => s.startsWith(key) || s.includes(',' + key));
    if (isTransformation) return false;
    return true;
  });

  // Re-assemble the URL using the requested transformation
  return `${prefix}${splitter}${transformation}/${cleanSegments.join('/')}`;
}

/**
 * Optimizes Cloudinary delivery URLs for ultra-low bandwidth usage
 * Also proxies any non-Cloudinary images through Cloudinary Fetch to protect Supabase egress
 */
export function getOptimizedCloudinaryUrl(url: string, type: 'preview' | 'fullscreen'): string {
  return resolveAttachmentUrl(url, type);
}

/**
 * Pre-generate lightweight export URLs by stripping transformations and applying lightweight export-specific transforms
 * Also proxies any non-Cloudinary images through Cloudinary Fetch
 */
export function getExportOptimizedCloudinaryUrl(url: string, isCompressed: boolean, isHuge: boolean): string {
  if (isCompressed) {
    return resolveAttachmentUrl(url, isHuge ? 'export_strong' : 'export_low');
  }
  return resolveAttachmentUrl(url, 'export_high');
}
