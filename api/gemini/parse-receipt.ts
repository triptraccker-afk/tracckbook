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
    
    // Breakfast: 06:00 AM to 11:59 AM (360 to 719 minutes)
    if (totalMinutes >= 360 && totalMinutes <= 719) {
      return "Breakfast";
    }
    // Lunch: 12:00 PM to 06:00 PM (720 to 1080 minutes)
    if (totalMinutes >= 720 && totalMinutes <= 1080) {
      return "Lunch";
    }
    // Dinner: 06:01 PM to 11:59 PM or other times
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
  
  if (normType === "travel" || normType === "taxi" || normType === "cab" || normType === "transport") {
    if (groupSize > 1) {
      return `Travel for ${groupSize} Members`;
    }
    return "Travel";
  }
  
  if (groupSize > 1) {
    return `${billType} for ${groupSize} Members`;
  }
  return `${billType} Expense`;
}

// Helper to strictly override classification if merchant name contains any travel keywords (BUG 1)
function overrideTravelClassificationIfNeeded(data: {
  merchant: string;
  category: string;
  billType: string;
  description: string;
  groupSize: number;
  mealType?: string;
}) {
  const travelKeywords = [
    "uber", "rapido", "ola", "auto ride", "auto", "taxi", "cab", "bike ride", "redbus", "red bus", "abhibus", "abhi bus", "bus", "train", "metro"
  ];
  
  const merchantLower = (data.merchant || "").toLowerCase();
  const containsTravelKeyword = travelKeywords.some(kw => merchantLower.includes(kw));
  
  if (containsTravelKeyword) {
    data.category = "Travel";
    data.billType = "Travel";
    data.description = generateSmartDescription("Travel", data.groupSize);
    data.mealType = undefined;
  }
}

