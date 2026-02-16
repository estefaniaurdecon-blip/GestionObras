import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CompanyOccurrence {
  name: string;
  sources: string[];
  count: number;
  normalizedName: string;
}

interface SimilarGroup {
  canonicalName: string;
  variations: CompanyOccurrence[];
  totalCount: number;
}

// Normalize company name for comparison
function normalizeCompanyName(name: string): string {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .trim()
    // Remove common suffixes
    .replace(/,?\\s*(s\\.?l\\.?|s\\.?a\\.?|s\\.?l\\.?u\\.?|sociedad limitada|sociedad anónima)\\.?$/gi, '')
    // Replace multiple spaces with single space
    .replace(/\s+/g, ' ')
    // Remove special characters but keep letters and numbers
    .replace(/[^a-z0-9\\sáéíóúñü]/gi, '')
    .trim();
}

// Calculate Levenshtein distance between two strings
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

// Calculate similarity between two strings (0-1)
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;
  
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  
  const distance = levenshteinDistance(str1, str2);
  return (maxLen - distance) / maxLen;
}

// Check if two company names have different distinguishing suffixes
// This prevents merging "Construcciones Metalicas Towers" with "Construcciones Metalicas Muñoz"
function hasDifferentDistinguishingSuffix(name1: string, name2: string): boolean {
  const words1 = name1.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const words2 = name2.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  
  if (words1.length < 2 || words2.length < 2) return false;
  
  // Find common prefix words
  let commonPrefixCount = 0;
  for (let i = 0; i < Math.min(words1.length, words2.length); i++) {
    if (words1[i] === words2[i]) {
      commonPrefixCount++;
    } else {
      break;
    }
  }
  
  // If they share a common prefix but have different suffix words, they're different companies
  if (commonPrefixCount >= 1 && commonPrefixCount < Math.max(words1.length, words2.length)) {
    const suffix1 = words1.slice(commonPrefixCount).join(' ');
    const suffix2 = words2.slice(commonPrefixCount).join(' ');
    
    // If suffixes are substantially different (not just typos), consider them different companies
    if (suffix1 && suffix2 && suffix1 !== suffix2) {
      const suffixSimilarity = calculateSimilarity(suffix1, suffix2);
      // If suffixes are less than 70% similar, they're likely different companies
      if (suffixSimilarity < 0.7) {
        return true;
      }
    }
  }
  
  return false;
}

// Group similar companies together
function groupSimilarCompanies(companies: CompanyOccurrence[], threshold: number = 0.8): SimilarGroup[] {
  const groups: SimilarGroup[] = [];
  const used = new Set<string>();
  
  // Sort by count descending so the most used name becomes canonical
  const sortedCompanies = [...companies].sort((a, b) => b.count - a.count);
  
  for (const company of sortedCompanies) {
    if (used.has(company.name)) continue;
    
    const group: SimilarGroup = {
      canonicalName: company.name,
      variations: [company],
      totalCount: company.count
    };
    
    used.add(company.name);
    
    // Find similar companies
    for (const other of sortedCompanies) {
      if (used.has(other.name)) continue;
      
      // Check if these companies have different distinguishing suffixes
      if (hasDifferentDistinguishingSuffix(company.name, other.name)) {
        continue; // Don't group companies with different distinguishing names
      }
      
      const similarity = calculateSimilarity(
        company.normalizedName,
        other.normalizedName
      );
      
      if (similarity >= threshold) {
        group.variations.push(other);
        group.totalCount += other.count;
        used.add(other.name);
      }
    }
    
    // Only add groups with more than one variation (actual duplicates)
    if (group.variations.length > 1) {
      groups.push(group);
    }
  }
  
  return groups.sort((a, b) => b.totalCount - a.totalCount);
}

