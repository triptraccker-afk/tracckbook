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
// Using User provided keys
const cloudName = 'dd2kcpetc';
const apiKey = '758297935941252'; // Using Root API Key
const apiSecret = 'o-8jD_-3MuU2Ltq3JmQMRt56hd0'; // Using Root API Secret

console.log('[Cloudinary] Manual Config Applied:', { cloudName, hasApiKey: !!apiKey, hasApiSecret: !!apiSecret });

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
});

const upload = multer({ storage: multer.memoryStorage() });

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
      hasCloudinary: !!process.env.CLOUDINARY_CLOUD_NAME,
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

  // Upload image (accepts singular 'image' or plural 'images')
  app.post("/api/upload", upload.any(), async (req: any, res: any) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) return res.status(400).json({ error: "No files provided" });

      // DEBUG: Log exactly what is in req.body
      console.log(`[Upload] Body received:`, JSON.stringify(req.body));
      console.log(`[Upload] Processing ${files.length} files...`);

      const uploadResults = await Promise.all(files.map(async (file) => {
        const b64 = Buffer.from(file.buffer).toString("base64");
        const dataURI = `data:${file.mimetype};base64,${b64}`;
        
        // Ensure Cloudinary is configured
        if (!process.env.CLOUDINARY_CLOUD_NAME) {
          throw new Error("Cloudinary configuration missing on server");
        }

        // Get user info from body with fallback
        const userId = req.body.userId || 'unknown_user';
        const userEmail = req.body.userEmail || '';
        // Extract a "readable" name from email or name
        const displayName = (req.body.userName || userEmail || 'user').split('@')[0];
        const sanitizedDisplayName = displayName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        
        // Exact Path: trackbook/users/name_email_userid/receipts
        // We use the first part of the email and the userId to ensure uniqueness and readability
        const userFolderPath = `trackbook/users/${sanitizedDisplayName}_${userId.slice(0, 8)}/receipts`;

        console.log(`[Upload] Saving ${file.originalname} to folder: ${userFolderPath}`);

        const result = await cloudinary.uploader.upload(dataURI, {
          folder: userFolderPath,
          resource_type: "auto",
          access_mode: "public",
          use_filename: true,
          unique_filename: true
        });

        // Save to Supabase
        if (supabaseAdmin) {
          const userId = req.body.userId;
          const isValidUUID = userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

          // We know thumbnail_url is missing, so we exclude it from the start
          // and only include essential columns that usually exist.
          const insertPayload: any = {
            image_url: result.secure_url,
            public_id: result.public_id,
            user_id: isValidUUID ? userId : null,
            user_name: req.body.userName || req.body.userEmail || 'User'
          };

          let { data, error } = await supabaseAdmin.from('images').insert([insertPayload]).select();
          
          if (error) {
            console.error("[Supabase] Insert error:", error.message);
            
            // If user_name or public_id is missing, try without them
            if (error.message?.includes('user_name') || error.message?.includes('public_id') || error.code === '42703') {
              console.warn("[Supabase] Retrying image insert with safe payload...");
              const safePayload: any = { image_url: result.secure_url };
              if (!error.message?.includes('public_id')) safePayload.public_id = result.public_id;
              if (isValidUUID) safePayload.user_id = userId;

              const fallbackResult = await supabaseAdmin.from('images').insert([safePayload]).select();
              
              data = fallbackResult.data;
              error = fallbackResult.error;
            }
          }

          if (data && data[0]) {
            console.log("[Supabase] Image created with UUID:", data[0].id);
            return {
              ...result,
              db_id: data[0].id
            };
          } else if (error) {
            console.error("[Supabase] Final Supabase failure:", error.message);
          }
        }
        return result;
      }));

      // Return ONLY the DB UUIDs when available, fallback safely
      res.json({
        imageUrl: uploadResults[0].secure_url,
        db_id: uploadResults[0].db_id, // REAL UUID
        urls: uploadResults.map(r => r.secure_url),
        db_ids: uploadResults.map(r => r.db_id).filter(Boolean), // List of UUIDs
        imageIds: uploadResults.map(r => r.db_id || r.public_id) // For legacy UI support
      });
    } catch (err: any) {
      console.error("Upload handler error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Serve Frontend
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.url.startsWith('/api/')) return res.status(404).end();
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
