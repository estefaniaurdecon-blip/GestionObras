import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const requestSchema = z.object({
  imageBase64: z.string().optional(),
  images: z.array(z.string().max(15 * 1024 * 1024, "Image too large (max 15MB)")).max(20, "Too many images (max 20)").optional(),
  workId: z.string().uuid("Invalid work ID format").nullable().optional(),
  organizationId: z.string().uuid("Invalid organization ID format").nullable().optional(),
}).refine(
  (data) => data.imageBase64 || (data.images && data.images.length > 0),
  { message: "Either imageBase64 or images array is required" }
);

// Función para normalizar unidades de medida
function normalizeUnit(unit: string): string {
  if (!unit) return 'ud';
  
  const normalized = unit.toLowerCase().trim()
    .replace(/\s+/g, '') // Eliminar espacios
    .replace(/\./g, ''); // Eliminar puntos
  
  // Normalizar toneladas
  if (['tn', 'ton', 'tons', 'toneladas', 'tonelada'].includes(normalized)) {
    return 't';
  }
  
  // Normalizar metros cúbicos
  if (['m3', 'mc', 'metroscubicos', 'metrocubico'].includes(normalized)) {
    return 'm³';
  }
  
  // Normalizar litros
  if (['lt', 'lts', 'litro', 'litros'].includes(normalized)) {
    return 'l';
  }
  
  // Normalizar unidades
  if (['u', 'unidad', 'unidades', 'uds'].includes(normalized)) {
    return 'ud';
  }
  
  // Normalizar kilogramos
  if (['kgs', 'kilogramo', 'kilogramos', 'kilos'].includes(normalized)) {
    return 'kg';
  }
  
  // Normalizar metros
  if (['metro', 'metros', 'mts'].includes(normalized)) {
    return 'm';
  }
  
  // Si no coincide con ninguna normalización, devolver el valor limpio
  return normalized || 'ud';
}

// Función para actualizar el inventario en segundo plano
async function updateInventory(
  supabaseClient: any,
  workId: string | null,
  organizationId: string | null,
  items: any[],
  supplier: string | null,
  date: string | null,
  invoiceNumber: string | null
) {
  if (!workId || !items || items.length === 0) {
    console.log('Skipping inventory update: missing workId or items');
    return;
  }

  try {
    console.log(`Updating inventory for work ${workId} with ${items.length} items`);
    
    for (const item of items) {
      if (!item.name || !item.itemType) continue;

      // Excluir servicios y alquileres aunque parezcan herramientas/materiales
      const nameLower = String(item.name).toLowerCase();
      const serviceKeywords = ['alquiler', 'servicio', 'servicios', 'mano de obra', 'manodeobra', 'operario', 'operarios', 'transporte', 'portes', 'grúa', 'grua', 'plataforma', 'excavación', 'excavacion', 'retirada', 'montaje', 'desmontaje'];
      if (serviceKeywords.some(k => nameLower.includes(k))) {
        console.log('Skipping service-like item from inventory:', item.name);
        continue;
      }

      // Normalizar la unidad antes de buscar
      const normalizedUnit = normalizeUnit(item.unit || 'ud');
      
      // Buscar si ya existe este item en el inventario CON LA MISMA UNIDAD
      // Esto evita sumar cantidades de diferentes unidades (ej: toneladas + kg)
      const { data: existing, error: fetchError } = await supabaseClient
        .from('work_inventory')
        .select('*')
        .eq('work_id', workId)
        .eq('name', item.name)
        .eq('item_type', item.itemType)
        .eq('unit', normalizedUnit)
        .maybeSingle();

      if (fetchError) {
        console.error('Error fetching inventory item:', fetchError);
        continue;
      }

      const quantity = parseFloat(item.quantity) || 0;
      const newQuantity = existing ? (parseFloat(existing.quantity) || 0) + quantity : quantity;

      const unitPrice = parseFloat(item.unitPrice) || null;
      const totalPrice = unitPrice && quantity ? unitPrice * quantity : parseFloat(item.total) || null;

      const inventoryData = {
        work_id: workId,
        organization_id: organizationId,
        item_type: item.itemType,
        category: item.category || null,
        name: item.name,
        quantity: newQuantity,
        unit: normalizedUnit,
        last_entry_date: date || new Date().toISOString().split('T')[0],
        last_supplier: supplier || null,
        notes: existing?.notes || null,
        product_code: item.productCode || existing?.product_code || null,
        unit_price: unitPrice,
        total_price: totalPrice,
        delivery_note_number: invoiceNumber || existing?.delivery_note_number || null,
        batch_number: item.batchNumber || existing?.batch_number || null,
        brand: item.brand || existing?.brand || null,
        model: item.model || existing?.model || null,
        condition: 'nuevo',
        location: existing?.location || null,
        observations: existing?.observations || null,
      };

      if (existing) {
        // Actualizar existente
        const { error: updateError } = await supabaseClient
          .from('work_inventory')
          .update(inventoryData)
          .eq('id', existing.id);

        if (updateError) {
          console.error('Error updating inventory:', updateError);
        } else {
          console.log(`Updated inventory: ${item.name} - New quantity: ${newQuantity}`);
        }
      } else {
        // Crear nuevo
        const { error: insertError } = await supabaseClient
          .from('work_inventory')
          .insert([inventoryData]);

        if (insertError) {
          console.error('Error inserting inventory:', insertError);
        } else {
          console.log(`Created inventory item: ${item.name} - Quantity: ${quantity}`);
        }
      }
    }
  } catch (error) {
    console.error('Error in updateInventory:', error);
  }
}

