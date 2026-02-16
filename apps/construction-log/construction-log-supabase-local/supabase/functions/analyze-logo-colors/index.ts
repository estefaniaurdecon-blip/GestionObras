import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageDataUrl } = await req.json();
    
    if (!imageDataUrl) {
      return new Response(
        JSON.stringify({ error: "imageDataUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Analyzing logo colors with AI...");

    // Call Lovable AI with the image using tool calling for structured output
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
            content: [
              {
                type: "text",
                text: `Analyze this company logo and extract the main brand colors (3-5 colors). 
                
Rules:
- Extract 3-5 most prominent/dominant colors from the logo
- Return colors as hex codes (e.g., #2563eb)
- Order them by prominence (most dominant first)
- Skip pure black (#000000), pure white (#ffffff), or very light grays
- Choose colors suitable for UI elements (buttons, headers, etc.)
- Prefer saturated, vibrant colors over muted ones
- Each color should be distinct from the others`
              },
              {
                type: "image_url",
                image_url: {
                  url: imageDataUrl
                }
              }
            ]
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_brand_colors",
              description: "Extract the main brand colors from a company logo",
              parameters: {
                type: "object",
                properties: {
                  colors: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        hex: { 
                          type: "string",
                          description: "Hex color code (e.g., #2563eb)"
                        },
                        name: { 
                          type: "string",
                          description: "Color name or description (e.g., 'Primary Blue', 'Accent Green')"
                        }
                      },
                      required: ["hex", "name"],
                      additionalProperties: false
                    },
                    minItems: 3,
                    maxItems: 5
                  }
                },
                required: ["colors"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_brand_colors" } },
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your Lovable workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    
    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall || toolCall.function.name !== "extract_brand_colors") {
      console.warn("No tool call found, using fallback");
      return new Response(
        JSON.stringify({ 
          colors: [{ hex: "#2563eb", name: "Default Blue" }],
          brandColor: "#2563eb" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const functionArgs = JSON.parse(toolCall.function.arguments);
    const extractedColors = functionArgs.colors || [];
    
    console.log("AI extracted colors:", extractedColors);
    
    // Validate and filter colors
    const validColors = extractedColors
      .filter((color: any) => {
        const hex = color.hex;
        return hex && /^#[0-9A-Fa-f]{6}$/.test(hex);
      })
      .map((color: any) => ({
        hex: color.hex.toUpperCase(),
        name: color.name || "Brand Color"
      }));
    
    if (validColors.length === 0) {
      console.warn("No valid colors extracted, using default");
      return new Response(
        JSON.stringify({ 
          colors: [{ hex: "#2563eb", name: "Default Blue" }],
          brandColor: "#2563eb" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Valid extracted colors:", validColors);

    // Return all colors + primary (first one)
    return new Response(
      JSON.stringify({ 
        colors: validColors,
        brandColor: validColors[0].hex // Primary color for backward compatibility
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error analyzing logo:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        colors: [{ hex: "#2563eb", name: "Default Blue" }],
        brandColor: "#2563eb" // Fallback color
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
export default handler;

