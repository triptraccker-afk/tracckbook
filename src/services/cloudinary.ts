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