const handler = async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse and validate input
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Formato de solicitud inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validationResult = requestSchema.safeParse(body);
    if (!validationResult.success) {
      console.error('Validation failed:', validationResult.error.errors);
      return new Response(
        JSON.stringify({ error: "Datos de entrada inválidos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { imageBase64, images, workId, organizationId } = validationResult.data;

    // Soporte para múltiples imágenes (páginas de PDF) o una sola imagen
    const imagesToAnalyze = images || (imageBase64 ? [imageBase64] : []);

    if (!imagesToAnalyze || imagesToAnalyze.length === 0) {
      return new Response(
        JSON.stringify({ error: "Se requiere imageBase64 o array de images" }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Validar que todas las imágenes sean data URLs válidos
    for (const img of imagesToAnalyze) {
      if (!img.startsWith('data:image/')) {
        console.error("Invalid image format - not a data URL");
        return new Response(
          JSON.stringify({ error: "Formato de imagen inválido. Debe ser un data URL (data:image/...)" }),
          { 
            status: 400, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          }
        );
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "Error de configuración del servidor" }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    console.log(`Starting invoice analysis for ${imagesToAnalyze.length} page(s)...`);
    const startTime = Date.now();

    // Construir el contenido del mensaje con todas las imágenes
    const messageContent: any[] = [
      {
        type: "text",
          text: imagesToAnalyze.length > 1 
          ? `Analiza todas las páginas de este albarán o factura de construcción (${imagesToAnalyze.length} páginas) y extrae TODA la información combinada en formato JSON:

- supplier: nombre del proveedor/empresa
- invoiceNumber: número de albarán o factura  
- date: fecha en formato YYYY-MM-DD
- items: array de elementos con:
  - name: nombre del material o herramienta FÍSICA
  - quantity: cantidad (número, sin la unidad)
  - unit: unidad de medida EXACTA del albarán. IMPORTANTE:
    * Para áridos, zahorra, arena, gravas: usar "t" (toneladas) si aparece "Tn", "Ton", "Toneladas"
    * Para hormigón: usar "m³" o "m3"
    * Para líquidos: usar "l" (litros) o "m³"
    * Para sólidos pequeños: "kg", "g"
    * Para unidades: "ud", "u", "unidades"
    * Para longitud: "m", "cm", "mm"
    * Respetar EXACTAMENTE la unidad que aparece en el documento
  - unitPrice: precio unitario (número, opcional)
  - total: precio total (número, opcional)
  - itemType: DEBES clasificar cada item como "material" o "herramienta" según su naturaleza:
    * "material": consumibles, materias primas FÍSICAS (cemento, arena, ladrillos, pintura, cables, tubos, zahorra, áridos, etc.)
    * "herramienta": equipos, máquinas, utensilios reutilizables FÍSICOS (taladros, martillos, andamios, generadores, etc.)
  - category: categoría específica del item (ej: "Áridos", "Zahorra", "pintura", "herramienta eléctrica", etc.)
  - productCode: código o referencia del producto (opcional)
  - batchNumber: número de lote o serie (opcional)
  - brand: marca del producto (opcional)
  - model: modelo del producto (opcional)

CRÍTICO - NO INCLUIR EN ITEMS:
- NO incluir SERVICIOS (excavación, transporte, mano de obra, alquiler de maquinaria, trabajos subcontratados, etc.)
- NO incluir conceptos de TRABAJO (horas de operario, servicios técnicos, instalación, montaje, etc.)
- NO incluir EMPRESAS o SUBCONTRATISTAS como items
- SOLO incluir materiales FÍSICOS y herramientas FÍSICAS que se pueden tocar y almacenar
- Si el albarán es SOLO de servicios, devuelve items como array vacío []

IMPORTANTE: 
- Lee TODAS las páginas proporcionadas y combina toda la información
- Clasifica TODOS los items FÍSICOS como "material" o "herramienta"
- EXCLUYE servicios, mano de obra, trabajos subcontratados
- Si es consumible físico = material, si es reutilizable físico = herramienta
- CRÍTICO: Extrae la unidad de medida EXACTAMENTE como aparece en el albarán (t, kg, m³, ud, etc.)
- Para zahorra y áridos, normalmente viene en toneladas (t), NO en kg
- Los precios deben ser números sin símbolos de moneda
- Si no encuentras algún dato, déjalo como null

Responde ÚNICAMENTE con el JSON, sin texto adicional.`
          : `Analiza este albarán o factura de construcción y extrae la siguiente información en formato JSON:

- supplier: nombre del proveedor/empresa
- invoiceNumber: número de albarán o factura  
- date: fecha en formato YYYY-MM-DD
- items: array de elementos con:
  - name: nombre del material o herramienta FÍSICA
  - quantity: cantidad (número, sin la unidad)
  - unit: unidad de medida EXACTA del albarán. IMPORTANTE:
    * Para áridos, zahorra, arena, gravas: usar "t" (toneladas) si aparece "Tn", "Ton", "Toneladas"
    * Para hormigón: usar "m³" o "m3"
    * Para líquidos: usar "l" (litros) o "m³"
    * Para sólidos pequeños: "kg", "g"
    * Para unidades: "ud", "u", "unidades"
    * Para longitud: "m", "cm", "mm"
    * Respetar EXACTAMENTE la unidad que aparece en el documento
  - unitPrice: precio unitario (número, opcional)
  - total: precio total (número, opcional)
  - itemType: DEBES clasificar cada item como "material" o "herramienta" según su naturaleza:
    * "material": consumibles, materias primas FÍSICAS (cemento, arena, ladrillos, pintura, cables, tubos, zahorra, áridos, etc.)
    * "herramienta": equipos, máquinas, utensilios reutilizables FÍSICOS (taladros, martillos, andamios, generadores, etc.)
  - category: categoría específica del item (ej: "Áridos", "Zahorra", "pintura", "herramienta eléctrica", etc.)
  - productCode: código o referencia del producto (opcional)
  - batchNumber: número de lote o serie (opcional)
  - brand: marca del producto (opcional)
  - model: modelo del producto (opcional)

CRÍTICO - NO INCLUIR EN ITEMS:
- NO incluir SERVICIOS (excavación, transporte, mano de obra, alquiler de maquinaria, trabajos subcontratados, etc.)
- NO incluir conceptos de TRABAJO (horas de operario, servicios técnicos, instalación, montaje, etc.)
- NO incluir EMPRESAS o SUBCONTRATISTAS como items
- SOLO incluir materiales FÍSICOS y herramientas FÍSICAS que se pueden tocar y almacenar
- Si el albarán es SOLO de servicios, devuelve items como array vacío []

IMPORTANTE: 
- Clasifica TODOS los items FÍSICOS como "material" o "herramienta"
- EXCLUYE servicios, mano de obra, trabajos subcontratados
- Si es consumible físico = material, si es reutilizable físico = herramienta
- CRÍTICO: Extrae la unidad de medida EXACTAMENTE como aparece en el albarán (t, kg, m³, ud, etc.)
- Para zahorra y áridos, normalmente viene en toneladas (t), NO en kg
- Los precios deben ser números sin símbolos de moneda
- Si no encuentras algún dato, déjalo como null

Responde ÚNICAMENTE con el JSON, sin texto adicional.`
      }
    ];

    // Agregar todas las imágenes al contenido
    for (const img of imagesToAnalyze) {
      messageContent.push({
        type: "image_url",
        image_url: {
          url: img
        }
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: messageContent
          }
        ],
        temperature: 0.1,
        max_tokens: 4000 // Aumentado para manejar más páginas
      }),
    });

    if (!response.ok) {
      // Log error internally but don't expose details to client
      console.error("AI service error:", response.status);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Límite de peticiones excedido. Por favor, espera un momento." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Servicio temporalmente no disponible" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Error al analizar la imagen" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error("No content in AI response");
      return new Response(
        JSON.stringify({ error: "No se pudo extraer información del albarán" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Raw AI response received, parsing...");

    // Extraer JSON de la respuesta (puede venir envuelto en ```json o similar)
    let extractedData;
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : content;
      extractedData = JSON.parse(jsonString.trim());
    } catch (parseError) {
      console.error("Error parsing JSON from AI response");
      return new Response(
        JSON.stringify({ error: "No se pudo interpretar la respuesta" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const processingTime = Date.now() - startTime;
    console.log(`Extracted data successfully (${processingTime}ms)`);

    // Validar y normalizar los datos
    const normalizedData = {
      supplier: extractedData.supplier || null,
      invoiceNumber: extractedData.invoiceNumber || null,
      date: extractedData.date || null,
      items: (extractedData.items || []).map((item: any) => ({
        name: item.name || "",
        quantity: parseFloat(item.quantity) || 0,
        unit: normalizeUnit(item.unit || "ud"),
        unitPrice: item.unitPrice ? parseFloat(item.unitPrice) : null,
        total: item.total ? parseFloat(item.total) : null,
        itemType: item.itemType || "material", // Default to material if not specified
        category: item.category || null,
        productCode: item.productCode || null,
        batchNumber: item.batchNumber || null,
        brand: item.brand || null,
        model: item.model || null,
      }))
    };

    // Actualizar inventario en segundo plano si tenemos workId
    if (workId && normalizedData.items.length > 0) {
      const authHeader = req.headers.get('authorization');
      if (authHeader) {
        const supabaseClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          { global: { headers: { Authorization: authHeader } } }
        );

        // Ejecutar actualización de inventario en segundo plano (sin await)
        updateInventory(
          supabaseClient,
          workId,
          organizationId ?? null,
          normalizedData.items,
          normalizedData.supplier,
          normalizedData.date,
          normalizedData.invoiceNumber
        ).catch(err => console.error('Background inventory update failed:', err));
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: normalizedData,
        confidence: 0.9,
        processingTimeMs: processingTime
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("Error in analyze-invoice function:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
};

serve(handler);
export default handler;

