import imageCompression from 'browser-image-compression';
import { createWorker } from 'tesseract.js';

export interface OcrResult {
  text: string;
  confidence: number;
  base64: string;
  ocr_duration_ms: number;
  compressedSizeKB: number;
  originalSizeKB: number;
}

/**
 * Advanced preprocessing for receipt images to optimize OCR accuracy:
 * 1. Convert to grayscale (luminosity formula)
 * 2. Increase contrast (contrast factor)
 * 3. Remove noise (binarization / thresholding noise cleanup)
 * 4. Auto rotate (rotate landscape 90 degrees to portrait)
 * 5. Crop receipt edges (3% margin crop to eliminate background noise)
 */
async function preprocessReceiptImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      
      // Create temporary canvas to draw and auto-rotate the original image
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) {
        resolve({ blob: file, width: img.width, height: img.height });
        return;
      }

      // 4. Auto rotate: If landscape (width > height), assume it is sideways and rotate 90 degrees clockwise
      const shouldRotate = img.width > img.height;
      if (shouldRotate) {
        tempCanvas.width = img.height;
        tempCanvas.height = img.width;
        tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
        tempCtx.rotate(90 * Math.PI / 180);
        tempCtx.drawImage(img, -img.width / 2, -img.height / 2);
      } else {
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        tempCtx.drawImage(img, 0, 0);
      }

      // 5. Crop receipt edges: crop out 3% outer margin on all 4 edges to remove background/frame shadows and noise
      const cropMarginPercent = 0.03;
      const cropX = Math.round(tempCanvas.width * cropMarginPercent);
      const cropY = Math.round(tempCanvas.height * cropMarginPercent);
      const croppedWidth = tempCanvas.width - (cropX * 2);
      const croppedHeight = tempCanvas.height - (cropY * 2);

      const canvas = document.createElement('canvas');
      canvas.width = croppedWidth;
      canvas.height = croppedHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ blob: file, width: tempCanvas.width, height: tempCanvas.height });
        return;
      }

      // Draw the cropped portion
      ctx.drawImage(tempCanvas, cropX, cropY, croppedWidth, croppedHeight, 0, 0, croppedWidth, croppedHeight);

      // Pixel processing
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Contrast adjustment factor (contrast level = 65)
        const contrast = 65;
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // 1. Convert to grayscale (luminosity formula)
          let gray = 0.299 * r + 0.587 * g + 0.114 * b;

          // 2. Increase contrast
          gray = factor * (gray - 128) + 128;

          // 3. Remove noise: smooth/thresholding binarization
          // If very bright, clamp to pure white (clears background paper noise and shadows)
          // If very dark, clamp to pure black (makes ink text very crisp and legible)
          if (gray > 190) {
            gray = 255;
          } else if (gray < 75) {
            gray = 0;
          }

          // Clamp
          if (gray < 0) gray = 0;
          if (gray > 255) gray = 255;

          data[i] = gray;     // R
          data[i + 1] = gray; // G
          data[i + 2] = gray; // B
        }

        ctx.putImageData(imageData, 0, 0);
      } catch (err) {
        console.warn('[OCR Preprocessing] Pixel processing error, proceeding with standard rendering:', err);
      }

      canvas.toBlob((blob) => {
        if (blob) {
          resolve({ blob, width: croppedWidth, height: croppedHeight });
        } else {
          resolve({ blob: file, width: croppedWidth, height: croppedHeight });
        }
      }, 'image/jpeg', 0.85);
    };

    img.onerror = (err) => {
      console.error('[OCR Preprocessing] Image loading error:', err);
      reject(err);
    };
  });
}

/**
 * Compresses an image, preprocesses it (grayscale, contrast, rotate, crop, noise reduction),
 * and runs Tesseract OCR immediately.
 */
export async function processAndOcrImage(
  file: File,
  onProgress?: (progress: number, stepName: string) => void
): Promise<OcrResult> {
  const startTime = Date.now();
  const originalSizeKB = file.size / 1024;
  const isImage = file.type && file.type.startsWith('image/');

  if (!isImage) {
    onProgress?.(35, 'Reading document...');
    // Convert non-image file directly to base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    
    onProgress?.(50, 'Document loaded.');
    return {
      text: '',
      confidence: 100,
      base64: base64.split(',')[1],
      ocr_duration_ms: 0,
      compressedSizeKB: originalSizeKB,
      originalSizeKB
    };
  }
  
  // 1. Optimize / Compress image before OCR
  onProgress?.(15, 'Optimizing image...');
  
  const options = {
    maxSizeMB: 1.0, 
    maxWidthOrHeight: 2000, // Resize images larger than 2000px
    useWebWorker: true,
    fileType: 'image/jpeg',
    maxIteration: 2
  };

  let compressedFile: File;
  try {
    console.log(`[OCR Service] Starting image compression for ${file.name}...`);
    const compressedBlob = await imageCompression(file, options);
    compressedFile = new File([compressedBlob], file.name || 'receipt.jpg', { type: 'image/jpeg' });
  } catch (err) {
    console.error('[OCR Service] browser-image-compression failed, using original:', err);
    compressedFile = file;
  }
  
  // 2. Preprocess receipt image on Canvas (Grayscale, Contrast, Rotate, Crop, Noise Reduction)
  onProgress?.(20, 'Preprocessing receipt image...');
  let processedBlob: Blob = compressedFile;
  try {
    console.log(`[OCR Service] Preprocessing receipt on Canvas...`);
    const prepped = await preprocessReceiptImage(compressedFile);
    processedBlob = prepped.blob;
  } catch (err) {
    console.error('[OCR Service] Preprocessing failed, using compressed image:', err);
  }

  const finalFile = new File([processedBlob], file.name || 'processed.jpg', { type: 'image/jpeg' });
  const compressedSizeKB = finalFile.size / 1024;
  console.log(`[OCR Service] Preprocessed size: ${compressedSizeKB.toFixed(1)} KB (Original: ${originalSizeKB.toFixed(1)} KB)`);

  onProgress?.(25, 'OCR Processing...');

  // Convert final preprocessed file to base64
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(finalFile);
  });

  // 3. Run OCR after preprocessing
  let text = '';
  let confidence = 0;
  const ocrStartTime = Date.now();

  try {
    onProgress?.(35, 'OCR Processing...');
    const worker = await createWorker('eng');
    
    onProgress?.(45, 'Extracting raw receipt text...');
    const ret = await worker.recognize(finalFile);
    text = ret.data.text || '';
    confidence = ret.data.confidence || 0;
    
    await worker.terminate();
  } catch (ocrErr) {
    console.error('[OCR Service] Tesseract OCR failed:', ocrErr);
    text = '';
    confidence = 0;
  }

  const ocrDuration = Date.now() - ocrStartTime;
  console.log(`[OCR Service] Completed OCR in ${ocrDuration}ms with confidence ${confidence}%`);
  onProgress?.(50, 'OCR Completed.');

  return {
    text: text.trim(),
    confidence,
    base64: base64.split(',')[1],
    ocr_duration_ms: ocrDuration,
    compressedSizeKB,
    originalSizeKB
  };
}
