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
const geminiApiKey = process.env.GEMINI_API_KEY;
if (geminiApiKey && geminiApiKey.trim() !== "") {
  console.log("[Startup Check] Gemini API Ready");
} else {
  console.log("[Startup Check] Gemini API Not Configured");
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

// Gemini Health Check & Diagnostics Endpoint
app.get("/api/gemini/health", async (req, res) => {
  const modelName = "gemini-3.5-flash";
  const apiKey = process.env.GEMINI_API_KEY;
  const keyLoaded = apiKey && apiKey.trim() !== "";
  
  if (!keyLoaded) {
    console.error("[Health Check] API Key Missing");
    return res.status(401).json({
      ok: false,
      modelUsed: modelName,
      keyLoaded: false,
      apiConnectivity: "Failed (API key missing)",
      error: "Gemini API key is not loaded or is empty in process.env.GEMINI_API_KEY"
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
