import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

const envConfig = dotenv.config();
if (envConfig.parsed) {
  for (const key in envConfig.parsed) {
    if (envConfig.parsed[key]) {
      process.env[key] = envConfig.parsed[key];
    }
  }
}

// Helper to deduce meal type from time
function getMealType(timeStr: string): "Breakfast" | "Lunch" | "Dinner" | undefined {
  try {
    const clean = timeStr.trim().toUpperCase();
    const isPM = clean.includes("PM");
    const isAM = clean.includes("AM");
    
    const match = clean.match(/(\d{1,2})[\s:]+(\d{2})/);
    if (!match) return undefined;
    
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    
    if (isPM && hours < 12) {
      hours += 12;
    } else if (isAM && hours === 12) {
      hours = 0;
    }
    
    const totalMinutes = hours * 60 + minutes;
    
    // Breakfast: 06:00 AM → 11:59 AM (360 to 719 minutes)
    if (totalMinutes >= 360 && totalMinutes <= 719) {
      return "Breakfast";
    }
    // Lunch: 12:00 PM → 06:00 PM (720 to 1080 minutes)
    if (totalMinutes >= 720 && totalMinutes <= 1080) {
      return "Lunch";
    }
    // Dinner: 06:01 PM → 11:59 PM or midnight-early morning fallback
    return "Dinner";
  } catch (e) {
    return undefined;
  }
}

// Helper to build intelligent entry description
function generateSmartDescription(billType: string, groupSize: number, meal?: string): string {
  const normType = billType.toLowerCase();
  
  if (normType === "food" || normType === "restaurant") {
    if (meal) {
      if (groupSize > 1) {
        return `${meal} for ${groupSize} Members`;
      }
      return meal;
    }
    if (groupSize > 1) {
      return `Food for ${groupSize} Members`;
    }
    return "Food";
  }
  
  if (normType === "taxi" || normType === "cab") {
    if (groupSize > 1) {
      return `Taxi Ride for ${groupSize} Members`;
    }
    return "Taxi Ride";
  }
  
  if (normType === "bus") {
    return "Bus Travel";
  }
  
  if (normType === "train") {
    return "Train Travel";
  }
  
  // Custom smart descriptions for other fields
  if (groupSize > 1) {
    return `${billType} for ${groupSize} Members`;
  }
  return `${billType} Expense`;
}

