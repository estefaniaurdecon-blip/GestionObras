import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Prompts de cambio de sección - se añaden al inicio de todos los prompts
const sectionSwitchPrompt = `
IMPORTANTE: Antes de procesar cualquier otro comando, detecta si el usuario quiere CAMBIAR DE SECCIÓN.

Comandos de cambio de sección (prioridad máxima):
- "Mano de obra", "Personal", "Trabajadores" → {"action": "switch_section", "targetSection": "work_groups"}
- "Maquinaria", "Maquinaria de subcontrata", "Máquinas" → {"action": "switch_section", "targetSection": "machinery_groups"}
- "Subcontratas", "Subcontrata", "Empresas subcontratadas" → {"action": "switch_section", "targetSection": "subcontract_groups"}
- "Observaciones", "Observaciones e incidencias", "Incidencias" → {"action": "switch_section", "targetSection": "observations"}

Si detectas un comando de cambio de sección, devuelve SOLO el JSON de switch_section y NO proceses nada más.
Si NO es un comando de cambio de sección, continúa con el análisis normal:

`;

const systemPrompts: Record<string, string> = {
  work_groups: `Analiza el comando del usuario para la sección MANO DE OBRA.

COMANDOS POR NOMBRE DE CAMPO (el usuario dice el nombre del campo seguido del valor):
- "Empresa [valor]" → {"action": "set_field", "field": "company", "value": "valor"}
- "Nombre [valor]" → {"action": "set_field", "field": "name", "value": "valor"}  
- "Actividad [valor]" → {"action": "set_field", "field": "activity", "value": "valor"}
- "Horas [número]" → {"action": "set_field", "field": "hours", "value": número}

COMANDOS DE ESTRUCTURA:
- "Nueva empresa", "añadir grupo", "nuevo grupo", "otra empresa" → {"action": "add_group"}
- "Añadir fila", "nuevo trabajador", "otra fila", "añadir trabajador" → {"action": "add_row"}
- "Eliminar última fila", "borrar fila" → {"action": "delete_last_row"}
- "Copiar grupo anterior", "duplicar grupo" → {"action": "copy_last_group"}

COMANDOS DE NAVEGACIÓN:
- "Siguiente fila", "fila siguiente", "bajar" → {"action": "next_row"}
- "Fila anterior", "anterior", "subir" → {"action": "prev_row"}
- "Primera fila", "ir al principio" → {"action": "first_row"}
- "Última fila", "ir al final" → {"action": "last_row"}
- "Fila [número]", "ir a fila [número]" → {"action": "go_to_row", "rowIndex": número}
- "Siguiente grupo", "grupo siguiente" → {"action": "next_group"}
- "Grupo anterior" → {"action": "prev_group"}

COMANDOS DE ESTADO:
- "Marcar completo", "sección completa" → {"action": "mark_section_complete"}
- "Desmarcar", "incompleto" → {"action": "unmark_section"}

IMPORTANTE: 
- Si el usuario dice "añadir grupo" o similar, devuelve EXACTAMENTE: {"action": "add_group"}
- Si el usuario menciona un nombre de campo (Empresa, Nombre, Actividad, Horas) seguido de un valor, usa "set_field".
Devuelve SOLO el JSON correspondiente, sin explicaciones.`,
  
  machinery_groups: `Analiza el comando del usuario para la sección MAQUINARIA.

COMANDOS POR NOMBRE DE CAMPO (el usuario dice el nombre del campo seguido del valor):
- "Empresa [valor]" → {"action": "set_field", "field": "company", "value": "valor"}
- "Tipo máquina [valor]", "Tipo [valor]" → {"action": "set_field", "field": "type", "value": "valor"}
- "Actividad [valor]" → {"action": "set_field", "field": "activity", "value": "valor"}
- "Horas [número]" → {"action": "set_field", "field": "hours", "value": número}

COMANDOS DE ESTRUCTURA:
- "Nueva empresa", "añadir grupo", "nuevo grupo", "otra empresa" → {"action": "add_group"}
- "Añadir fila", "nueva máquina", "otra fila" → {"action": "add_row"}
- "Eliminar última fila", "borrar fila" → {"action": "delete_last_row"}
- "Copiar grupo anterior", "duplicar grupo" → {"action": "copy_last_group"}

COMANDOS DE NAVEGACIÓN:
- "Siguiente fila", "fila siguiente", "bajar" → {"action": "next_row"}
- "Fila anterior", "anterior", "subir" → {"action": "prev_row"}
- "Primera fila" → {"action": "first_row"}
- "Última fila" → {"action": "last_row"}
- "Siguiente grupo" → {"action": "next_group"}
- "Grupo anterior" → {"action": "prev_group"}

COMANDOS DE ESTADO:
- "Marcar completo", "sección completa" → {"action": "mark_section_complete"}
- "Desmarcar", "incompleto" → {"action": "unmark_section"}

Devuelve SOLO el JSON correspondiente, sin explicaciones.`,
  
  subcontract_groups: `Analiza el comando del usuario para la sección SUBCONTRATAS.

COMANDOS POR NOMBRE DE CAMPO (el usuario dice el nombre del campo seguido del valor):
- "Empresa [valor]" → {"action": "set_field", "field": "company", "value": "valor"}
- "Número de trabajadores [número]", "Trabajadores [número]" → {"action": "set_field", "field": "totalWorkers", "value": número}
- "Partida [valor]" → {"action": "set_field", "field": "contractedPart", "value": "valor"}
- "Actividad [valor]" → {"action": "set_field", "field": "activity", "value": "valor"}
- "Horas [número]" → {"action": "set_field", "field": "hours", "value": número}

COMANDOS DE ESTRUCTURA:
- "Nueva empresa", "añadir grupo", "nuevo grupo", "otra empresa" → {"action": "add_group"}
- "Añadir fila", "nueva partida", "otra fila" → {"action": "add_row"}
- "Eliminar última fila", "borrar fila" → {"action": "delete_last_row"}
- "Copiar grupo anterior", "duplicar grupo" → {"action": "copy_last_group"}

COMANDOS DE NAVEGACIÓN:
- "Siguiente fila", "fila siguiente", "bajar" → {"action": "next_row"}
- "Fila anterior", "anterior", "subir" → {"action": "prev_row"}
- "Primera fila" → {"action": "first_row"}
- "Última fila" → {"action": "last_row"}
- "Siguiente grupo" → {"action": "next_group"}
- "Grupo anterior" → {"action": "prev_group"}

COMANDOS DE ESTADO:
- "Marcar completo", "sección completa" → {"action": "mark_section_complete"}
- "Desmarcar", "incompleto" → {"action": "unmark_section"}

Devuelve SOLO el JSON correspondiente, sin explicaciones.`,
  
  observations: `Analiza el comando del usuario para la sección OBSERVACIONES E INCIDENCIAS.

COMANDOS:
- Texto libre con observaciones → {"action": "add_text", "observations": "texto organizado"}
- "Marcar completo", "observaciones completas" → {"action": "mark_section_complete"}
- "Desmarcar", "incompleto" → {"action": "unmark_section"}
- "Borrar observaciones", "limpiar" → {"action": "clear_observations"}

Devuelve SOLO el JSON correspondiente, sin explicaciones.`,

  material_groups: `Analiza el comando del usuario para la sección MATERIALES.

COMANDOS POR NOMBRE DE CAMPO:
- "Proveedor [valor]" → {"action": "set_field", "field": "supplier", "value": "valor"}
- "Material [valor]" → {"action": "set_field", "field": "material", "value": "valor"}
- "Cantidad [número]" → {"action": "set_field", "field": "quantity", "value": número}
- "Unidad [valor]" → {"action": "set_field", "field": "unit", "value": "valor"}
- "Albarán [valor]" → {"action": "set_field", "field": "deliveryNote", "value": "valor"}

COMANDOS DE ESTRUCTURA:
- "Nuevo proveedor", "añadir grupo" → {"action": "add_group"}
- "Añadir material", "nueva fila" → {"action": "add_row"}

Devuelve SOLO el JSON correspondiente, sin explicaciones.`
};

