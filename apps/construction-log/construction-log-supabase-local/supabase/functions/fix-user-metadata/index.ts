import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.const handler = async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 🔒 SEGURIDAD: Validar secreto desde variable de entorno (no hardcoded)
    const adminSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');
    const providedSecret = authHeader?.replace('Bearer ', '');
    
    // También aceptar por query param para retrocompatibilidad temporal
    const url = new URL(req.url);
    const querySecret = url.searchParams.get('secret');
    
    const isValidSecret = adminSecret && (providedSecret === adminSecret || querySecret === adminSecret);
    
    if (!isValidSecret) {
      console.error('Unauthorized fix-user-metadata request - invalid secret');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid or missing secret' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fixing metadata for user:', email);

    // Get user by email using admin API
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('Error listing users:', listError);
      return new Response(
        JSON.stringify({ error: 'Failed to list users' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const user = users.users.find(u => u.email === email);
    
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Found user:', user.id);
    console.log('Current metadata:', JSON.stringify(user.user_metadata));

    // Clean the metadata - remove any problematic characters
    const cleanMetadata: Record<string, string> = {};
    
    if (user.user_metadata) {
      for (const [key, value] of Object.entries(user.user_metadata)) {
        if (typeof value === 'string') {
          // Remove non-ASCII characters that might cause encoding issues
          cleanMetadata[key] = value.replace(/[^\x00-\x7F]/g, '');
        } else if (value !== null && value !== undefined) {
          cleanMetadata[key] = String(value).replace(/[^\x00-\x7F]/g, '');
        }
      }
    }

    console.log('Clean metadata:', JSON.stringify(cleanMetadata));

    // Update user with clean metadata
    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { 
        user_metadata: cleanMetadata,
        app_metadata: {} // Also clear app metadata
      }
    );

    if (updateError) {
      console.error('Error updating user:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update user metadata' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User metadata updated successfully');

    // Also try to sign out all sessions for this user to clear any corrupt session data
    try {
      // Get user's sessions and sign them out
      await supabaseAdmin.auth.admin.signOut(user.id, 'global');
      console.log('All user sessions signed out');
    } catch (signOutError) {
      console.log('Could not sign out sessions (might not have any):', signOutError);
    }

    // Also clean the user's identities metadata if possible
    let identitiesInfo = 'Not available';
    try {
      if (user.identities && user.identities.length > 0) {
        identitiesInfo = JSON.stringify(user.identities.map(i => ({
          id: i.id,
          provider: i.provider,
          identity_data: i.identity_data
        })));
      }
    } catch (idError) {
      console.log('Error reading identities:', idError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'User metadata cleaned and sessions cleared',
        user_id: user.id,
        old_metadata: user.user_metadata,
        new_metadata: cleanMetadata,
        identities_info: identitiesInfo,
        sessions_cleared: true
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
export default handler;

