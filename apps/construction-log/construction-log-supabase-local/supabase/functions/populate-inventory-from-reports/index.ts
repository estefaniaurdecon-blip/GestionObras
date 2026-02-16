import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// Función para normalizar nombres de empresas/proveedores
function normalizeCompanyName(name: string): string {
  if (!name) return '';
  
  return name
    .trim()
    // Eliminar espacios múltiples
    .replace(/\s+/g, ' ')
    // Normalizar sufijos legales comunes
    .replace(/,?\s*(S\.?L\.?U?\.?|S\.?A\.?|SOCIEDAD LIMITADA|SOCIEDAD ANÓNIMA)\.?\s*$/gi, ', S.L.')
    .trim();
}

// Calcular distancia de Levenshtein
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1,
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1
        );
      }
    }
  }
  
  return dp[m][n];
}

// Calcular similitud entre dos strings (0-1)
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  if (str1.toLowerCase() === str2.toLowerCase()) return 1;
  
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  return (maxLen - distance) / maxLen;
}

// Encontrar el nombre canónico de proveedor en la lista existente
async function findCanonicalSupplier(supplierName: string, supabase: any, organizationId: string): Promise<string> {
  if (!supplierName) return supplierName;
  
  const normalizedInput = normalizeCompanyName(supplierName);
  
  // Buscar proveedores existentes en el inventario
  const { data: existingSuppliers } = await supabase
    .from('work_inventory')
    .select('last_supplier')
    .eq('organization_id', organizationId)
    .not('last_supplier', 'is', null);
  
  // También buscar en el portfolio de empresas
  const { data: portfolioCompanies } = await supabase
    .from('company_portfolio')
    .select('company_name')
    .eq('organization_id', organizationId);
  
  // Crear conjunto de nombres únicos
  const allNames = new Set<string>();
  
  for (const item of existingSuppliers || []) {
    if (item.last_supplier) allNames.add(item.last_supplier);
  }
  
  for (const company of portfolioCompanies || []) {
    if (company.company_name) allNames.add(company.company_name);
  }
  
  // Buscar el nombre más similar con umbral de 0.85
  let bestMatch: string | null = null;
  let bestSimilarity = 0;
  const threshold = 0.85;
  
  for (const existingName of allNames) {
    const similarity = calculateSimilarity(normalizedInput, normalizeCompanyName(existingName));
    if (similarity >= threshold && similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = existingName;
    }
  }
  
  // Si encontramos una coincidencia, usar ese nombre; si no, normalizar el nuevo
  return bestMatch || normalizedInput;
}

// Detectar materiales de ejecución inmediata (Just-in-Time: hormigón, asfalto, áridos a granel)
function isImmediateConsumptionMaterial(name: string): boolean {
  const lowName = name.toLowerCase();
  const immediateKeywords = [
    'hormigón', 'hormigon', 'concrete',
    'asfalto', 'aglomerado', 'mezcla bituminosa',
    'árido', 'arido', 'grava', 'gravilla', 'arena', 'zahorra', 'todo-uno',
    'mortero preparado', 'mortero seco',
    'relleno fluido', 'relleno compactado',
    'reciclado', 'rechazo de cantera'
  ];
  return immediateKeywords.some(k => lowName.includes(k));
}

interface MaterialItemDB {
  name?: string;
  material?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  product_code?: string;
  batch_number?: string;
  brand?: string;
  model?: string;
}

interface MachineryItemDB {
  type?: string;
  machinery?: string;
  hours?: number;
  quantity?: number;
  unitPrice?: number;
  provider?: string;
  product_code?: string;
  brand?: string;
  model?: string;
}