// Helper to classify Gemini errors accurately
function classifyGeminiError(error: any, apiKeyExists: boolean): { type: string; message: string; isRetryable: boolean } {
  const originalMessage = error?.message || (error?.error && error?.error?.message) || String(error);
  
  if (!apiKeyExists) {
    return {
      type: "MISSING_API_KEY",
      message: "AI configuration error. GEMINI_API_KEY, GEMINI_KEY, or GOOGLE_API_KEY is not defined in system environment secrets.",
      isRetryable: false
    };
  }

  const msg = String(originalMessage).toUpperCase();
  const status = error?.status || error?.statusCode || (error?.error && error?.error?.status) || "";
  const code = error?.code || (error?.error && error?.error?.code) || 0;
  const statusStr = String(status).toUpperCase();

  // 1. Invalid or Expired API Key
  const isInvalidKey = 
    msg.includes("API_KEY_INVALID") || 
    msg.includes("API_KEY") || 
    msg.includes("API KEY") ||
    msg.includes("INVALID_ARGUMENT") || 
    msg.includes("EXPIRED") || 
    statusStr.includes("INVALID") || 
    code === 400 ||
    status === 400;

  if (isInvalidKey) {
    return {
      type: "INVALID_API_KEY",
      message: `Gemini API Key is invalid or has expired: ${originalMessage}. Please check GEMINI_API_KEY, GEMINI_KEY, or GOOGLE_API_KEY secret under Settings > Secrets.`,
      isRetryable: false
    };
  }

  // 2. 429 Rate Limit
  const isRateLimit = 
    code === 429 || 
    status === 429 || 
    msg.includes("429") || 
    msg.includes("RATE_LIMIT") || 
    msg.includes("RESOURCE_EXHAUSTED") || 
    msg.includes("QUOTA");

  if (isRateLimit) {
    return {
      type: "RATE_LIMIT",
      message: `Daily AI quota or rate limit exceeded: ${originalMessage}. Please try again later.`,
      isRetryable: true
    };
  }

  // 3. Network Temp / Timeout
  const isTimeout = 
    msg.includes("TIMEOUT") || 
    msg.includes("TIMEDOUT") || 
    msg.includes("DEADLINE_EXCEEDED") || 
    code === "ETIMEDOUT" ||
    error?.name === "TimeoutError";

  if (isTimeout) {
    return {
      type: "TIMEOUT",
      message: `AI request timed out: ${originalMessage}. Please try again.`,
      isRetryable: true
    };
  }

  // 4. File Too Large
  const isTooLarge = 
    msg.includes("TOO_LARGE") || 
    msg.includes("LIMIT_EXCEEDED") || 
    msg.includes("LARGE") || 
    msg.includes("PAYLOAD") || 
    code === 413 || 
    status === 413;

  if (isTooLarge) {
    return {
      type: "FILE_TOO_LARGE",
      message: `The uploaded receipt image is too large: ${originalMessage}. Please compress or resize the image under 10MB.`,
      isRetryable: false
    };
  }

  // 5. 503 Service Unavailable / Temporarily Busy
  const isServiceUnavailable = 
    code === 503 || 
    status === 503 || 
    msg.includes("503") || 
    msg.includes("UNAVAILABLE") || 
    msg.includes("BUSY") || 
    msg.includes("TEMP") ||
    msg.includes("500") || 
    msg.includes("INTERNAL") ||
    msg.includes("BAD GATEWAY") ||
    msg.includes("FAILED TO PRECONNECT");

  if (isServiceUnavailable) {
    return {
      type: "TEMPORARY_BUSY",
      message: `AI backend service is temporarily busy or returned a 5xx error: ${originalMessage}`,
      isRetryable: true
    };
  }

  // Fallback
  return {
    type: "UNKNOWN_ERROR",
    message: `Gemini API Error: ${originalMessage}`,
    isRetryable: true
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { 
      base64Image, 
      mimeType, 
      images,
      groupSize = 1, 
      isHandwritten = false, 
      handwrittenTime = "", 
      handwrittenIsFood = false,
      ocrText = "",
      ocrConfidence = 0
    } = req.body;
    
    if (!ocrText && !base64Image && (!images || !Array.isArray(images) || images.length === 0)) {
      return res.status(400).json({ error: "No receipt image or OCR text provided." });
    }

    const headerKey = req.headers["x-gemini-api-key"] || req.headers["X-Gemini-Api-Key"];
    const customKey = typeof headerKey === 'string' ? headerKey.trim() : '';
    const apiKey = (customKey || process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "").trim();
    
    if (apiKey === "") {
      console.error("[Vercel Serverless AI] Missing GEMINI_API_KEY, GEMINI_KEY, or GOOGLE_API_KEY environment variable/header during extraction request.");
      return res.status(500).json({ 
        error: "AI is not configured. Please add GEMINI_API_KEY, GEMINI_KEY, or GOOGLE_API_KEY under Settings > Secrets on the platform." 
      });
    }

    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });

    console.log(`[Vercel Serverless AI] Parsing receipt. Group Size: ${groupSize}, Hand-written: ${isHandwritten}, Time: ${handwrittenTime}, Is Food: ${handwrittenIsFood}, Multiple Images: ${!!images}, OCR Text: ${!!ocrText} (${ocrConfidence}%)`);

    const retryIntervals = [2000, 5000, 10000]; // Attempt 1, 2, 3 delays
    const maxAttempts = 4; // 1 initial + 3 retries
    const modelsToTry = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.5-pro", "gemini-3.5-flash"];
    let response: any = null;
    let geminiError: any = null;

    const useOcrOnly = ocrText && typeof ocrConfidence === 'number' && ocrConfidence >= 80;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const currentModel = modelsToTry[Math.min(attempt - 1, modelsToTry.length - 1)];
        console.log(`[Vercel Serverless AI] Attempt ${attempt}/${maxAttempts} using model: ${currentModel}`);
        
        const customInstructions = isHandwritten 
          ? `NOTE: This is a HAND-WRITTEN/informal bill or receipt (difficult to read). Focus primarily on locating the final GRAND TOTAL/amount. Note that the time is specified as '${handwrittenTime || "12:00 PM"}' and this is a ${handwrittenIsFood ? "FOOD expense (so please classify category as 'Food' and billType as 'Food' or 'Restaurant')" : "non-food expense"}.` 
          : "";

        const contentsParts: any[] = [];
        
        if (useOcrOnly) {
          console.log(`[Vercel Serverless AI] Using OCR-only mode (confidence: ${ocrConfidence}%)`);
          contentsParts.push({ text: `RAW RECEIPT OCR TEXT:\n${ocrText}` });
        } else {
          console.log(`[Vercel Serverless AI] Using fallback mode (OCR confidence: ${ocrConfidence || 0}%) - including images`);
          if (ocrText) {
            contentsParts.push({ text: `RAW RECEIPT OCR TEXT (Confidence: ${ocrConfidence}%):\n${ocrText}` });
          }
          const inlineParts = (images && Array.isArray(images) && images.length > 0)
            ? images.map(img => ({ inlineData: { data: img.base64 || img.base64Image, mimeType: img.mimeType || "image/jpeg" } }))
            : (base64Image ? [{ inlineData: { data: base64Image, mimeType: mimeType || "image/jpeg" } }] : []);
          contentsParts.push(...inlineParts);
        }

        contentsParts.push({ 
          text: `Analyze this receipt. Return standard JSON.
${customInstructions}
Extract and classify into the following keys carefully:
1. amount: This must be a number representing the grand total of the receipt. If multiple receipts, return the SUM of their grand totals.
2. merchant: Name of the vendor/merchant.
3. billType: MUST be classified into exactly one of these: Restaurant, Food, Taxi, Cab, Bus, Train, Flight, Fuel, Groceries, Medical, Shopping, Utilities, Internet, Recharge, Hotel, Entertainment. (If it is a handwritten food bill, return 'Food' or 'Restaurant').
4. category: Maps to standard transaction categories. Use this mapping:
   - Restaurant, Food -> Food
   - Taxi, Cab, Bus, Train, Flight, Fuel -> Transport
   - Utilities, Internet, Recharge -> Utilities
   - Shopping -> Shopping
   - Entertainment -> Entertainment
   - Medical -> Health
   - Hotel -> Other
5. date: Extract the main payment/invoice date in DD-MM-YYYY format.
6. time: ${isHandwritten && handwrittenTime ? `Return exactly "${handwrittenTime}"` : `Extract the time of the receipt. Use HH:mm format if possible (e.g. 13:45 or 08:30) or standard 12-hour AM/PM. Do your best to extract it. If not found, return "12:00 PM".`}
7. isHandwritten: Set to true if the receipt is handwritten (or has pen/pencil markings, filled by hand templates, or is a hand-written slip), other set to false.`
        });

        response = await ai.models.generateContent({
          model: currentModel,
          contents: contentsParts,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                amount: { type: Type.NUMBER },
                merchant: { type: Type.STRING },
                billType: { type: Type.STRING },
                category: { type: Type.STRING },
                date: { type: Type.STRING },
                time: { type: Type.STRING },
                isHandwritten: { type: Type.BOOLEAN }
              },
              required: ["amount", "merchant", "billType", "category", "date", "time", "isHandwritten"]
            }
          }
        });
        geminiError = null;
        break; // Success! Exit retry loop
      } catch (error: any) {
        geminiError = error;
        
        // Show detailed backend Gemini error log in server console
        console.error(`[Vercel Serverless AI] Attempt ${attempt} failed with error!`);
        console.error("--- DETAILED GEMINI ERROR LOG ---");
        console.error("Gemini Response Status:", error?.status || error?.statusCode || "N/A");
        console.error("Gemini Error Code:", error?.code || (error?.error && error?.error?.code) || "N/A");
        console.error("Gemini Error Message:", error?.message || (error?.error && error?.error?.message) || String(error));
        if (error?.stack) {
          console.error("Stack Trace:", error.stack);
        }
        let safeStr = "N/A";
        try {
          safeStr = JSON.stringify(error, null, 2);
        } catch (_) {
          safeStr = String(error);
        }
        console.error("Full Error Object:", safeStr);
        console.error("---------------------------------");
        
        const classification = classifyGeminiError(error, !!apiKey);
        console.error(`[Vercel Serverless AI] Classified Type: ${classification.type}. User-Facing Message: "${classification.message}". Retryable: ${classification.isRetryable}`);

        if (classification.isRetryable && attempt < maxAttempts) {
          const delay = retryIntervals[attempt - 1];
          // Log specific message
          if (classification.type === "TEMPORARY_BUSY" || classification.type === "UNKNOWN_ERROR") {
            console.log(`[Vercel Serverless AI] Gemini service is temporarily busy. Retrying... Waiting ${delay}ms before attempt ${attempt + 1}...`);
          } else {
            console.log(`[Vercel Serverless AI] Retryable Gemini API error encountered (${classification.message}). Waiting ${delay}ms before attempt ${attempt + 1}...`);
          }
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          break; // Non-retryable error or max attempts reached
        }
      }
    }

    if (geminiError) {
      const classification = classifyGeminiError(geminiError, !!apiKey);
      let statusCode = 500;
      if (classification.type === "INVALID_API_KEY" || classification.type === "MISSING_API_KEY") statusCode = 401;
      else if (classification.type === "RATE_LIMIT") statusCode = 429;
      else if (classification.type === "TIMEOUT") statusCode = 504;
      else if (classification.type === "FILE_TOO_LARGE") statusCode = 413;
      else if (classification.type === "TEMPORARY_BUSY") statusCode = 503;

      console.error(`[Vercel Serverless AI] Final API Failure: Status ${statusCode}, returning friendly message: "${classification.message}"`);
      return res.status(statusCode).json({ error: classification.message });
    }

    const textResult = response?.text?.trim();
    if (!textResult) {
      throw new Error("Empty response received from Gemini.");
    }

    const parsedData = JSON.parse(textResult);
    
    // Server-side normalization & post-processing for high accuracy & compliance
    const finalAmount = typeof parsedData.amount === "number" ? parsedData.amount : parseFloat(parsedData.amount) || 0;
    
    // Normalize Bill Type
    const validBillTypes = [
      "Restaurant", "Food", "Taxi", "Cab", "Bus", "Train", "Flight", "Fuel", 
      "Groceries", "Medical", "Shopping", "Utilities", "Internet", "Recharge", 
      "Hotel", "Entertainment"
    ];
    let finalBillType = parsedData.billType || "Other";
    const foundType = validBillTypes.find(t => t.toLowerCase() === finalBillType.toLowerCase());
    if (foundType) finalBillType = foundType;

    // Detect Meal Type (Breakfast, Lunch, Dinner for Food category)
    const finalTime = parsedData.time || "12:00 PM";
    let mealType: string | undefined = undefined;
    if (finalBillType === "Food" || finalBillType === "Restaurant") {
      mealType = getMealType(finalTime);
    }

    // Auto Entry Description
    const finalDescription = generateSmartDescription(finalBillType, groupSize, mealType);

    // Categories mapping fallback
    let finalCategory = parsedData.category || "Other";
    const categoryMapping: Record<string, string> = {
      restaurant: "Food",
      food: "Food",
      taxi: "Transport",
      cab: "Transport",
      bus: "Transport",
      train: "Transport",
      flight: "Transport",
      fuel: "Transport",
      groceries: "Food",
      medical: "Health",
      shopping: "Shopping",
      utilities: "Utilities",
      internet: "Utilities",
      recharge: "Utilities",
      hotel: "Other",
      entertainment: "Entertainment"
    };
    if (categoryMapping[finalBillType.toLowerCase()]) {
      finalCategory = categoryMapping[finalBillType.toLowerCase()];
    }

    return res.status(200).json({
      amount: finalAmount,
      merchant: parsedData.merchant || "Unknown Vendor",
      billType: finalBillType,
      category: finalCategory,
      date: parsedData.date || "27-05-2026",
      time: finalTime,
      mealType: mealType,
      description: finalDescription,
      groupSize: groupSize,
      isHandwritten: parsedData.isHandwritten ?? isHandwritten
    });

  } catch (error: any) {
    console.error("[Vercel Serverless AI] Error:", error);
    return res.status(500).json({ error: error.message || "An error occurred during AI processing." });
  }
}
