import { Type } from "@google/genai";

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
    const res = await fetch("/api/gemini/parse-receipt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        base64Image,
        mimeType
      })
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error ${res.status}`);
    }

    const data = await res.json();
    return {
      amount: data.amount,
      type: "out",
      description: data.description || `${data.billType} Expense`,
      category: data.category || "Other",
      date: data.date,
      time: data.time
    };
  } catch (error: any) {
    console.error("AI Error client proxy:", error);
    throw error;
  }
}

export async function parseMultipleReceipts(images: { base64: string, mimeType: string }[]): Promise<TransactionData | null> {
  try {
    const res = await fetch("/api/gemini/parse-receipt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        images
      })
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error ${res.status}`);
    }

    const data = await res.json();
    return {
      amount: data.amount,
      type: "out",
      description: data.description || "Merged AI Expenses",
      category: data.category || "Other",
      date: data.date,
      time: data.time
    };
  } catch (error: any) {
    console.error("AI Error client proxy (multiple):", error);
    throw error;
  }
}
