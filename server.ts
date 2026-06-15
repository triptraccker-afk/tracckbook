import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

import parseReceiptHandler from "./api/gemini/parse-receipt.ts";

const envConfig = dotenv.config();
if (envConfig.parsed) {
  for (const key in envConfig.parsed) {
    if (envConfig.parsed[key]) {
      process.env[key] = envConfig.parsed[key];
    }
  }
}

// Startup health check for Gemini API Key configuration
const getActiveApiKey = (): string => {
  return (process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "").trim();
};

const geminiApiKey = getActiveApiKey();
if (geminiApiKey !== "") {
  // Override the environment variable so that the GoogleGenAI client (and submodules) use the working key
  process.env.GEMINI_API_KEY = geminiApiKey;
  let matchedName = "GEMINI_API_KEY";
  if (process.env.GEMINI_KEY) matchedName = "GEMINI_KEY";
  else if (process.env.GOOGLE_API_KEY) matchedName = "GOOGLE_API_KEY";
  console.log(`[Startup Check] Gemini API Ready (matched ${matchedName})`);
} else {
  console.log("[Startup Check] Gemini API Not Configured (missing GEMINI_API_KEY, GEMINI_KEY, or GOOGLE_API_KEY)");
}

const app = express();
const PORT = 3000;

// Body parser supporting larger images
app.use(express.json({ limit: "15mb" }));

// AI Parse Receipt Endpoint
app.post("/api/gemini/parse-receipt", async (req, res) => {
  try {
    await parseReceiptHandler(req as any, res as any);
  } catch (err: any) {
    console.error("[Local Server] Express proxy error:", err);
    res.status(500).json({ error: err.message || "An unexpected error occurred" });
  }
});

// AI Ask Endpoint
app.post("/api/gemini/ask", async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: "Missing query parameter." });
  }

  const apiKey = getActiveApiKey();
  if (apiKey === "") {
    return res.status(500).json({ error: "AI is not configured. Please add GEMINI_API_KEY, GEMINI_KEY, or GOOGLE_API_KEY under Settings > Secrets on the platform." });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: query,
      config: {
        systemInstruction: "You are a helpful assistant for 'Track Book', a financial management app. The app allows users to create multiple books, add transactions (Cash In/Out), upload receipt images for AI detection (using TrackBook AI), and export reports in Excel/PDF. Users can also filter transactions by type, category, and duration. Answer the user's question about how to use the app or general financial advice within the context of this app. Keep it concise.",
      },
    });

    res.json({ text: response.text || "I'm sorry, I couldn't generate a response." });
  } catch (err: any) {
    console.error("[Server help query] Error asking AI:", err);
    res.status(500).json({ error: err.message || "An unexpected error occurred" });
  }
});

// Gemini Health Check & Diagnostics Endpoint
app.get("/api/gemini/health", async (req, res) => {
  const modelName = "gemini-3.5-flash";
  const apiKey = getActiveApiKey();
  const keyLoaded = apiKey !== "";
  
  if (!keyLoaded) {
    console.error("[Health Check] API Key Missing");
    return res.status(401).json({
      ok: false,
      modelUsed: modelName,
      keyLoaded: false,
      apiConnectivity: "Failed (API key missing)",
      error: "Gemini API key is not loaded or is empty in GEMINI_API_KEY, GEMINI_KEY, and GOOGLE_API_KEY environmental variables."
    });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });

    console.log(`[Health Check] Executing test request to model ${modelName}...`);
    const testResponse = await ai.models.generateContent({
      model: modelName,
      contents: "Hello! Reply with exactly 'Ready' in a single word with no punctuation.",
    });

    const textResult = testResponse.text?.trim() || "";
    console.log(`[Health Check] Gemini Response: "${textResult}"`);

    return res.json({
      ok: true,
      modelUsed: modelName,
      keyLoaded: true,
      apiConnectivity: "Success",
      testRequestResult: textResult,
      startupStatus: "[Startup Check] Gemini API Ready",
      aiUploadOperational: "AI Upload is operational.",
      productionDeploymentReady: "Production deployment ready."
    });

  } catch (error: any) {
    const httpStatus = error?.status || error?.statusCode || (error?.error && error?.error?.status) || 500;
    const errorCode = error?.code || (error?.error && error?.error?.code) || "N/A";
    const errorMessage = error?.message || (error?.error && error?.error?.message) || String(error);
    
    let safeFullResponse = error;
    try {
      safeFullResponse = JSON.parse(JSON.stringify(error));
    } catch (_) {
      safeFullResponse = String(error);
    }

    console.error("====== GEMINI HEALTH DEEP ERROR LOG ======");
    console.error(`HTTP Status: ${httpStatus}`);
    console.error(`Error Code: ${errorCode}`);
    console.error(`Model Name being used: ${modelName}`);
    console.error("Full Gemini Error Response:", JSON.stringify(safeFullResponse, null, 2));
    console.error("==========================================");

    return res.status(httpStatus || 500).json({
      ok: false,
      modelUsed: modelName,
      keyLoaded: true,
      apiConnectivity: "Failed",
      httpStatus: httpStatus,
      errorCode: errorCode,
      fullGeminiResponse: safeFullResponse,
      errorMessage: errorMessage
    });
  }
});

// Vite & Static file handler
async function setupViteOrStatic() {
  if (process.env.NODE_ENV !== "production") {
    console.log("[Server] Configuring Vite Dev Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[Server] Configuring production static asset server...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Express] Running on http://localhost:${PORT}`);
  });
}

setupViteOrStatic();