// Helper to clean and parse amounts with decimal/space support
function cleanAndParseAmount(valStr: string): number | null {
  // Remove currency symbols, commas, and trim
  let cleaned = valStr.replace(/(?:₹|rs\.?|inr|rs)/gi, '').replace(/,/g, '').trim();
  
  // Replace space with dot if it separates whole and decimal digits (e.g. "90 87" -> "90.87")
  if (/^\d+\s+\d{2}$/.test(cleaned)) {
    cleaned = cleaned.replace(/\s+/, '.');
  } else {
    cleaned = cleaned.replace(/\s+/g, '');
  }

  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

// Preprocessor to correct OCR currency issues (misreading ₹ as 2, 7, 1, or 9)
function preprocessOcrText(text: string): string {
  if (!text) return "";
  const lines = text.split('\n');
  const processedLines = lines.map(line => {
    let newLine = line;
    
    // Support: ₹, Rs, Rs., INR
    if (/(?:₹|rs\.?|inr|rs)/i.test(newLine)) {
      newLine = newLine.replace(/((?:₹|rs\.?|inr|rs)\s*)(?:2|7|1|9)\s*(\d+\.\d{2})\b/gi, '$1$2');
      newLine = newLine.replace(/((?:₹|rs\.?|inr|rs)\s*)(?:2|7|1|9)\s*(\d+\s+\d{2})\b/gi, '$1$2');
    }
    
    if (/(?:total|amount|paid|fare|net|grand|due|payable)/i.test(newLine)) {
      newLine = newLine.replace(/(total|amount|paid|fare|net|grand|due|payable)(?:\s*[:=]?\s*)(?:2|7|1|9)\s*(\d+\.\d{2})\b/gi, '$1: $2');
      newLine = newLine.replace(/(total|amount|paid|fare|net|grand|due|payable)(?:\s*[:=]?\s*)(?:2|7|1|9)\s*(\d+\s+\d{2})\b/gi, '$1: $2');
    }
    
    return newLine;
  });
  return processedLines.join('\n');
}

// Helper to check if a line looks like a date or time to avoid false positives in amount extraction
function isLineDateOrTime(line: string): boolean {
  if (/\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/.test(line)) return true;
  if (/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/.test(line)) return true;
  if (/(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(line) && /\b\d{4}\b/.test(line)) return true;
  if (/\b\d{1,2}:\d{2}\b/.test(line)) return true;
  if (/\b\d{1,2}\s*(?:am|pm)\b/i.test(line)) return true;
  return false;
}

// Helper to extract Amount
function extractAmount(text: string): number | null {
  const preprocessedText = preprocessOcrText(text);
  const lines = preprocessedText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Priority patterns in exact order: Prioritize Paid/Amount Paid over Grand Total (User's request)
  const priorityPatterns = [
    { name: "Amount Paid", regex: /\b(amount\s*paid|amt\s*paid|paid\s*amount|paid)\b/i },
    { name: "Grand Total", regex: /\b(grand\s*total)\b/i },
    { name: "Total Amount", regex: /\b(total\s*amount)\b/i },
    { name: "Net Amount", regex: /\b(net\s*amount|net\s*payable|net\s*amt)\b/i },
    { name: "Final Amount", regex: /\b(final\s*amount|final\s*bill|final\s*payable|to\s*pay)\b/i },
    { name: "Total", regex: /\btotal\b/i }
  ];

  for (const pattern of priorityPatterns) {
    for (const line of lines) {
      if (pattern.regex.test(line)) {
        if (isLineDateOrTime(line)) continue;
        const match = line.match(/(?:₹|rs\.?|inr|rs)?\s*(\d+(?:[\s.]\d{2})?)/i);
        if (match) {
          const val = cleanAndParseAmount(match[0]);
          if (val !== null && val > 0) return val;
        }
      }
    }
  }

  // Fallback 1: Search the whole text for price values with currency prefixes
  const priceRegexes = [
    /(?:₹|rs\.?|inr|rs)\s*(\d+(?:[\s.]\d{2})?)/gi,
    /total\s*(?:amount)?\s*(?:₹|rs\.?|inr|rs)?\s*(\d+(?:[\s.]\d{2})?)/gi
  ];

  for (const regex of priceRegexes) {
    let match;
    while ((match = regex.exec(preprocessedText)) !== null) {
      const val = cleanAndParseAmount(match[1]);
      if (val !== null && val > 0) return val;
    }
  }

  // Fallback 2: Find decimal numbers or integers that look like total amounts (often maximum value on receipt)
  const numberMatches = preprocessedText.match(/\b\d+(?:[\s.]\d{2})?\b/g);
  if (numberMatches) {
    const numbers = numberMatches
      .map(n => cleanAndParseAmount(n))
      .filter((n): n is number => n !== null && n > 0 && n < 100000);

    const filteredNumbers = numbers.filter(n => {
      if (n >= 2020 && n <= 2035) return false;
      return true;
    });

    if (filteredNumbers.length > 0) {
      return Math.max(...filteredNumbers);
    }
  }

  return null;
}

// Helper to extract and standardize date
function parseAndStandardizeDate(text: string): string {
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    january: "01", february: "02", march: "03", april: "04", june: "06",
    july: "07", august: "08", september: "09", october: "10", november: "11", december: "12"
  };

  const currentYear = new Date().getFullYear();

  // 1. Look for DD-MM-YYYY or DD/MM/YYYY
  const dmyRegex = /\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/;
  const dmyMatch = text.match(dmyRegex);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${day}-${month}-${year}`;
  }

  // 2. Look for YYYY-MM-DD or YYYY/MM/DD
  const ymdRegex = /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/;
  const ymdMatch = text.match(ymdRegex);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${day}-${month}-${year}`;
  }

  // 3. Look for DD Month YYYY (e.g. 24 Jun 2026)
  const textMonthRegex = /\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/;
  const textMonthMatch = text.match(textMonthRegex);
  if (textMonthMatch) {
    const day = textMonthMatch[1].padStart(2, '0');
    const monthWord = textMonthMatch[2].toLowerCase();
    const year = textMonthMatch[3];
    if (months[monthWord]) {
      return `${day}-${months[monthWord]}-${year}`;
    }
  }

  // 4. Look for Month DD YYYY (e.g. June 24, 2026)
  const monthTextRegex = /\b([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\b/;
  const monthTextMatch = text.match(monthTextRegex);
  if (monthTextMatch) {
    const monthWord = monthTextMatch[1].toLowerCase();
    const day = monthTextMatch[2].padStart(2, '0');
    const year = monthTextMatch[3];
    if (months[monthWord]) {
      return `${day}-${months[monthWord]}-${year}`;
    }
  }

  // 5. Look for d MMM or dd MMM without year (e.g. 6 May, 24 Jun)
  const textMonthNoYearRegex = /\b(\d{1,2})\s+([A-Za-z]{3,})\b/g;
  let match;
  while ((match = textMonthNoYearRegex.exec(text)) !== null) {
    const day = match[1].padStart(2, '0');
    const monthWord = match[2].toLowerCase();
    if (months[monthWord]) {
      return `${day}-${months[monthWord]}-${currentYear}`;
    }
  }

  // 6. Look for DD-MM-YY or DD/MM/YY
  const dmy2Regex = /\b(\d{1,2})[-/](\d{1,2})[-/](\d{2})\b/;
  const dmy2Match = text.match(dmy2Regex);
  if (dmy2Match) {
    const day = dmy2Match[1].padStart(2, '0');
    const month = dmy2Match[2].padStart(2, '0');
    const year = `20${dmy2Match[3]}`;
    return `${day}-${month}-${year}`;
  }

  // 7. Look for YY-MM-DD or YY/MM/DD
  const ymd2Regex = /\b(\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/;
  const ymd2Match = text.match(ymd2Regex);
  if (ymd2Match) {
    const year = `20${ymd2Match[1]}`;
    const month = ymd2Match[2].padStart(2, '0');
    const day = ymd2Match[3].padStart(2, '0');
    return `${day}-${month}-${year}`;
  }

  // Default to today's date (formatted as DD-MM-YYYY)
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  return `${day}-${month}-${year}`;
}

// Helper to extract time
function extractTime(text: string): string | null {
  const allMatches = text.match(/\b(\d{1,2}):(\d{2})(?:\s*(AM|PM|am|pm))?/gi);
  if (allMatches) {
    for (const rawMatch of allMatches) {
      const parts = rawMatch.match(/\b(\d{1,2}):(\d{2})(?:\s*(AM|PM|am|pm))?/i);
      if (parts) {
        const hrs = parseInt(parts[1], 10);
        const mins = parseInt(parts[2], 10);
        if (hrs >= 0 && hrs <= 23 && mins >= 0 && mins <= 59) {
          let suffix = parts[3] ? parts[3].toUpperCase() : "";
          if (suffix) {
            return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${suffix}`;
          } else {
            if (hrs >= 12) {
              const standardHr = hrs === 12 ? 12 : hrs - 12;
              return `${String(standardHr).padStart(2, '0')}:${String(mins).padStart(2, '0')} PM`;
            } else {
              const standardHr = hrs === 0 ? 12 : hrs;
              return `${String(standardHr).padStart(2, '0')}:${String(mins).padStart(2, '0')} AM`;
            }
          }
        }
      }
    }
  }

  const fallbackRegex = /\b(\d{1,2})[\s:]*([\d]{2})\s*(AM|PM|am|pm)?\b/i;
  const match = text.match(fallbackRegex);
  if (match) {
    const hrs = parseInt(match[1], 10);
    const mins = parseInt(match[2], 10);
    if (hrs >= 1 && hrs <= 12 && mins >= 0 && mins <= 59) {
      const suffix = match[3] ? match[3].toUpperCase() : "PM";
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${suffix}`;
    }
  }

  return null;
}

// Helper to extract merchant name & category (strictly Food or Travel)
function extractMerchantAndCategory(text: string): { merchant: string | null; category: "Food" | "Travel" | null } {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // 1. Check Travel first (Critical Issue #1)
  const travelKeywordsRegex = /\b(uber|rapido|ola|auto\s*ride|auto|taxi|cab|bike\s*ride|redbus|red\s*bus|abhibus|abhi\s*bus|bus|train|metro|blusmart|savaari)\b/i;
  
  if (travelKeywordsRegex.test(text)) {
    // Check Known Travel Merchants (Rapido, Uber, Ola, RedBus, AbhiBus, BluSmart, Savaari)
    const knownTravel = [
      { name: "Rapido", regex: /\brapido\b/i },
      { name: "Uber", regex: /\buber\b/i },
      { name: "Ola", regex: /\bola\b/i },
      { name: "RedBus", regex: /\b(redbus|red\s*bus)\b/i },
      { name: "AbhiBus", regex: /\b(abhibus|abhi\s*bus)\b/i },
      { name: "BluSmart", regex: /\bblusmart\b/i },
      { name: "Savaari", regex: /\bsavaari\b/i },
      { name: "Bike Ride", regex: /\bbike\s*ride\b/i }
    ];

    let travelMerchant: string | null = null;
    for (const item of knownTravel) {
      if (item.regex.test(text)) {
        travelMerchant = item.name;
        break;
      }
    }

    if (!travelMerchant) {
      // Find a suitable candidate as merchant
      for (const line of lines) {
        if (/^\d+$/.test(line)) continue;
        if (/\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/.test(line)) continue;
        if (/\b\d{1,2}:\d{2}\b/.test(line)) continue;
        if (/^(total|subtotal|tax|gst|cash|card|amount|fare|date|time|paid|rupees|rs|inr|₹)/i.test(line)) continue;
        if (line.length < 3) continue;
        travelMerchant = line;
        break;
      }
    }

    return {
      merchant: travelMerchant || "Travel Expense",
      category: "Travel"
    };
  }

  // 2. Check Known Food Merchants (Barkat Biryani House, KFC, Domino's, Pizza Hut, McDonald's, Paradise, Mehfil)
  const knownFood = [
    { name: "Barkat Biryani House", regex: /\b(barkat\s*biryani|barkat\s*biryani\s*house)\b/i },
    { name: "KFC", regex: /\b(kfc|kentucky\s*fried\s*chicken)\b/i },
    { name: "Domino's", regex: /\b(domino|dominos|domino's)\b/i },
    { name: "Pizza Hut", regex: /\b(pizza\s*hut)\b/i },
    { name: "McDonald's", regex: /\b(mcdonald|mcdonalds|mcdonald's|mcd)\b/i },
    { name: "Paradise", regex: /\b(paradise|paradise\s*biryani)\b/i },
    { name: "Mehfil", regex: /\b(mehfil|mehfil\s*restaurant)\b/i }
  ];

  for (const item of knownFood) {
    if (item.regex.test(text)) {
      return {
        merchant: item.name,
        category: "Food"
      };
    }
  }

  // 3. Fallback Check Food keywords
  const foodKeywords = [
    /biryani/i, /restaurant/i, /cafe/i, /kitchen/i, /hotel/i, /food/i, /dhaba/i, 
    /canteen/i, /bakery/i, /pizz/i, /burger/i, /coffee/i, /tea/i, /sweets/i, /bar/i,
    /diner/i, /grill/i, /bistro/i, /eatery/i
  ];

  let isFood = false;
  for (const kw of foodKeywords) {
    if (kw.test(text)) {
      isFood = true;
      break;
    }
  }

  // Extract a suitable merchant candidate (usually the first non-numeric/non-meta line)
  let merchantCandidate: string | null = null;
  for (const line of lines) {
    if (/^\d+$/.test(line)) continue;
    if (/\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/.test(line)) continue;
    if (/\b\d{1,2}:\d{2}\b/.test(line)) continue;
    if (/^(total|subtotal|tax|gst|cash|card|amount|fare|date|time|paid|rupees|rs|inr|₹)/i.test(line)) continue;
    if (line.length < 3) continue;

    merchantCandidate = line;
    break;
  }

  return {
    merchant: merchantCandidate,
    category: isFood ? "Food" : "Food" // Default non-travel category to Food as specified: only two supported categories are Food and Travel
  };
}

// Fallback local engine when Gemini API is busy or offline
function runFallbackEngine(ocrText: string, ocrConfidence: number, groupSize: number): any {
  const amount = extractAmount(ocrText) || 0;
  const date = parseAndStandardizeDate(ocrText);
  const { merchant, category } = extractMerchantAndCategory(ocrText);
  const time = extractTime(ocrText) || "12:00 PM";
  const finalCategory = category || "Food";
  const finalMerchant = merchant || "Unknown Vendor";
  
  let mealType: string | undefined = undefined;
  if (finalCategory === "Food") {
    mealType = getMealType(time);
  }

  const description = generateSmartDescription(finalCategory, groupSize, mealType);

  console.log(`[Fallback Engine] Successfully processed receipt locally due to Gemini failure!`);
  console.log(`  Merchant: ${finalMerchant}, Amount: ${amount}, Date: ${date}, Time: ${time}, Category: ${finalCategory}`);

  const fallbackRes = {
    amount,
    merchant: finalMerchant,
    billType: finalCategory,
    category: finalCategory,
    date,
    time,
    mealType,
    description,
    groupSize,
    isHandwritten: false
  };

  overrideTravelClassificationIfNeeded(fallbackRes);
  return fallbackRes;
}

// Rule Engine Wrapper
function runRuleEngine(ocrText: string, ocrConfidence: number, groupSize: number): any | null {
  if (!ocrText) return null;
  if (typeof ocrConfidence === 'number' && ocrConfidence < 70) {
    console.log(`[Rule Engine] OCR confidence too low (${ocrConfidence}%), skipping Rule Engine...`);
    return null;
  }

  const amount = extractAmount(ocrText);
  if (amount === null) {
    console.log(`[Rule Engine] Amount extraction failed, skipping Rule Engine...`);
    return null;
  }

  const date = parseAndStandardizeDate(ocrText);

  const { merchant, category } = extractMerchantAndCategory(ocrText);
  if (merchant === null) {
    console.log(`[Rule Engine] Merchant extraction failed, skipping Rule Engine...`);
    return null;
  }

  const time = extractTime(ocrText) || "12:00 PM";
  const finalCategory = category || "Food";
  
  let mealType: string | undefined = undefined;
  if (finalCategory === "Food") {
    mealType = getMealType(time);
  }

  const description = generateSmartDescription(finalCategory, groupSize, mealType);

  console.log(`[Rule Engine] Successful fast-extraction without Gemini!`);
  console.log(`  Merchant: ${merchant}, Amount: ${amount}, Date: ${date}, Time: ${time}, Category: ${finalCategory}`);

  const ruleRes = {
    amount,
    merchant,
    billType: finalCategory,
    category: finalCategory,
    date,
    time,
    mealType,
    description,
    groupSize,
    isHandwritten: false
  };

  overrideTravelClassificationIfNeeded(ruleRes);
  return ruleRes;
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

    // Step 1: Attempt extraction using OCR + Rule Engine FIRST
    const ruleEngineResult = runRuleEngine(ocrText, ocrConfidence, groupSize);
    if (ruleEngineResult !== null) {
      return res.status(200).json(ruleEngineResult);
    }

    // Step 2: Rule Engine failed (e.g. key details missing or low OCR confidence).
    // Proceed with Gemini fallback.
    console.log("[Rule Engine] Fallback to Gemini API triggered...");

    const headerKey = req.headers["x-gemini-api-key"] || req.headers["X-Gemini-Api-Key"];
    const customKey = typeof headerKey === 'string' ? headerKey.trim() : '';
    const apiKey = (customKey || process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "").trim();
    
    if (apiKey === "") {
      console.log("[Vercel Serverless AI] Missing GEMINI_API_KEY, GEMINI_KEY, or GOOGLE_API_KEY environment variable/header during extraction request.");
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

    console.log(`[Vercel Serverless AI] Parsing receipt via Gemini. Group Size: ${groupSize}, Hand-written: ${isHandwritten}, Time: ${handwrittenTime}, Is Food: ${handwrittenIsFood}`);

    const retryIntervals = [2000, 5000]; 
    const maxAttempts = 3;
    const modelsToTry = ["gemini-3.5-flash", "gemini-3.5-flash", "gemini-3.5-flash"];
    let response: any = null;
    let geminiError: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const currentModel = modelsToTry[attempt - 1];
        console.log(`[Vercel Serverless AI] Fallback Attempt ${attempt}/${maxAttempts} using model: ${currentModel}`);
        
        const customInstructions = isHandwritten 
          ? `NOTE: This is a HAND-WRITTEN/informal bill or receipt. Focus primarily on locating the final GRAND TOTAL/amount. Note that the time is specified as '${handwrittenTime || "12:00 PM"}' and this is a ${handwrittenIsFood ? "FOOD expense (so please classify category as 'Food' and billType as 'Food')" : "non-food expense"}.` 
          : "";

        const contentsParts: any[] = [];
        if (ocrText) {
          contentsParts.push({ text: `RAW RECEIPT OCR TEXT (Confidence: ${ocrConfidence}%):\n${ocrText}` });
        }
        
        const inlineParts = (images && Array.isArray(images) && images.length > 0)
          ? images.map(img => ({ inlineData: { data: img.base64 || img.base64Image, mimeType: img.mimeType || "image/jpeg" } }))
          : (base64Image ? [{ inlineData: { data: base64Image, mimeType: mimeType || "image/jpeg" } }] : []);
        contentsParts.push(...inlineParts);

        contentsParts.push({ 
          text: `Analyze this receipt. Return standard JSON.
${customInstructions}
Extract and classify into the following keys carefully:
1. amount: This must be a number representing the total amount paid on the receipt. CRITICAL PRIORITY: If there is a 'Paid' (or 'Amount Paid', 'Paid Amount', 'Net Paid', etc.) line showing the actual amount paid (especially after discounts, coupons, or adjustments), you MUST extract that paid amount. If there is no 'Paid' amount, fall back to extracting the 'Grand Total' or 'Total' amount. If multiple receipts, return the SUM of their respective extracted amounts.
2. merchant: Name of the vendor/merchant.
3. billType: MUST be classified into exactly one of these: Food, Travel.
4. category: Maps strictly to one of these: Food, Travel.
5. date: Extract the main payment/invoice date in DD-MM-YYYY format.
6. time: ${isHandwritten && handwrittenTime ? `Return exactly "${handwrittenTime}"` : `Extract the time of the receipt. Use HH:mm format if possible or standard 12-hour AM/PM. If not found, return "12:00 PM".`}
7. isHandwritten: Set to true if the receipt is handwritten, otherwise set to false.`
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
        break;
      } catch (error: any) {
        geminiError = error;
        console.log(`[Vercel Serverless AI] Fallback Attempt ${attempt} deferred.`);
        
        const classification = classifyGeminiError(error, !!apiKey);
        if (classification.isRetryable && attempt < maxAttempts) {
          const delay = retryIntervals[attempt - 1];
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          break;
        }
      }
    }

    if (geminiError) {
      const classification = classifyGeminiError(geminiError, !!apiKey);
      
      console.log(`[Vercel Serverless AI] Gemini call deferred (${classification.type}). Local fallback engine triggered.`);
      const fallbackResult = runFallbackEngine(ocrText || "", ocrConfidence, groupSize);
      return res.status(200).json(fallbackResult);
    }

    const textResult = response?.text?.trim();
    if (!textResult) {
      throw new Error("Empty response received from Gemini.");
    }

    const parsedData = JSON.parse(textResult);
    
    const cleanStringAmount = (val: any): number => {
      if (typeof val === 'number') return val;
      if (!val) return 0;
      const str = String(val).replace(/(?:₹|rs\.?|inr|rs|\$)/gi, '').replace(/,/g, '').trim();
      const cleaned = str.replace(/[^\d.-]/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    };
    const finalAmount = cleanStringAmount(parsedData.amount);
    
    // Normalize Category to strictly Food or Travel
    let finalCategory = "Food";
    if (parsedData.category === "Travel" || parsedData.category === "Transport" || ["Taxi", "Cab", "Bus", "Train", "Flight", "Fuel", "Travel"].some(t => t.toLowerCase() === String(parsedData.billType).toLowerCase())) {
      finalCategory = "Travel";
    }

    const finalBillType = finalCategory;
    const finalMerchant = parsedData.merchant || "Unknown Vendor";

    // Standardize Date
    let finalDate = parsedData.date || "24-06-2026";
    const stdDate = parseAndStandardizeDate(finalDate);
    if (stdDate) {
      finalDate = stdDate;
    }

    const finalTime = parsedData.time || "12:00 PM";
    let mealType: string | undefined = undefined;
    if (finalCategory === "Food") {
      mealType = getMealType(finalTime);
    }

    const finalDescription = generateSmartDescription(finalBillType, groupSize, mealType);

    const finalResult = {
      amount: finalAmount,
      merchant: finalMerchant,
      billType: finalBillType,
      category: finalCategory,
      date: finalDate,
      time: finalTime,
      mealType: mealType,
      description: finalDescription,
      groupSize: groupSize,
      isHandwritten: parsedData.isHandwritten ?? isHandwritten
    };

    overrideTravelClassificationIfNeeded(finalResult);

    return res.status(200).json(finalResult);

  } catch (error: any) {
    console.log("[Vercel Serverless AI] Request deferred. Running local fallback engine...");
    try {
      const fallbackResult = runFallbackEngine(ocrText || "", ocrConfidence || 100, groupSize || 1);
      return res.status(200).json(fallbackResult);
    } catch (fallbackErr) {
      console.log("[Vercel Serverless AI] Local fallback deferred.");
      return res.status(200).json({
        amount: 0,
        merchant: "Unknown Vendor",
        billType: "Food",
        category: "Food",
        date: new Date().toLocaleDateString('en-GB').replace(/\//g, '-'), // DD-MM-YYYY
        time: "12:00 PM",
        description: "Food Expense",
        groupSize: groupSize || 1,
        isHandwritten: false
      });
    }
  }
}
