import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// Declare EdgeRuntime for TypeScript
declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const publishUpdateSchema = z.object({
  version: z.string().min(1, 'Version is required'),
  platform: z.enum(['windows', 'android', 'web']),
  fileName: z.string().min(1, 'File name is required'),
  releaseNotes: z.string(),
  isMandatory: z.boolean(),
});

Deno.const handler = async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Get JWT from Authorization header (verified by Supabase before reaching here)
    const authHeader = req.headers.get('Authorization');
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('No Authorization header found in request');
      throw new Error('Unauthorized - No authentication token');
    }

    // Create clients: authenticated client for user context, admin client for privileged ops
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader }
      }
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    
    // Get authenticated user (already verified by Supabase JWT middleware)
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      console.error('Auth verification failed - authError:', authError.message, authError);
      throw new Error('Unauthorized - Authentication failed');
    }
    
    if (!user) {
      console.error('Auth verification failed - No user found despite valid token');
      throw new Error('Unauthorized - No user found');
    }
    
    console.log('User authenticated:', user.id);
    const userId = user.id;

    // Verificar que el usuario es admin o master
    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    if (rolesErr) {
      console.error('Roles query error:', rolesErr);
      throw new Error('Unauthorized - Could not verify user roles');
    }

    const rolesList = (roles ?? []).map((r: any) => r.role);
    console.log('User ID:', userId, 'Roles found:', rolesList);
    
    const isAllowed = rolesList.includes('admin') || rolesList.includes('master');
    if (!isAllowed) {
      console.error('User does not have admin or master role. Roles:', rolesList);
      throw new Error('Unauthorized - Insufficient permissions. Admin or Master role required.');
    }
    
    console.log('User authorized successfully. Proceeding with update publication...');

    // Validate request body
    const body = await req.json();
    const validationResult = publishUpdateSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error('Validation failed:', validationResult.error);
      throw new Error('Invalid request data');
    }

    const { version, platform, fileName, releaseNotes, isMandatory } = validationResult.data;

    console.log(`Publishing update: ${version} for ${platform}`);

    // Obtener información del archivo desde storage
    const filePath = `${platform}/${fileName}`;
    
    console.log('Checking file at path:', filePath);
    
    // Listar archivos en la carpeta de la plataforma
    const { data: fileList, error: listError } = await supabaseAdmin.storage
      .from('app-updates')
      .list(platform);

    console.log('Files in platform folder:', fileList);

    if (listError) {
      console.error('Error listing files:', listError);
      throw new Error(`Error al listar archivos: ${listError.message}`);
    }

    // Buscar el archivo por nombre
    const file = fileList?.find(f => f.name === fileName);
    
    if (!file) {
      console.error('File not found in storage:', fileName);
      console.error('Available files:', fileList?.map(f => f.name));
      throw new Error(`Archivo no encontrado en storage: ${fileName}`);
    }

    console.log('File found:', file);
    const fileSize = file.metadata?.size || 0;

    // Construir URL pública del archivo
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('app-updates')
      .getPublicUrl(`${platform}/${fileName}`);

    // Insertar/actualizar versión (idempotente por plataforma+versión)
    const { data: newVersion, error: upsertError } = await supabaseAdmin
      .from('app_versions')
      .upsert(
        {
          version,
          platform,
          file_url: publicUrl,
          file_size: fileSize,
          release_notes: releaseNotes,
          is_mandatory: isMandatory,
          published_by: userId,
        },
        { onConflict: 'platform,version' }
      )
      .select()
      .single();

    if (upsertError) {
      console.error('Error upserting version:', upsertError);
      throw upsertError;
    }

    console.log('Update published successfully:', newVersion);

    // Send notifications to all users about the new update (background task)
    const sendUpdateNotifications = async () => {
      try {
        // Get all approved users, filtering by platform preference
        // Users with null user_platform receive all notifications
        // Users with specific platform only receive matching notifications
        const { data: users, error: usersError } = await supabaseAdmin
          .from('profiles')
          .select('id, organization_id, user_platform')
          .eq('approved', true);

        if (usersError) {
          console.error('Error fetching users for notifications:', usersError);
          return;
        }

        if (!users || users.length === 0) {
          console.log('No users to notify');
          return;
        }

        // Filter users by platform preference
        // null/empty user_platform means user wants all platform notifications
        const filteredUsers = users.filter(u => {
          if (!u.user_platform || u.user_platform === 'all') {
            return true; // User wants all notifications
          }
          return u.user_platform === platform; // User only wants their platform
        });

        if (filteredUsers.length === 0) {
          console.log(`No users subscribed to ${platform} updates`);
          return;
        }

        console.log(`Sending notifications to ${filteredUsers.length} users (filtered from ${users.length} total) for ${platform}`);

        // Create platform-friendly label
        const platformLabel = platform === 'windows' ? 'Windows' 
          : platform === 'android' ? 'Android' 
          : 'Web';

        // Prepare notifications for filtered users only
        const notifications = filteredUsers.map(u => ({
          user_id: u.id,
          organization_id: u.organization_id,
          type: 'app_update_available',
          title: `🚀 Nueva actualización v${version}`,
          message: `Hay una nueva versión disponible para ${platformLabel}${isMandatory ? ' (obligatoria)' : ''}. ${releaseNotes ? releaseNotes.substring(0, 100) : ''}`,
          metadata: {
            version,
            platform,
            is_mandatory: isMandatory,
            file_url: publicUrl,
            file_size: fileSize,
          },
          read: false,
        }));

        // Insert notifications in batches of 100
        const batchSize = 100;
        let insertedCount = 0;

        for (let i = 0; i < notifications.length; i += batchSize) {
          const batch = notifications.slice(i, i + batchSize);
          const { error: insertError } = await supabaseAdmin
            .from('notifications')
            .insert(batch);

          if (insertError) {
            console.error(`Error inserting notification batch ${i / batchSize}:`, insertError);
          } else {
            insertedCount += batch.length;
          }
        }

        console.log(`Sent ${insertedCount} update notifications for v${version} (${platform})`);
      } catch (err) {
        console.error('Error sending update notifications:', err);
      }
    };

    // Run notification sending as background task
    EdgeRuntime.waitUntil(sendUpdateNotifications());

    return new Response(
      JSON.stringify({
        success: true,
        version: newVersion,
        notificationsSent: true,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in publish-update function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isUnauthorized = errorMessage === 'Unauthorized';
    
    // Sanitize error messages - don't expose internal details
    const publicMessage = isUnauthorized 
      ? 'Unauthorized' 
      : errorMessage === 'Invalid request data' 
        ? 'Invalid request data' 
        : 'Operation failed';
    
    return new Response(
      JSON.stringify({ error: publicMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: isUnauthorized ? 403 : 400,
      }
    );
  }
};

serve(handler);
export default handler;

