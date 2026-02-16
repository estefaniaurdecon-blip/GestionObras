import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  work_id: z.string().uuid('Invalid work_id format'),
});

interface InventoryItem {
  id: string;
  name: string;
  item_type: string;
  category: string | null;
  unit: string | null;
  quantity: number | null;
  unit_price: number | null;
  brand: string | null;
  model: string | null;
  product_code: string | null;
  last_supplier: string | null;
}

interface WorkReport {
  id: string;
  material_groups: any;
}

interface AnalysisResult {
  item_id: string;
  original_name: string;
  action: 'delete' | 'update' | 'keep';
  reason: string;
  suggested_changes?: {
    item_type?: string;
    category?: string;
    unit?: string;
    name?: string;
  };
}

interface DuplicateSupplier {
  suppliers: string[];
  item_count: number;
  reason: string;
  normalized_name: string;
}

const handler = async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const body = await req.json();
    const validationResult = requestSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error('Validation failed:', validationResult.error);
      throw new Error('Invalid request data');
    }

    const { work_id } = validationResult.data;

    console.log('Fetching inventory for work_id:', work_id);

    // Fetch work reports to analyze suppliers from material groups
    const { data: workReports, error: reportsError } = await supabase
      .from('work_reports')
      .select('id, material_groups')
      .eq('work_id', work_id)
      .order('created_at', { ascending: true });

    if (reportsError) {
      console.error('Error fetching work reports:', reportsError);
      throw reportsError;
    }

    // Extract suppliers from material groups
    const supplierMap = new Map<string, string[]>();
    // Helper function to normalize supplier names more aggressively
    const normalizeSupplierName = (name: string): string => {
      return name
        .toLowerCase()
        .replace(/\s+/g, '') // Remove all spaces
        .replace(/[áàäâ]/g, 'a')
        .replace(/[éèëê]/g, 'e')
        .replace(/[íìïî]/g, 'i')
        .replace(/[óòöô]/g, 'o')
        .replace(/[úùüû]/g, 'u')
        .replace(/ñ/g, 'n')
        .replace(/[^a-z0-9]/g, ''); // Remove special characters
    };

    let totalMaterialItems = 0;

    if (workReports && workReports.length > 0) {
      workReports.forEach((report: WorkReport) => {
        if (report.material_groups && Array.isArray(report.material_groups)) {
          report.material_groups.forEach((group: any) => {
            if (group.supplier) {
              const normalizedSupplier = normalizeSupplierName(group.supplier);
              if (!supplierMap.has(normalizedSupplier)) {
                supplierMap.set(normalizedSupplier, []);
              }
              supplierMap.get(normalizedSupplier)!.push(group.supplier);
              totalMaterialItems++;
            }
          });
        }
      });
    }

    console.log(`Found ${totalMaterialItems} material entries from ${workReports?.length || 0} work reports`);

    // Find duplicate suppliers - first pass: exact normalized match
    const duplicateSuppliers: DuplicateSupplier[] = [];
    supplierMap.forEach((variants, normalized) => {
      const uniqueVariants = [...new Set(variants)];
      if (uniqueVariants.length > 1) {
        duplicateSuppliers.push({
          suppliers: uniqueVariants,
          item_count: variants.length,
          reason: `Se detectaron ${uniqueVariants.length} variantes del mismo proveedor`,
          normalized_name: normalized
        });
      }
    });

    // Second pass: detect similar suppliers (prefix/substring matches)
    const allNormalized = Array.from(supplierMap.keys());
    const processedPairs = new Set<string>();
    
    for (let i = 0; i < allNormalized.length; i++) {
      for (let j = i + 1; j < allNormalized.length; j++) {
        const norm1 = allNormalized[i];
        const norm2 = allNormalized[j];
        const pairKey = [norm1, norm2].sort().join('|');
        
        if (processedPairs.has(pairKey)) continue;
        
        // Check if one is a prefix of the other or if they're very similar
        const shorter = norm1.length < norm2.length ? norm1 : norm2;
        const longer = norm1.length < norm2.length ? norm2 : norm1;
        
        if (longer.startsWith(shorter) && shorter.length >= 4) {
          // Merge these two groups
          const variants1 = supplierMap.get(norm1) || [];
          const variants2 = supplierMap.get(norm2) || [];
          const allVariants = [...new Set([...variants1, ...variants2])];
          
          // Remove existing entries if they were already added as separate duplicates
          const existingIndex = duplicateSuppliers.findIndex(d => 
            d.normalized_name === norm1 || d.normalized_name === norm2
          );
          
          if (existingIndex >= 0) {
            duplicateSuppliers.splice(existingIndex, 1);
          }
          
          duplicateSuppliers.push({
            suppliers: allVariants,
            item_count: variants1.length + variants2.length,
            reason: `Proveedores similares detectados (uno es extensión del otro)`,
            normalized_name: shorter
          });
          
          processedPairs.add(pairKey);
        }
      }
    }

    console.log(`Found ${duplicateSuppliers.length} groups of duplicate suppliers from work reports`);

    // Fetch inventory items (limit to 50 at a time to avoid overwhelming AI)
    // Order by created_at to process older items first
    const { data: inventoryItems, error: fetchError } = await supabase
      .from('work_inventory')
      .select('id, name, item_type, category, unit, quantity, unit_price, brand, model, product_code, last_supplier')
      .eq('work_id', work_id)
      .order('created_at', { ascending: true })
      .limit(50);

    if (fetchError) {
      console.error('Error fetching inventory:', fetchError);
      throw fetchError;
    }

    // If no inventory items but have duplicate suppliers, return just the suppliers
    if ((!inventoryItems || inventoryItems.length === 0) && duplicateSuppliers.length > 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Se encontraron proveedores duplicados para unificar',
          results: [],
          duplicate_suppliers: duplicateSuppliers,
          total_analyzed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!inventoryItems || inventoryItems.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No hay items en el inventario para analizar',
          results: [],
          duplicate_suppliers: duplicateSuppliers,
          total_analyzed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Analyzing ${inventoryItems.length} inventory items`);

    // Analyze suppliers for duplicates from inventory as well
    inventoryItems.forEach((item: any) => {
      if (item.last_supplier) {
        const normalizedSupplier = normalizeSupplierName(item.last_supplier);
        if (!supplierMap.has(normalizedSupplier)) {
          supplierMap.set(normalizedSupplier, []);
        }
        supplierMap.get(normalizedSupplier)!.push(item.last_supplier);
      }
    });

    // Recalculate duplicate suppliers with inventory data included
    duplicateSuppliers.length = 0; // Clear the array
    supplierMap.forEach((variants, normalized) => {
      const uniqueVariants = [...new Set(variants)];
      if (uniqueVariants.length > 1) {
        duplicateSuppliers.push({
          suppliers: uniqueVariants,
          item_count: variants.length,
          reason: `Se detectaron ${uniqueVariants.length} variantes del mismo proveedor`,
          normalized_name: normalized
        });
      }
    });

    console.log(`Total ${duplicateSuppliers.length} groups of duplicate suppliers (including inventory)`);

    // Prepare prompt for AI analysis
    const systemPrompt = `Eres un experto en construcción y gestión de inventarios de obra. Tu tarea es analizar items y clasificarlos correctamente.

CRITERIOS DE CLASIFICACIÓN PRINCIPALES:

1. MAQUINARIA (ELIMINAR - acción "delete"):
   - Vehículos y equipos pesados: excavadoras, retroexcavadoras, palas cargadoras, bulldozers, motoniveladoras
   - Equipos de elevación: grúas móviles, grúas torre, plataformas elevadoras, montacargas
   - Vehículos de transporte: camiones, dumpers, furgonetas
   - Equipos de compactación: rodillos, compactadoras de placa, pisones
   - Maquinaria de hormigonado: hormigoneras, bombas de hormigón
   - Generadores y grupos electrógenos de gran tamaño

2. MATERIALES (item_type: "material"):
   Son elementos que SE CONSUMEN o SE INCORPORAN a la obra:
   
   A) ÁRIDOS Y ZAHORRAS (unidad: tn o t):
      - Arena, grava, gravilla, piedra, zahorra artificial, zahorra natural, sub-base granular
      - Todo-uno, albero, tierra vegetal
   
   B) CONGLOMERANTES Y MEZCLAS (unidad: kg para sacos, m3 para granel):
      - Cemento, cal, yeso
      - Mortero preparado, hormigón preparado
      - Masillas, adhesivos, selladores
   
   C) ELEMENTOS CONSTRUCTIVOS (unidad: ud, m, m2 según aplique):
      - Ladrillos, bloques, bordillos, adoquines
      - Piezas cerámicas, azulejos, baldosas
      - Tuberías, conductos, arquetas, registros
      - Cables eléctricos, cajas de conexión, interruptores
      - Perfiles metálicos, vigas, viguetas
      - Tableros, paneles, chapas
   
   D) ACABADOS Y REVESTIMIENTOS (unidad: kg, l, m2):
      - Pinturas, barnices, lacas, imprimaciones
      - Morteros decorativos, revoques, enfoscados
      - Membranas impermeabilizantes
   
   E) ELEMENTOS DE FIJACIÓN Y UNIÓN (unidad: ud, kg):
      - Tornillos, clavos, pernos, tirafondos
      - Bridas, abrazaderas, grapas
      - Conectores, manguitos, empalmes
   
   F) PRODUCTOS AUXILIARES (unidad: l, kg):
      - Desencofrantes, aditivos, aceleradores
      - Aceites, lubricantes, disolventes
      - Geotextiles, láminas separadoras

