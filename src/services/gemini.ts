import { GoogleGenAI, Type } from "@google/genai";

export const getApiKey = () => {
  const envKey = process.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
  
  // If env key exists and looks like a real key (not "undefined" string), use it.
  if (envKey && envKey !== "undefined" && envKey !== "null" && envKey.trim().length > 10) {
    return envKey;
  }
  
  // Fallback to the user's provided key.
  return "AIzaSyC5feK4rHwjBxFMFSS_k7V3-9LpGxm6VlY"; 
};

const ai = new GoogleGenAI({ apiKey: getApiKey() });

async function withRetry<T>(fn: () => Promise<T>, maxRetries: number = 2, initialDelay: number = 500): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorMessage = error?.message || String(error);
      const isRateLimit = errorMessage.includes('429') || 
                          errorMessage.includes('RESOURCE_EXHAUSTED') || 
                          error?.status === 429;
      
      const isApiKeyError = errorMessage.includes('API_KEY_INVALID') || 
                            errorMessage.includes('403') || 
                            errorMessage.includes('unauthorized');

      if (isApiKeyError) {
        throw new Error("Invalid Gemini API Key.");
      }
      
      if (isRateLimit && i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.warn(`Retrying Gemini in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      if (isRateLimit) {
        throw new Error("AI service busy. Try again.");
      }
      throw error;
    }
  }
  throw lastError;
}

export interface TransactionData {
  amount: number;
  type: 'in' | 'out';
  description: string;
  category: string;
  date?: string; 
  time?: string; 
}

export async function parseReceipt(base64Image: string, mimeType: string): Promise<TransactionData | null> {
  try {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("API Key missing");

    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { inlineData: { data: base64Image, mimeType: mimeType } },
            { text: `Receipt JSON extraction. Return ONLY:
{"amount":number,"type":"in"|"out","description":string,"category":string,"date":"DD-MM-YYYY","time":"HH:mm"}

RULES:
- Food: description is "Breakfast"/"Lunch"/"Dinner".
- Uber: category "Transport", description "Taxi".
- Categories: [Food, Transport, Utilities, Shopping, Entertainment, Health, Education, Salary, Other]` }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            amount: { type: Type.NUMBER },
            type: { type: Type.STRING, enum: ["in", "out"] },
            description: { type: Type.STRING },
            category: { type: Type.STRING },
            date: { type: Type.STRING },
            time: { type: Type.STRING },
          },
          required: ["amount", "type", "description", "category"],
        },
      },
    }));

    const text = response.text?.trim();
    if (!text) return null;
    const cleanJson = text.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(cleanJson) as TransactionData;
  } catch (error: any) {
    console.error("AI Error:", error);
    throw error;
  }
}

export async function parseMultipleReceipts(images: { base64: string, mimeType: string }[]): Promise<TransactionData | null> {
  try {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("API Key missing");

    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            ...images.map(img => ({ inlineData: { data: img.base64, mimeType: img.mimeType } })),
            { text: `Receipts summary JSON. Return ONLY:
{"amount":number (sum),"type":"in"|"out","description":string,"category":string,"date":"DD-MM-YYYY","time":"HH:mm"}
Categories: [Food, Transport, Utilities, Shopping, Entertainment, Health, Education, Salary, Other]` }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            amount: { type: Type.NUMBER },
            type: { type: Type.STRING, enum: ["in", "out"] },
            description: { type: Type.STRING },
            category: { type: Type.STRING },
            date: { type: Type.STRING },
            time: { type: Type.STRING },
          },
          required: ["amount", "type", "description", "category"],
        },
      },
    }));

    const text = response.text?.trim();
    if (!text) return null;
    const cleanJson = text.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(cleanJson) as TransactionData;
  } catch (error) {
    console.error("AI Error:", error);
    throw error;
  }
}
