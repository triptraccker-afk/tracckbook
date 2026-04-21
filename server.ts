import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

// Configure Supabase (Server-side)
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";

let supabaseAdmin: any = null;

if (supabaseUrl && supabaseServiceKey) {
  try {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    console.log("[Supabase] Admin client initialized successfully.");
  } catch (err) {
    console.error("[Supabase] Failed to initialize admin client:", err);
  }
} else {
  console.warn("[Supabase] Missing URL or Service Key. Database features will be limited.");
}

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Request logger - MUST BE FIRST
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
    });
    next();
  });

  app.use(cors({
    origin: true, // Allow all origins in development/shared mode
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
  }));
  app.use(express.json({ limit: '10mb' }));

  // Explicit options handling
  app.options('*', cors());

  // Debug route
  app.get("/api/ping", (req, res) => {
    res.json({ pong: true, time: new Date().toISOString() });
  });

  // Health check route - Consolidated and Verifying dependencies
  app.get("/api/health", async (req, res) => {
    const healthData: any = { 
      status: "ok", 
      timestamp: new Date().toISOString(),
      cloudinary: !!process.env.CLOUDINARY_CLOUD_NAME,
      supabase: !!supabaseAdmin,
      mode: process.env.NODE_ENV || 'development'
    };

    if (supabaseAdmin) {
      try {
        const { error } = await supabaseAdmin.from('images').select('count', { count: 'exact', head: true });
        healthData.supabaseStatus = error ? 'error' : 'connected';
        if (error) healthData.supabaseMessage = error.message;
      } catch (err: any) {
        healthData.supabaseStatus = 'exception';
        healthData.supabaseMessage = err.message;
      }
    }

    res.setHeader('Content-Type', 'application/json');
    res.json(healthData);
  });

  // Multer setup for memory storage
  const storage = multer.memoryStorage();
  const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
  });

  // API Route: Image Upload to Cloudinary
  app.post("/api/upload", upload.single("image"), async (req, res) => {
    console.log(`[API] Processing POST /api/upload from ${req.ip}`);
    try {
      if (!req.file) {
        console.error("[Upload] Error: No file in request");
        return res.status(400).json({ error: "No image file provided" });
      }

      // Explicitly log the received body to debug missing fields
      console.log(`[Upload] Received Body:`, JSON.stringify(req.body));

      const userId = req.body.userId || "anonymous";
      const userName = req.body.userName || "Unknown";
      const userEmail = req.body.userEmail || "unknown_email";
      const folderChoice = req.body.folder || "receipts";

      // Sanitization logic for Cloudinary folder naming
      // userName: lowercase, replace spaces with "_", remove special characters
      const safeName = (userName === "Unknown" ? "user" : userName)
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
      
      // userEmail: lowercase, replace "@" and "." with "_"
      const safeEmail = (userEmail === "unknown_email" ? "noemail" : userEmail)
        .toLowerCase()
        .replace(/[@.]/g, '_')
        .replace(/[^a-z0-9_]/g, '');

      // Folder structure: users/{safeName}_{safeEmail}_{userId}/receipts
      // We move the name and email to the front for better readability in the Cloudinary UI,
      // and keep the userId at the end to guarantee uniqueness.
      const folderPath = userId === "anonymous" 
        ? "users/anonymous/receipts" 
        : `users/${safeName}_${safeEmail}_${userId}/${folderChoice}`;

      console.log('--------------------------------------------------');
      console.log(`[Cloudinary] GENERATING DYNAMIC FOLDER PATH:`);
      console.log(`- Original User ID: ${userId}`);
      console.log(`- Original User Name: ${userName}`);
      console.log(`- Original User Email: ${userEmail}`);
      console.log(`- Sanitized Name: ${safeName}`);
      console.log(`- Sanitized Email: ${safeEmail}`);
      console.log(`- FINAL FOLDER PATH: ${folderPath}`);
      console.log('--------------------------------------------------');

      if (!supabaseAdmin) {
        console.warn("[Upload] Warning: Supabase client not initialized. Track in database skipped.");
      }

      // Convert buffer to base64 for Cloudinary
      const b64 = Buffer.from(req.file.buffer).toString("base64");
      const dataURI = "data:" + req.file.mimetype + ";base64," + b64;

      // Upload to Cloudinary with dynamic user-based folder structure
      const uploadResponse = await cloudinary.uploader.upload(dataURI, {
        resource_type: "auto",
        folder: folderPath,
        // Automatic transformations
        transformation: [
          { fetch_format: "auto", quality: "auto" }
        ]
      });

      console.log(`[Cloudinary] Upload success: ${uploadResponse.public_id} - ${uploadResponse.secure_url} (Folder: ${folderPath})`);

      // Store in Supabase database table (images)
      if (supabaseAdmin) {
        const payload = { 
          image_url: uploadResponse.secure_url, 
          public_id: uploadResponse.public_id,
          user_id: userId !== "anonymous" ? userId : null,
          user_name: userName,
          user_email: userEmail
        };

        const { data: dbData, error: dbError } = await supabaseAdmin
          .from('images')
          .insert([payload])
          .select('id')
          .single();
        
        if (dbError) {
          console.error("Supabase Database Error (Table 'images'):", dbError.message || dbError);
          return res.status(500).json({ 
            error: "Image tracking failed", 
            details: dbError.message 
          });
        }

        if (dbData) {
          return res.json({
            id: dbData.id,
            imageUrl: uploadResponse.secure_url,
            public_id: uploadResponse.public_id
          });
        }
      }
 else {
        console.warn("[Upload] Supabase client missing, returning Cloudinary data only.");
      }

      // Fallback if supabase insert was skipped or didn't return data
      res.json({
        imageUrl: uploadResponse.secure_url,
        public_id: uploadResponse.public_id
      });
    } catch (error: any) {
      console.error("Cloudinary Upload Error:", error);
      res.status(500).json({ 
        error: "Upload failed", 
        details: error.message 
      });
    }
  });

  // API Route: Get all tracked images
  app.get("/api/images", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(503).json({ error: "Supabase service unavailable - check server logs" });
      }

      const { data, error } = await supabaseAdmin
        .from('images')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      res.json(data || []);
    } catch (error: any) {
      console.error("Fetch Images Error:", error);
      res.status(500).json({ error: "Failed to fetch images", details: error.message });
    }
  });

  // API Route: Delete image from Cloudinary and Supabase
  app.delete("/api/images/:publicId", async (req, res) => {
    try {
      const { publicId } = req.params;
      if (!publicId) {
        return res.status(400).json({ error: "Public ID is required" });
      }

      console.log(`[Delete] Deleting image: ${publicId}`);

      // 1. Delete from Cloudinary
      const cloudinaryResponse = await cloudinary.uploader.destroy(publicId);
      console.log(`[Cloudinary] Delete response:`, cloudinaryResponse);

      // 2. Delete from Supabase
      if (supabaseAdmin) {
        const { error: dbError } = await supabaseAdmin
          .from('images')
          .delete()
          .eq('public_id', publicId);

        if (dbError) {
          console.error("Supabase Delete Error:", dbError);
          // We continue because the image might already be gone from Supabase but still in Cloudinary
        }
      }

      res.json({ 
        message: "Image deleted successfully", 
        cloudinary: cloudinaryResponse.result,
        publicId 
      });
    } catch (error: any) {
      console.error("Delete Image Error:", error);
      res.status(500).json({ error: "Delete failed", details: error.message });
    }
  });

  // Explicit 404 for API routes
  app.use("/api/*", (req, res, next) => {
    // If we're here, no previous API route matched
    if (req.method === 'GET' || req.method === 'POST' || req.method === 'DELETE' || req.method === 'PUT' || req.method === 'PATCH') {
       console.error(`[API 404] ${req.method} ${req.url}`);
       return res.status(404).json({ 
         error: "API route not found", 
         method: req.method,
         path: req.url 
       });
    }
    next();
  });

  // Vite middleware for development or fallback if dist is missing
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(distPath);

  if (process.env.NODE_ENV !== "production" || !hasDist) {
    if (process.env.NODE_ENV === "production") {
      console.warn("NODE_ENV is production but 'dist' folder missing. Falling back to Vite.");
    }
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      console.log(`[SPA Fallback] ${req.url} -> index.html`);
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global error handler - MUST BE LAST
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[Global Error]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error',
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`> Server ready at http://0.0.0.0:${PORT}`);
    console.log(`> Mode: ${process.env.NODE_ENV || 'development'}`);
    console.log(`> Cloudinary configured: ${!!process.env.CLOUDINARY_CLOUD_NAME}`);
    console.log(`> Supabase configured: ${!!process.env.SUPABASE_SERVICE_ROLE_KEY}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});