3. HERRAMIENTAS (item_type: "herramienta"):
   Son equipos REUTILIZABLES que NO se incorporan a la obra:
   
   A) HERRAMIENTAS ELÉCTRICAS PORTÁTILES (unidad: ud):
      - Taladros, atornilladores, destornilladores eléctricos
      - Amoladoras, radiales, esmeriladoras
      - Sierras circulares, caladoras, ingletadoras portátiles
      - Lijadoras, pulidoras, fresadoras portátiles
      - Martillos percutores, demoledores eléctricos
      - Pistolas de clavos, grapadoras eléctricas
   
   B) HERRAMIENTAS MANUALES (unidad: ud):
      - Martillos, mazas, macetas
      - Destornilladores, llaves, alicates, tenazas
      - Palas, picos, azadas, rastrillos
      - Niveles, plomadas, escuadras, metros
      - Cinceles, formones, gubias
      - Llanas, paletas, fratases, rasquetas
   
   C) EQUIPOS DE MEDICIÓN (unidad: ud):
      - Niveles láser, distanciómetros
      - Flexómetros, medidores digitales
      - Detectores de metales, humedad
   
   D) EQUIPOS DE CORTE (unidad: ud):
      - Cortadoras de cerámica manuales
      - Sierras manuales, serruchos
      - Tijeras de podar, cizallas
   
   E) EQUIPOS AUXILIARES PEQUEÑOS (unidad: ud):
      - Carretillas de mano (NO camiones)
      - Escaleras portátiles, andamios tubulares pequeños
      - Cubos, espuertas, artesas
      - Pistolas de silicona, aplicadores