const handler = async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { transcription, sectionType, detectSectionSwitch } = await req.json();
    
    if (!transcription) {
      throw new Error('No transcription provided. Audio must be transcribed on the client side.');
    }

    if (!sectionType) {
      throw new Error('Section type is required');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log(`Processing transcription for section: ${sectionType}, detectSectionSwitch: ${detectSectionSwitch}`);

    let systemPrompt = systemPrompts[sectionType] || systemPrompts.observations;
    
    // Si detectSectionSwitch es true, añadimos el prompt de detección de cambio de sección
    if (detectSectionSwitch !== false) {
      systemPrompt = sectionSwitchPrompt + systemPrompt;
    }

    // Use Lovable AI Gateway
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `El usuario dijo: "${transcription}"` }
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const aiContent = data.choices?.[0]?.message?.content || '{}';
    
    console.log('AI Response:', aiContent);

    // Parse JSON from AI response
    let structuredData;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = aiContent.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : aiContent;
      structuredData = JSON.parse(jsonString);
    } catch (e) {
      console.error('Failed to parse AI response as JSON:', e);
      structuredData = { error: 'Failed to parse structured data', rawResponse: aiContent };
    }

    return new Response(
      JSON.stringify({
        structuredData,
        sectionType
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in voice-fill-sections:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(handler);
export default handler;
