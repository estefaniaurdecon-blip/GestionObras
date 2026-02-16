import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CheckUpdateRequest {
  currentVersion: string;
  platform: 'windows' | 'android' | 'web';
}

const handler = async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // 🔒 SEGURIDAD: Usamos SERVICE_ROLE_KEY porque la tabla app_versions 
    // ahora requiere autenticación via RLS, pero esta función debe ser pública
    // para que las apps puedan verificar actualizaciones sin login
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const rawBody = await req.text();
    if (!rawBody) {
      return new Response(
        JSON.stringify({ error: "Missing JSON body" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    let parsed: CheckUpdateRequest | null = null;
    try {
      parsed = JSON.parse(rawBody) as CheckUpdateRequest;
    } catch (parseError) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    const { currentVersion, platform } = parsed || ({} as CheckUpdateRequest);
    if (!currentVersion || !platform) {
      return new Response(
        JSON.stringify({ error: "currentVersion and platform are required" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    console.log(`Checking updates for platform: ${platform}, current version: ${currentVersion}`);

    // Versiones deshabilitadas temporalmente
    const DISABLED_VERSIONS = new Set(['2.0.2']);

    // Obtener varias versiones recientes para la plataforma y elegir la primera no deshabilitada
    const { data: versions, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('platform', platform)
      .order('created_at', { ascending: false })
      .limit(10);

    console.log(`Found ${versions?.length || 0} versions for platform ${platform}`);
    console.log(`Available versions:`, versions?.map(v => v.version).join(', '));

    if (error) {
      console.error('Error fetching latest version:', error);
      throw error;
    }
    const latestVersion = (versions || []).find((v) => !DISABLED_VERSIONS.has(v.version));

    console.log(`Latest enabled version: ${latestVersion?.version || 'none'}`);

    if (!latestVersion) {
      console.log('No enabled versions found for platform:', platform);
      return new Response(
        JSON.stringify({
          updateAvailable: false,
          message: 'No versions found for this platform',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Comparar versiones (formato: x.y.z)
    console.log(`Comparing versions - Latest: ${latestVersion.version}, Current: ${currentVersion}`);
    const isNewerVersion = compareVersions(latestVersion.version, currentVersion);
    console.log(`Is ${latestVersion.version} newer than ${currentVersion}? ${isNewerVersion}`);

    if (isNewerVersion) {
      console.log('Update available! Sending update info');
      return new Response(
        JSON.stringify({
          updateAvailable: true,
          version: latestVersion.version,
          downloadUrl: latestVersion.file_url,
          fileSize: latestVersion.file_size,
          releaseNotes: latestVersion.release_notes,
          isMandatory: latestVersion.is_mandatory,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    return new Response(
      JSON.stringify({
        updateAvailable: false,
        message: 'You are using the latest version',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in check-updates function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
};

serve(handler);
export default handler;


// Función para comparar versiones semánticas
function compareVersions(v1: string, v2: string): boolean {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    
    if (num1 > num2) return true;
    if (num1 < num2) return false;
  }
  
  return false;
}