REGLAS DE NORMALIZACIÓN DE UNIDADES:
- Áridos/zahorras/materiales granulares → SIEMPRE "tn" o "t"
- Cemento/mortero en saco → "kg"
- Hormigón/mortero a granel → "m3"
- Líquidos (pinturas, aceites, agua) → "l"
- Cables/tubos/perfiles lineales → "m"
- Superficies (chapas, paneles, membranas) → "m2"
- Piezas individuales (ladrillos, herramientas, tornillos) → "ud"

CATEGORÍAS SUGERIDAS:
Materiales: "Áridos", "Conglomerantes", "Cerámica", "Fontanería", "Electricidad", "Estructuras metálicas", "Carpintería", "Acabados", "Impermeabilización", "Fijaciones", "Auxiliares"
Herramientas: "Eléctricas portátiles", "Manuales", "Medición", "Corte", "Auxiliares"

IMPORTANTE: 
- Si un item tiene dudas entre material/herramienta, considera: ¿Se consume/incorpora (material) o se reutiliza (herramienta)?
- Los consumibles son SIEMPRE materiales (brocas, discos de corte, etc.)
- Las herramientas pequeñas portátiles son herramientas, NO maquinaria

FORMATO DE RESPUESTA:
RESPONDE SOLO con un array JSON válido, SIN texto adicional ni markdown. Cada objeto debe tener:
- item_id: ID del item (COPIA EXACTAMENTE el UUID completo proporcionado)
- original_name: nombre original del item
- action: "delete" (maquinaria), "update" (necesita correcciones), "keep" (correcto)
- reason: explicación breve y clara
- suggested_changes: objeto con campos a corregir (item_type: "material" o "herramienta", category, unit, name si necesita mejora)