const handler = async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is admin
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return new Response(
        JSON.stringify({ error: 'User has no organization' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { action, updates, threshold = 0.7 } = body;

    if (action === 'analyze') {
      // Fetch all company names from different sources
      const { data: workReports, error: wrError } = await supabase
        .from('work_reports')
        .select('id, subcontract_groups, material_groups, machinery_groups, work_groups')
        .eq('organization_id', profile.organization_id);

      if (wrError) throw wrError;

      const { data: rentalMachinery, error: rmError } = await supabase
        .from('work_rental_machinery')
        .select('id, provider')
        .eq('organization_id', profile.organization_id);

      if (rmError) throw rmError;

      const { data: rentalAssignments, error: raError } = await supabase
        .from('work_rental_machinery_assignments')
        .select('id, company_name')
        .eq('organization_id', profile.organization_id);

      if (raError) throw raError;

      const { data: portfolio, error: pError } = await supabase
        .from('company_portfolio')
        .select('id, company_name')
        .eq('organization_id', profile.organization_id);

      if (pError) throw pError;

      // Fetch inventory suppliers
      const { data: inventoryItems, error: invError } = await supabase
        .from('work_inventory')
        .select('id, last_supplier')
        .eq('organization_id', profile.organization_id)
        .not('last_supplier', 'is', null);

      if (invError) throw invError;

      // Fetch pending delivery notes suppliers
      const { data: pendingNotes, error: pnError } = await supabase
        .from('pending_delivery_notes')
        .select('id, supplier')
        .eq('organization_id', profile.organization_id);

      if (pnError) throw pnError;

      // Fetch inventory movements suppliers
      const { data: movements, error: movError } = await supabase
        .from('inventory_movements')
        .select('id, supplier')
        .eq('organization_id', profile.organization_id)
        .not('supplier', 'is', null);

      if (movError) throw movError;

      // Collect all company names with their sources
      const companyMap = new Map<string, { sources: Set<string>; count: number }>();

      const addCompany = (name: string | null | undefined, source: string) => {
        if (!name || typeof name !== 'string' || name.trim() === '') return;
        const trimmed = name.trim();
        
        if (!companyMap.has(trimmed)) {
          companyMap.set(trimmed, { sources: new Set(), count: 0 });
        }
        const entry = companyMap.get(trimmed)!;
        entry.sources.add(source);
        entry.count++;
      };

      // Process work reports
      for (const report of workReports || []) {
        // Subcontracts
        if (Array.isArray(report.subcontract_groups)) {
          for (const group of report.subcontract_groups) {
            addCompany(group?.company, 'subcontrata');
          }
        }
        
        // Materials (suppliers)
        if (Array.isArray(report.material_groups)) {
          for (const group of report.material_groups) {
            addCompany(group?.supplier, 'proveedor_material');
          }
        }
        
        // Machinery
        if (Array.isArray(report.machinery_groups)) {
          for (const group of report.machinery_groups) {
            addCompany(group?.company, 'maquinaria');
          }
        }
        
        // Work groups
        if (Array.isArray(report.work_groups)) {
          for (const group of report.work_groups) {
            addCompany(group?.company, 'mano_obra');
          }
        }
      }

      // Process rental machinery
      for (const rental of rentalMachinery || []) {
        addCompany(rental.provider, 'alquiler');
      }

      // Process rental assignments
      for (const assignment of rentalAssignments || []) {
        addCompany(assignment.company_name, 'asignacion_alquiler');
      }

      // Process portfolio
      for (const company of portfolio || []) {
        addCompany(company.company_name, 'cartera');
      }

      // Process inventory items
      for (const item of inventoryItems || []) {
        addCompany(item.last_supplier, 'inventario');
      }

      // Process pending delivery notes
      for (const note of pendingNotes || []) {
        addCompany(note.supplier, 'albaran_pendiente');
      }

      // Process inventory movements
      for (const movement of movements || []) {
        addCompany(movement.supplier, 'movimiento_inventario');
      }

      // Convert to array for processing
      const companies: CompanyOccurrence[] = Array.from(companyMap.entries()).map(([name, data]) => ({
        name,
        sources: Array.from(data.sources),
        count: data.count,
        normalizedName: normalizeCompanyName(name)
      }));

      // Group similar companies
      const duplicateGroups = groupSimilarCompanies(companies, threshold);

      return new Response(
        JSON.stringify({
          success: true,
          totalCompanies: companies.length,
          duplicateGroups: duplicateGroups.length,
          groups: duplicateGroups
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'apply') {
      // Apply the standardization updates
      // updates format: [{ oldName: string, newName: string }]
      if (!Array.isArray(updates) || updates.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No updates provided' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let totalUpdated = 0;

      for (const update of updates) {
        const { oldName, newName } = update;
        if (!oldName || !newName || oldName === newName) continue;

        // Update work_reports subcontract_groups
        const { data: subReports } = await supabase
          .from('work_reports')
          .select('id, subcontract_groups')
          .eq('organization_id', profile.organization_id)
          .not('subcontract_groups', 'is', null);

        for (const report of subReports || []) {
          if (!Array.isArray(report.subcontract_groups)) continue;
          
          let modified = false;
          const updatedGroups = report.subcontract_groups.map((group: any) => {
            if (group?.company === oldName) {
              modified = true;
              return { ...group, company: newName };
            }
            return group;
          });
          
          if (modified) {
            await supabase
              .from('work_reports')
              .update({ subcontract_groups: updatedGroups })
              .eq('id', report.id);
            totalUpdated++;
          }
        }

        // Update work_reports material_groups (supplier field)
        const { data: matReports } = await supabase
          .from('work_reports')
          .select('id, material_groups')
          .eq('organization_id', profile.organization_id)
          .not('material_groups', 'is', null);

        for (const report of matReports || []) {
          if (!Array.isArray(report.material_groups)) continue;
          
          let modified = false;
          const updatedGroups = report.material_groups.map((group: any) => {
            if (group?.supplier === oldName) {
              modified = true;
              return { ...group, supplier: newName };
            }
            return group;
          });
          
          if (modified) {
            await supabase
              .from('work_reports')
              .update({ material_groups: updatedGroups })
              .eq('id', report.id);
            totalUpdated++;
          }
        }

        // Update work_reports machinery_groups
        const { data: machReports } = await supabase
          .from('work_reports')
          .select('id, machinery_groups')
          .eq('organization_id', profile.organization_id)
          .not('machinery_groups', 'is', null);

        for (const report of machReports || []) {
          if (!Array.isArray(report.machinery_groups)) continue;
          
          let modified = false;
          const updatedGroups = report.machinery_groups.map((group: any) => {
            if (group?.company === oldName) {
              modified = true;
              return { ...group, company: newName };
            }
            return group;
          });
          
          if (modified) {
            await supabase
              .from('work_reports')
              .update({ machinery_groups: updatedGroups })
              .eq('id', report.id);
            totalUpdated++;
          }
        }

        // Update work_reports work_groups
        const { data: workGroupReports } = await supabase
          .from('work_reports')
          .select('id, work_groups')
          .eq('organization_id', profile.organization_id)
          .not('work_groups', 'is', null);

        for (const report of workGroupReports || []) {
          if (!Array.isArray(report.work_groups)) continue;
          
          let modified = false;
          const updatedGroups = report.work_groups.map((group: any) => {
            if (group?.company === oldName) {
              modified = true;
              return { ...group, company: newName };
            }
            return group;
          });
          
          if (modified) {
            await supabase
              .from('work_reports')
              .update({ work_groups: updatedGroups })
              .eq('id', report.id);
            totalUpdated++;
          }
        }

        // Update work_rental_machinery provider
        const { count: rentalCount } = await supabase
          .from('work_rental_machinery')
          .update({ provider: newName })
          .eq('organization_id', profile.organization_id)
          .eq('provider', oldName);
        
        totalUpdated += rentalCount || 0;

        // Update work_rental_machinery_assignments company_name
        const { count: assignmentCount } = await supabase
          .from('work_rental_machinery_assignments')
          .update({ company_name: newName })
          .eq('organization_id', profile.organization_id)
          .eq('company_name', oldName);
        
        totalUpdated += assignmentCount || 0;

        // Update company_portfolio
        const { count: portfolioCount } = await supabase
          .from('company_portfolio')
          .update({ company_name: newName })
          .eq('organization_id', profile.organization_id)
          .eq('company_name', oldName);
        
        totalUpdated += portfolioCount || 0;

        // Update work_inventory last_supplier
        const { count: inventoryCount } = await supabase
          .from('work_inventory')
          .update({ last_supplier: newName })
          .eq('organization_id', profile.organization_id)
          .eq('last_supplier', oldName);
        
        totalUpdated += inventoryCount || 0;

        // Update pending_delivery_notes supplier
        const { count: pendingCount } = await supabase
          .from('pending_delivery_notes')
          .update({ supplier: newName })
          .eq('organization_id', profile.organization_id)
          .eq('supplier', oldName);
        
        totalUpdated += pendingCount || 0;

        // Update inventory_movements supplier
        const { count: movementsCount } = await supabase
          .from('inventory_movements')
          .update({ supplier: newName })
          .eq('organization_id', profile.organization_id)
          .eq('supplier', oldName);
        
        totalUpdated += movementsCount || 0;
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Se actualizaron ${totalUpdated} registros`,
          updatedCount: totalUpdated
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use "analyze" or "apply"' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in standardize-companies:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
export default handler;

