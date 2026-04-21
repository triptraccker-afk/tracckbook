// Supabase Edge Function: upload-image
// Deploy with: supabase functions deploy upload-image

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/YOUR_CLOUD_NAME/image/upload";
const CLOUDINARY_UPLOAD_PRESET = "YOUR_UPLOAD_PRESET"; // Or use signed upload with API Secret

serve(async (req) => {
  // CORS handling
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file uploaded' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Upload to Cloudinary
    // Note: For backend functions, use signed uploads for security
    // This example uses a hypothetical fetch to a signed upload signing endpoint or local logic
    
    // Cloudinary upload logic here...
    // const cloudinaryResponse = await fetch(...)
    
    const mockCloudinaryUrl = "https://res.cloudinary.com/demo/image/upload/v1/sample.jpg";

    // Step 2: Store in Supabase
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data, error } = await supabaseClient
      .from('images')
      .insert([{ url: mockCloudinaryUrl }])
      .select()

    if (error) throw error

    return new Response(
      JSON.stringify({ success: true, url: mockCloudinaryUrl, data }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
