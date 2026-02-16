import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  work_id: z.string().uuid('Invalid work_id format'),
  organization_id: z.string().uuid('Invalid organization_id format'),
});

const handler = async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const body = await req.json();
    const validationResult = requestSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error('Validation failed:', validationResult.error);
      return new Response(
        JSON.stringify({ error: 'Datos de solicitud inválidos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { work_id, organization_id } = validationResult.data;

    console.log(`Starting inventory cleanup for work: ${work_id}`);

    // Palabras clave que indican servicios, alquileres o empresas subcontratistas
    const serviceKeywords = [
      'alquiler', 'servicio', 'servicios', 'mano de obra', 'manodeobra',
      'operario', 'operarios', 'transporte', 'portes', 'grúa', 'grua',
      'plataforma', 'excavación', 'excavacion', 'retirada', 'montaje',
      'desmontaje', 'rental', 'excabacion', 'excabaciones'
    ];

    // Empresas específicas de servicios/alquileres (de la imagen del usuario)
    const serviceCompanies = [
      'hune rental',
      'ramon valiente',
      'zenda s. coop',
      'zenda',
      'hondo excabaciones',
      'rafha gruas',
      'gruas torre'
    ];

    // Obtener todos los ítems del inventario para esta obra
    const { data: allItems, error: fetchError } = await supabase
      .from('work_inventory')
      .select('*')
      .eq('work_id', work_id)
      .eq('organization_id', organization_id);

    if (fetchError) {
      console.error('Error fetching inventory:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Error al obtener inventario' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${allItems?.length || 0} items in inventory`);

    const itemsToDelete: string[] = [];

    for (const item of allItems || []) {
      let shouldDelete = false;
      const reasons: string[] = [];

      // 1. Verificar si no tiene número de albarán (no fue escaneado con IA)
      if (!item.delivery_note_number || item.delivery_note_number.trim() === '') {
        shouldDelete = true;
        reasons.push('sin número de albarán');
      }

      // 2. Verificar si el nombre contiene palabras clave de servicios
      const nameLower = (item.name || '').toLowerCase();
      for (const keyword of serviceKeywords) {
        if (nameLower.includes(keyword)) {
          shouldDelete = true;
          reasons.push(`palabra clave de servicio: "${keyword}"`);
          break;
        }
      }

      // 3. Verificar si el proveedor es una empresa de servicios conocida
      const supplierLower = (item.last_supplier || '').toLowerCase();
      for (const company of serviceCompanies) {
        if (supplierLower.includes(company)) {
          shouldDelete = true;
          reasons.push(`empresa de servicios: "${company}"`);
          break;
        }
      }

      // 4. Verificar categoría
      const categoryLower = (item.category || '').toLowerCase();
      if (categoryLower.includes('maquinaria') && !item.delivery_note_number) {
        shouldDelete = true;
        reasons.push('maquinaria sin albarán (probablemente alquiler)');
      }

      if (shouldDelete) {
        console.log(`Marcado para eliminar: "${item.name}" [${item.last_supplier}] - Razones: ${reasons.join(', ')}`);
        itemsToDelete.push(item.id);
      }
    }

    console.log(`Items to delete: ${itemsToDelete.length}`);

    // Eliminar items
    let deletedCount = 0;
    if (itemsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('work_inventory')
        .delete()
        .in('id', itemsToDelete);

      if (deleteError) {
        console.error('Error deleting items:', deleteError);
        return new Response(
          JSON.stringify({ error: 'Error al eliminar items' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      deletedCount = itemsToDelete.length;
    }

    console.log(`Successfully deleted ${deletedCount} items from inventory`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Limpieza completada: ${deletedCount} items eliminados`,
        deletedCount,
        totalScanned: allItems?.length || 0,
        remaining: (allItems?.length || 0) - deletedCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in clean-inventory function:', error);
    return new Response(
      JSON.stringify({ error: 'Error al limpiar inventario' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
export default handler;