// Función para clasificar items usando IA
async function classifyItems(items: string[]): Promise<Array<{ name: string; type: 'material' | 'herramienta' }>> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY || items.length === 0) {
    return items.map(name => ({ name, type: 'material' }));
  }

  try {
    const prompt = `Clasifica cada item de construcción como "material" o "herramienta" siguiendo estos criterios estrictos:

Items a clasificar:
${items.map((item, i) => `${i + 1}. ${item}`).join('\n')}

DEFINICIONES PRINCIPALES:

1. MATERIAL: Elementos que SE CONSUMEN o SE INCORPORAN físicamente a la obra
   Ejemplos de materiales:
   - Áridos: arena, grava, zahorra, piedra, tierra
   - Conglomerantes: cemento, hormigón, mortero, yeso, cal
   - Elementos constructivos: ladrillos, bloques, bordillos, adoquines, azulejos
   - Instalaciones: tuberías, cables, conductos, arquetas, cajas eléctricas
   - Estructuras: vigas, perfiles, viguetas, mallas, ferralla
   - Acabados: pintura, barniz, revestimientos, impermeabilizantes
   - Fijaciones: tornillos, clavos, pernos, bridas, grapas (se consumen/pierden)
   - Auxiliares: desencofrantes, aditivos, geotextiles

2. HERRAMIENTA: Equipos REUTILIZABLES que NO se incorporan a la obra
   Ejemplos de herramientas:
   - Eléctricas portátiles: taladros, amoladoras, sierras, martillos percutores, lijadoras
   - Manuales: palas, picos, martillos, llaves, destornilladores, niveles, metros
   - Medición: niveles láser, flexómetros, distanciómetros
   - Auxiliares pequeños: carretillas de mano, escaleras portátiles, cubos, espuertas
   - Equipos menores: vibradores de hormigón portátiles, cortadoras pequeñas

IMPORTANTE - NO CLASIFICAR:
- Maquinaria pesada (excavadoras, camiones, grúas) → Excluir del inventario
- Servicios, empresas, subcontratistas → No son items físicos
- Mano de obra, alquileres → No son items físicos

REGLA CLAVE: 
¿Se incorpora/consume en la obra? → MATERIAL
¿Se usa repetidamente sin consumirse? → HERRAMIENTA
¿Es un servicio o empresa? → NO INCLUIR

FORMATO: Responde SOLO con JSON array: [{"name": "...", "type": "material" o "herramienta"}]
Si un item NO es físico (servicio/empresa), NO lo incluyas en la respuesta.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: 'Eres un experto en construcción y gestión de inventarios. Clasifica items físicos con precisión. Responde siempre con JSON válido.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        tools: [
          {
            type: 'function',
            function: {
              name: 'classify_items',
              description: 'Clasificar items de construcción como material o herramienta',
              parameters: {
                type: 'object',
                properties: {
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        type: { type: 'string', enum: ['material', 'herramienta'] }
                      },
                      required: ['name', 'type'],
                      additionalProperties: false
                    }
                  }
                },
                required: ['items'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'classify_items' } }
      }),
    });

    if (!response.ok) {
      console.error('AI classification failed:', response.status);
      return items.map(name => ({ name, type: 'material' }));
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      if (parsed.items && Array.isArray(parsed.items)) {
        return parsed.items;
      }
    }

    return items.map(name => ({ name, type: 'material' }));
  } catch (error) {
    console.error('Error in AI classification:', error);
    return items.map(name => ({ name, type: 'material' }));
  }
}

Deno.const handler = async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the work_id from the request
    const { work_id, force } = await req.json();

    console.log('Populating inventory for work:', work_id);

    // Get already synced report IDs for this work
    const { data: syncedReports, error: syncedError } = await supabase
      .from('work_inventory_sync_log')
      .select('work_report_id')
      .eq('work_id', work_id);

    if (syncedError) {
      console.error('Error fetching synced reports:', syncedError);
      throw syncedError;
    }

    const syncedReportIds = new Set((syncedReports || []).map(r => r.work_report_id));
    console.log(`Found ${syncedReportIds.size} already synced reports`);

    // Get all completed work reports for this work
    const { data: reports, error: reportsError } = await supabase
      .from('work_reports')
      .select('*')
      .eq('work_id', work_id)
      .eq('status', 'completed');

    if (reportsError) {
      console.error('Error fetching reports:', reportsError);
      throw reportsError;
    }

    console.log(`Found ${reports?.length || 0} completed reports`);

    if (!reports || reports.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No completed reports found for this work',
          itemsProcessed: 0,
          reportsAnalyzed: 0,
          newReports: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Elegir reports a procesar: todos si force, o solo nuevos
    const newReports = force ? reports : reports.filter(r => !syncedReportIds.has(r.id));
    console.log(`Force mode: ${!!force}. Reports to sync: ${newReports.length}`);

    if (!newReports || newReports.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: force ? 'No hay partes para reprocesar.' : 'No new reports to sync. All reports already processed.',
          itemsProcessed: 0,
          reportsAnalyzed: reports.length,
          newReports: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ya NO limpiamos el inventario existente - mantenemos los ajustes manuales
    const itemsToInsert: Array<{
      name: string;
      item_type: 'material' | 'herramienta';
      category: string;
      quantity: number;
      unit: string;
      last_entry_date: string;
      last_supplier?: string;
      delivery_note_number?: string;
      product_code?: string;
      unit_price?: number;
      total_price?: number;
      batch_number?: string;
      brand?: string;
      model?: string;
      work_id: string;
      organization_id: string;
      is_immediate_consumption: boolean;
    }> = [];

    // Recolectar todos los items para clasificar con IA
    const allItemsToClassify: Array<{
      name: string;
      quantity: number;
      unit: string;
      date: string;
      supplier: string;
      category: string;
      delivery_note_number?: string;
      product_code?: string;
      unit_price?: number;
      batch_number?: string;
      brand?: string;
      model?: string;
      work_id: string;
      organization_id: string;
      is_immediate_consumption: boolean;
    }> = [];

    // Obtener el primer organization_id para la estandarización de proveedores
    const firstOrgId = newReports[0]?.organization_id;

    // Process each NEW report
    for (const report of newReports) {
      const date = report.date;
      
      // Procesar grupos de MATERIAL únicamente cuando hay evidencia de albarán/escaneo (nº de albarán)
      const materialGroups = (report as any).material_groups || [];
      for (const group of materialGroups) {
        if (!group || !group.items || group.items.length === 0) continue;
        
        const rawSupplier = group?.supplier || group?.provider || 'Sin proveedor';
        // Estandarizar el nombre del proveedor
        const supplier = await findCanonicalSupplier(rawSupplier, supabase, report.organization_id);
        const category = supplier || 'Materiales';
        const deliveryNoteNumber = group?.invoiceNumber || group?.deliveryNoteNumber || group?.delivery_note_number;
        
        // Requisito: solo sincronizar si viene número de albarán a nivel de grupo (indica que fue escaneado por IA)
        if (!deliveryNoteNumber) {
          // Saltar grupos sin referencia clara de albarán para evitar datos manuales o servicios
          continue;
        }

        const items: MaterialItemDB[] = Array.isArray(group?.items) ? group.items : [];
        
        const serviceKeywords = ['alquiler', 'servicio', 'servicios', 'mano de obra', 'manodeobra', 'operario', 'operarios', 'transporte', 'portes', 'grúa', 'grua', 'plataforma', 'excavación', 'excavacion', 'retirada', 'montaje', 'desmontaje'];
        
        for (const item of items) {
          const itemName = (item?.name || item?.material || '').toString().trim();
          if (!itemName) continue;
          const lowerName = itemName.toLowerCase();
          // Excluir ítems que parecen servicios
          if (serviceKeywords.some(k => lowerName.includes(k))) continue;

          const qty = Number(item?.quantity ?? 0) || 0;
          const rawUnit = (item?.unit || 'ud').toString().trim();
          const unit = normalizeUnit(rawUnit);
          const unitPrice = item?.unitPrice ? Number(item.unitPrice) : undefined;
          const productCode = item?.product_code?.toString().trim();
          const batchNumber = item?.batch_number?.toString().trim();
          const brand = item?.brand?.toString().trim();
          const model = item?.model?.toString().trim();
          
          // Mantener número de albarán del grupo (no intentar deducirlo del nombre)
          const localDelivery = deliveryNoteNumber;
          
          allItemsToClassify.push({
            name: itemName,
            quantity: qty,
            unit,
            date,
            supplier,
            category,
            delivery_note_number: localDelivery,
            product_code: productCode,
            unit_price: unitPrice,
            batch_number: batchNumber,
            brand,
            model,
            work_id: report.work_id,
            organization_id: report.organization_id,
            is_immediate_consumption: isImmediateConsumptionMaterial(itemName)
          });
        }
      }

      // OMITIR grupos de MAQUINARIA (suelen ser alquiler/servicio). No se agregan al inventario.
      const machineryGroups: any[] = [];
      // Si en el futuro se compran herramientas (no alquiler) mediante albarán escaneado,
      // se podrá reactivar este bloque con validaciones explícitas de compra.

    }

    console.log(`Collected ${allItemsToClassify.length} items to classify`);

    // Clasificar items usando IA
    const itemNames = allItemsToClassify.map(item => item.name);
    const classifiedItems = await classifyItems(itemNames);
    
    // Crear mapa de clasificaciones
    const classificationMap = new Map(classifiedItems.map(item => [item.name, item.type]));

    // Preparar items para insertar con sus clasificaciones
    for (const item of allItemsToClassify) {
      const itemType = classificationMap.get(item.name) || 'material';
      const totalPrice = item.unit_price && item.quantity ? item.unit_price * item.quantity : undefined;
      
      itemsToInsert.push({
        name: item.name,
        item_type: itemType,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        last_entry_date: item.date,
        last_supplier: item.supplier,
        delivery_note_number: item.delivery_note_number,
        product_code: item.product_code,
        unit_price: item.unit_price,
        total_price: totalPrice,
        batch_number: item.batch_number,
        brand: item.brand,
        model: item.model,
        work_id: item.work_id,
        organization_id: item.organization_id,
        is_immediate_consumption: item.is_immediate_consumption
      });
    }

    console.log(`Prepared ${itemsToInsert.length} items to insert from ${newReports.length} new reports`);

    // Verificar duplicados y actualizar o insertar
    let successCount = 0;
    let errorCount = 0;
    let updatedCount = 0;
    let immediateConsumptionCount = 0;

    for (const item of itemsToInsert) {
      // Normalizar la unidad (ya está normalizada, pero asegurar)
      const normalizedUnit = normalizeUnit(item.unit);
      
      // Para materiales de consumo inmediato: stock siempre 0, pero registrar movimientos
      const effectiveQuantity = item.is_immediate_consumption ? 0 : item.quantity;
      
      // Buscar duplicados según la clave única real (work_id, name, item_type, unit normalizada)
      const { data: existingItems, error: searchError } = await supabase
        .from('work_inventory')
        .select('*')
        .eq('work_id', item.work_id)
        .eq('name', item.name)
        .eq('item_type', item.item_type)
        .eq('unit', normalizedUnit)
        .limit(1);

      if (searchError) {
        console.error('Error searching for existing item:', searchError);
        errorCount++;
        continue;
      }

      let inventoryItemId: string | null = null;

      if (existingItems && existingItems.length > 0) {
        // Ya existe: actualizar cantidad y fecha
        const existing = existingItems[0];
        inventoryItemId = existing.id;
        
        // Para consumo inmediato no acumulamos stock
        const newQuantity = item.is_immediate_consumption 
          ? 0 
          : (existing.quantity || 0) + item.quantity;
        
        const { error: updateError } = await supabase
          .from('work_inventory')
          .update({
            quantity: newQuantity,
            last_entry_date: item.last_entry_date,
            last_supplier: item.last_supplier,
            delivery_note_number: existing.delivery_note_number || item.delivery_note_number || null,
            product_code: existing.product_code || item.product_code || null,
            unit_price: existing.unit_price || item.unit_price || null,
            total_price: item.total_price || existing.total_price || null,
            batch_number: existing.batch_number || item.batch_number || null,
            brand: existing.brand || item.brand || null,
            model: existing.model || item.model || null,
            is_immediate_consumption: item.is_immediate_consumption,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);

        if (updateError) {
          console.error('Error updating item:', updateError);
          errorCount++;
        } else {
          updatedCount++;
          console.log(`Updated existing item: ${item.name} (qty: ${newQuantity}, immediate: ${item.is_immediate_consumption})`);
        }
      } else {
        // No existe: insertar nuevo con unidad normalizada
        const { data: insertedItem, error: insertError } = await supabase
          .from('work_inventory')
          .insert({
            work_id: item.work_id,
            organization_id: item.organization_id,
            name: item.name,
            item_type: item.item_type,
            category: item.category,
            quantity: effectiveQuantity,
            unit: normalizedUnit,
            last_entry_date: item.last_entry_date,
            last_supplier: item.last_supplier,
            delivery_note_number: item.delivery_note_number,
            product_code: item.product_code,
            unit_price: item.unit_price,
            total_price: item.total_price,
            batch_number: item.batch_number,
            brand: item.brand,
            model: item.model,
            is_immediate_consumption: item.is_immediate_consumption,
            source: 'ai'
          })
          .select('id')
          .single();

        if (insertError) {
          console.error('Error inserting item:', insertError);
          errorCount++;
        } else {
          inventoryItemId = insertedItem?.id || null;
          successCount++;
          console.log(`Inserted new item: ${item.name} (immediate: ${item.is_immediate_consumption})`);
        }
      }

      // Crear movimientos en inventory_movements para auditoría
      if (inventoryItemId && item.quantity > 0) {
        // Movimiento de ENTRADA
        const { error: entryMovementError } = await supabase
          .from('inventory_movements')
          .insert({
            organization_id: item.organization_id,
            work_id: item.work_id,
            inventory_item_id: inventoryItemId,
            item_name: item.name,
            item_type: item.item_type,
            item_category: item.category,
            movement_type: 'entry',
            quantity: item.quantity,
            unit: normalizedUnit,
            unit_price: item.unit_price || null,
            total_price: item.total_price || null,
            supplier: item.last_supplier,
            delivery_note_number: item.delivery_note_number,
            source: 'ai',
            is_immediate_consumption: item.is_immediate_consumption
          });

        if (entryMovementError) {
          console.error('Error creating entry movement:', entryMovementError);
        }

        // Para materiales de consumo inmediato: crear también movimiento de SALIDA automático
        if (item.is_immediate_consumption) {
          const { error: exitMovementError } = await supabase
            .from('inventory_movements')
            .insert({
              organization_id: item.organization_id,
              work_id: item.work_id,
              inventory_item_id: inventoryItemId,
              item_name: item.name,
              item_type: item.item_type,
              item_category: item.category,
              movement_type: 'exit',
              quantity: item.quantity,
              unit: normalizedUnit,
              unit_price: item.unit_price || null,
              total_price: item.total_price || null,
              supplier: item.last_supplier,
              delivery_note_number: item.delivery_note_number,
              source: 'auto_consumption',
              is_immediate_consumption: true,
              notes: 'Consumo directo en obra (Just-in-Time)'
            });

          if (exitMovementError) {
            console.error('Error creating exit movement:', exitMovementError);
          } else {
            immediateConsumptionCount++;
          }
        }
      }
    }

    // Mark reports as synced (evitar duplicados en modo force)
    if (!force) {
      for (const report of newReports) {
        const { error: logError } = await supabase
          .from('work_inventory_sync_log')
          .upsert({
            work_id: report.work_id,
            work_report_id: report.id,
            organization_id: report.organization_id
          }, { onConflict: 'work_id,work_report_id' });

        if (logError) {
          console.error('Error logging sync for report:', report.id, logError);
        }
      }
    }

    console.log(`Inserted: ${successCount}, Updated: ${updatedCount}, Immediate consumption: ${immediateConsumptionCount}, Errors: ${errorCount}`);

    return new Response(
      JSON.stringify({ 
        message: `Inventario actualizado. ${successCount} nuevos, ${updatedCount} actualizados, ${immediateConsumptionCount} consumo directo.`,
        itemsInserted: successCount,
        itemsUpdated: updatedCount,
        immediateConsumptionItems: immediateConsumptionCount,
        errors: errorCount,
        reportsAnalyzed: reports.length,
        newReports: newReports.length,
        alreadySynced: reports.length - newReports.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
};

serve(handler);
export default handler;

