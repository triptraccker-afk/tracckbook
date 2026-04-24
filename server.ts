import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const distPath = path.join(process.cwd(), "dist");

// Config Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
const supabaseAdmin = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey) : null;

// Config Cloudinary
// Priority: Use Environment Variables, fallback to user-provided keys if missing
const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'dd2kcpetc'; 
const apiKey = process.env.CLOUDINARY_API_KEY || '758297935941252'; 
const apiSecret = process.env.CLOUDINARY_API_SECRET || 'o-8jD_-3MuU2Ltq3JmQMRt56hd0'; 

console.log('[Cloudinary] Config Initialized:', { cloudName, hasApiKey: !!apiKey, hasApiSecret: !!apiSecret });

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
});

// Multer setup with memory storage and size limits
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
    files: 5 // Max 5 files per request
  }
});

/**
 * Helper to handle Multer errors gracefully
 */
const handleUpload = (req: any, res: any, next: any) => {
  const uploadHandler = upload.any();
  uploadHandler(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: "File too large. Max 10MB allowed." });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      console.error("[Multer] Error:", err);
      return res.status(500).json({ error: "Server failed to process upload data." });
    }
    next();
  });
};

async function startServer() {
  const app = express();
  
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '10mb' }));

  // Global request logging
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      vercel: !!process.env.VERCEL, 
      hasCloudinary: !!cloudName,
      cloudName: cloudName,
      hasSupabase: !!supabaseAdmin,
      time: new Date().toISOString() 
    });
  });

  // Get images (listing from Supabase if admin is available)
  app.get("/api/images", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin not configured");
      const { data, error } = await supabaseAdmin.from('images').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      console.error("Fetch images error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Delete image
  app.delete("/api/images/:publicId", async (req, res) => {
    try {
      const { publicId } = req.params;
      if (!publicId) return res.status(400).json({ error: "Missing publicId" });

      // Delete from Cloudinary
      await cloudinary.uploader.destroy(publicId);

      // Delete from Supabase
      if (supabaseAdmin) {
        await supabaseAdmin.from('images').delete().eq('public_id', publicId);
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Delete image error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Register image metadata in DB (Client uploads directly to Cloudinary, then calls this)
  app.post("/api/images/register", async (req, res) => {
    try {
      const { imageUrl, publicId, userId, userName, userEmail } = req.body;
      if (!imageUrl || !publicId) {
        return res.status(400).json({ error: "Missing required image metadata" });
      }

      if (!supabaseAdmin) {
        return res.json({ success: true, db_synced: false, message: "Supabase not configured" });
      }

      const isValidUUID = userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
      const insertPayload: any = {
        image_url: imageUrl,
        public_id: publicId,
        user_id: isValidUUID ? userId : null,
        user_name: userName || userEmail || 'User'
      };

      const { data, error } = await supabaseAdmin.from('images').insert([insertPayload]).select();
      
      if (error) {
        console.error("[Supabase] Insert error:", error.message);
        // Retry with safe payload
        const { data: fallbackData } = await supabaseAdmin.from('images').insert([{ image_url: imageUrl }]).select();
        return res.json({ success: true, db_id: fallbackData?.[0]?.id });
      }

      res.json({ success: true, db_id: data?.[0]?.id });
    } catch (err: any) {
      console.error("Register image error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Serve Frontend
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    app.use(express.static(distPath));
    
    // Explicitly handle non-existent API routes to return 404 JSON instead of HTML
    app.all('/api/*', (req, res) => {
      console.log(`[API] 404 Not Found: ${req.method} ${req.url}`);
      res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
    });

    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }

  return app;
}

const serverPromise = startServer();

// Vercel Export
export default async (req: any, res: any) => {
  const app = await serverPromise;
  return app(req, res);
};

// Local Start
if (!process.env.VERCEL) {
  serverPromise.then(app => {
    app.listen(3000, "0.0.0.0", () => console.log("> Ready at http://localhost:3000"));
  }).catch(e => console.error("Server start error:", e));
}