**IMPORTANTE**: El campo item_id debe ser EXACTAMENTE el mismo ID que se te proporcionó en el análisis. NO lo acortes, NO lo modifiques.

Ejemplo:
[
  {
    "item_id": "123",
    "original_name": "Excavadora",
    "action": "delete",
    "reason": "Es maquinaria, no debe estar en inventario de materiales/herramientas"
  },
  {
    "item_id": "456",
    "original_name": "Cemento",
    "action": "update",
    "reason": "Falta categoría y unidad correcta",
    "suggested_changes": {
      "item_type": "material",
      "category": "Materiales de construcción - Aglomerantes",
      "unit": "kg"
    }
  }
]`;

    const inventoryDescription = inventoryItems.map((item: InventoryItem) => 
      `ID:${item.id}|Nombre:${item.name}|Tipo:${item.item_type}|Categoría:${item.category || 'sin categoría'}|Unidad:${item.unit || 'sin unidad'}|Marca:${item.brand || 'N/A'}|Modelo:${item.model || 'N/A'}`
    ).join('\n');

    const userPrompt = `Analiza estos ${inventoryItems.length} items del inventario y proporciona correcciones.

IMPORTANTE: Copia EXACTAMENTE cada ID completo tal como aparece (36 caracteres con guiones). NO lo acortes.

Items:
${inventoryDescription}

Responde SOLO con el array JSON, sin texto adicional.`;

    console.log('Calling Lovable AI for analysis...');

    // Call Lovable AI
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        throw new Error('Límite de solicitudes de IA excedido. Intenta de nuevo más tarde.');
      }
      if (aiResponse.status === 402) {
        throw new Error('Fondos insuficientes en Lovable AI. Añade créditos a tu workspace.');
      }
      
      throw new Error(`Error en análisis de IA: ${aiResponse.status}`);
    }

    let aiData;
    let aiContent;
    
    try {
      aiData = await aiResponse.json();
      aiContent = aiData.choices?.[0]?.message?.content;
      
      if (!aiContent) {
        console.error('No content in AI response:', JSON.stringify(aiData));
        throw new Error('No se recibió respuesta de la IA');
      }
      
      console.log('AI Response received, content length:', aiContent.length);
    } catch (jsonError) {
      console.error('Error parsing AI response JSON:', jsonError);
      const responseText = await aiResponse.text();
      console.error('Response text:', responseText.substring(0, 500));
      throw new Error('Error al leer respuesta de IA. Intenta de nuevo.');
    }

    // Parse AI response
    let analysisResults: AnalysisResult[];
    try {
      // Try to extract JSON from the response
      const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        analysisResults = JSON.parse(jsonMatch[0]);
      } else {
        // Try parsing directly
        analysisResults = JSON.parse(aiContent);
      }
      
      // Validate that it's an array
      if (!Array.isArray(analysisResults)) {
        console.error('AI response is not an array:', aiContent.substring(0, 500));
        throw new Error('Formato de respuesta inválido');
      }
      
      // Validate UUIDs in results
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const validResults = analysisResults.filter(result => {
        if (!result.item_id || !uuidRegex.test(result.item_id)) {
          console.warn(`Invalid UUID for item: ${result.original_name} - ID: ${result.item_id}`);
          return false;
        }
        return true;
      });
      
      if (validResults.length < analysisResults.length) {
        console.warn(`Filtered ${analysisResults.length - validResults.length} results with invalid UUIDs`);
      }
      
      analysisResults = validResults;
      
      console.log(`Successfully parsed ${analysisResults.length} valid results`);
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      console.error('AI Content preview:', aiContent.substring(0, 500));
      throw new Error('Error al procesar respuesta de IA. La respuesta no tiene formato JSON válido.');
    }

    console.log(`Analysis complete: ${analysisResults.length} results`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        results: analysisResults,
        duplicate_suppliers: duplicateSuppliers,
        total_analyzed: inventoryItems.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-inventory function:', error);
    
    // Sanitize error message - don't expose internal details
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const publicMessage = errorMessage === 'Invalid request data' 
      ? 'Datos de solicitud inválidos' 
      : 'Error al analizar el inventario';
    
    return new Response(
      JSON.stringify({ 
        error: publicMessage,
        success: false 
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
};

serve(handler);
export default handler;

