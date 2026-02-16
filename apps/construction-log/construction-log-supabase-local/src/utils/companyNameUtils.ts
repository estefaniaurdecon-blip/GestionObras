/**
 * Utilidades para normalización y comparación de nombres de empresas
 * para evitar duplicados por diferencias menores
 */

/**
 * Normaliza un nombre de empresa eliminando caracteres especiales,
 * espacios múltiples y convirtiendo a minúsculas
 */
export const normalizeCompanyName = (name: string): string => {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .trim()
    // Reemplazar múltiples espacios por uno solo
    .replace(/\s+/g, ' ')
    // Eliminar caracteres especiales comunes pero mantener letras y números
    .replace(/[^a-z0-9\sáéíóúñü]/gi, '')
    // Trim final por si quedaron espacios
    .trim();
};

/**
 * Calcula la similitud entre dos strings usando el algoritmo de Levenshtein
 * Retorna un valor entre 0 (sin similitud) y 1 (idénticos)
 */
export const calculateSimilarity = (str1: string, str2: string): number => {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1;

  // Calcular distancia de Levenshtein
  const editDistance = getEditDistance(longer, shorter);
  
  // Convertir a porcentaje de similitud
  return (longer.length - editDistance) / longer.length;
};

/**
 * Calcula la distancia de edición (Levenshtein) entre dos strings
 */
const getEditDistance = (str1: string, str2: string): number => {
  const costs: number[] = [];
  
  for (let i = 0; i <= str1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= str2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (str1.charAt(i - 1) !== str2.charAt(j - 1)) {
          newValue = Math.min(
            Math.min(newValue, lastValue),
            costs[j]
          ) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) {
      costs[str2.length] = lastValue;
    }
  }
  
  return costs[str2.length];
};

/**
 * Encuentra empresas similares en una lista basándose en un umbral de similitud
 * @param targetName - Nombre a buscar
 * @param companyList - Lista de nombres de empresas existentes
 * @param threshold - Umbral de similitud (0-1), por defecto 0.5 (50%)
 * @returns Array de empresas similares ordenadas por similitud descendente
 */
export const findSimilarCompanies = (
  targetName: string,
  companyList: string[],
  threshold: number = 0.5
): Array<{ name: string; similarity: number }> => {
  if (!targetName || !companyList || companyList.length === 0) {
    return [];
  }

  const normalizedTarget = normalizeCompanyName(targetName);
  
  const similarCompanies = companyList
    .map(company => {
      const normalizedCompany = normalizeCompanyName(company);
      const similarity = calculateSimilarity(normalizedTarget, normalizedCompany);
      
      return {
        name: company,
        similarity
      };
    })
    .filter(item => item.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);

  return similarCompanies;
};

/**
 * Verifica si un nombre de empresa ya existe (considerando similitud)
 * y retorna el nombre existente más similar si lo encuentra
 * @param targetName - Nombre a verificar
 * @param companyList - Lista de nombres de empresas existentes
 * @param threshold - Umbral de similitud (0-1), por defecto 0.5 (50%)
 * @returns El nombre existente más similar o null si no hay coincidencias
 */
export const findExistingCompany = (
  targetName: string,
  companyList: string[],
  threshold: number = 0.5
): string | null => {
  const similar = findSimilarCompanies(targetName, companyList, threshold);
  return similar.length > 0 ? similar[0].name : null;
};

/**
 * Obtiene el mejor nombre de empresa a usar, priorizando coincidencias existentes
 * @param targetName - Nombre ingresado por el usuario
 * @param companyList - Lista de nombres de empresas existentes
 * @param threshold - Umbral de similitud (0-1), por defecto 0.5 (50%)
 * @returns El nombre de empresa a usar (existente o nuevo)
 */
export const getBestCompanyName = (
  targetName: string,
  companyList: string[],
  threshold: number = 0.5
): string => {
  const existing = findExistingCompany(targetName, companyList, threshold);
  return existing || targetName.trim();
};
