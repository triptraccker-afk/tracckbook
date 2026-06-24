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
 * Compresses an image, resizes it if > 2000px, converts to JPEG/WebP,
 * and runs OCR immediately.
 */
export async function processAndOcrImage(
  file: File,
  onProgress?: (progress: number, stepName: string) => void
): Promise<OcrResult> {
  const startTime = Date.now();
  const originalSizeKB = file.size / 1024;
  
  // 1. Optimize / Compress image before OCR (Requirement 1 & 2 & 3)
  onProgress?.(15, 'Optimizing image...');
  
  const options = {
    maxSizeMB: 1.0, 
    maxWidthOrHeight: 2000, // Resize images larger than 2000px (Requirement 2)
    useWebWorker: true,
    fileType: 'image/jpeg', // Optimized JPEG conversion (Requirement 3)
    maxIteration: 2
  };

  let processedFile: File;
  try {
    console.log(`[OCR Service] Starting image optimization for ${file.name}...`);
    const compressedBlob = await imageCompression(file, options);
    processedFile = new File([compressedBlob], file.name || 'receipt.jpg', { type: 'image/jpeg' });
  } catch (err) {
    console.error('[OCR Service] browser-image-compression failed, using original:', err);
    processedFile = file;
  }
  
  const compressedSizeKB = processedFile.size / 1024;
  console.log(`[OCR Service] Optimized image: ${originalSizeKB.toFixed(1)} KB -> ${compressedSizeKB.toFixed(1)} KB`);
  onProgress?.(25, 'OCR Processing...');

  // Convert to base64
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(processedFile);
  });

  // 2. Run OCR immediately (Requirement 4)
  let text = '';
  let confidence = 0;
  const ocrStartTime = Date.now();

  try {
    onProgress?.(35, 'OCR Processing...');
    const worker = await createWorker('eng');
    
    // Check progress of OCR
    onProgress?.(45, 'Extracting raw receipt text...');
    const ret = await worker.recognize(processedFile);
    text = ret.data.text || '';
    confidence = ret.data.confidence || 0;
    
    await worker.terminate();
  } catch (ocrErr) {
    console.error('[OCR Service] Tesseract OCR failed:', ocrErr);
    // Graceful fallback to empty OCR results
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
