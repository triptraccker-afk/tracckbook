/**
 * Cloudinary Upload Service for Expense/Cashbook Images
 */

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
export function getOptimizedCloudinaryUrl(url: string, type: 'preview' | 'fullscreen'): string {
  if (!url || typeof url !== 'string') return '';
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dd2kcpetc';
  const transformation = type === 'preview' ? 'f_auto,q_auto,w_300' : 'f_auto,q_auto,w_1200';

  if (!url.includes('cloudinary.com')) {
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      return url;
    }
    // Egress protection: proxy non-Cloudinary images through Cloudinary image/fetch API
    return `https://res.cloudinary.com/${cloudName}/image/fetch/${transformation}/${encodeURIComponent(url)}`;
  }

  if (url.includes('/image/upload/')) {
    const parts = url.split('/image/upload/');
    const remaining = parts[1];
    if (!remaining) return url;
    
    const folderAndFile = remaining.split('/');
    const cleanSegments = folderAndFile.filter(s => {
      return !(s.includes('w_') || s.includes('q_') || s.includes('f_') || s.includes('c_') || s.includes('h_') || s.includes('dpr_'));
    });
    
    return `${parts[0]}/image/upload/${transformation}/${cleanSegments.join('/')}`;
  }
  
  return url;
}

/**
 * Pre-generate lightweight export URLs by stripping transformations and applying lightweight export-specific transforms
 * Also proxies any non-Cloudinary images through Cloudinary Fetch
 */
export function getExportOptimizedCloudinaryUrl(url: string, isCompressed: boolean, isHuge: boolean): string {
  if (!url || typeof url !== 'string') return '';
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dd2kcpetc';

  let transformation = '';
  if (isCompressed) {
    if (isHuge) {
      transformation = 'f_jpg,q_35,w_800';
    } else {
      transformation = 'f_jpg,q_40,w_900';
    }
  } else {
    // Original quality mode preservation
    transformation = 'f_jpg,q_82';
  }

  if (!url.includes('cloudinary.com')) {
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      return url;
    }
    // Egress protection: proxy non-Cloudinary images through Cloudinary image/fetch API
    return `https://res.cloudinary.com/${cloudName}/image/fetch/${transformation}/${encodeURIComponent(url)}`;
  }

  // Support both /image/upload/ and /upload/ formats
  const splitter = url.includes('/image/upload/') ? '/image/upload/' : '/upload/';
  const parts = url.split(splitter);
  const remaining = parts[1];
  if (!remaining) return url;
  
  const folderAndFile = remaining.split('/');
  const cleanSegments = folderAndFile.filter(s => {
    return !(
      s.includes('w_') || 
      s.includes('q_') || 
      s.includes('f_') || 
      s.includes('c_') || 
      s.includes('h_') || 
      s.includes('dpr_') || 
      s.includes('auto')
    );
  });
  
  return `${parts[0]}${splitter}${transformation}/${cleanSegments.join('/')}`;
}
