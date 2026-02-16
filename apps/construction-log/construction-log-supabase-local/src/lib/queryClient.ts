import { QueryClient } from "@tanstack/react-query";
import { get, set, del } from "idb-keyval";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

const IDB_KEY = "REACT_QUERY_OFFLINE_CACHE";

// 24 horas en milisegundos
const TWENTY_FOUR_HOURS = 1000 * 60 * 60 * 24;

/**
 * Crea un persister asíncrono usando IndexedDB (idb-keyval)
 * para almacenar el caché de React Query offline
 */
export function createIDBPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        await set(IDB_KEY, client);
      } catch (error) {
        console.warn("[QueryPersist] Error guardando caché:", error);
      }
    },
    restoreClient: async () => {
      try {
        const client = await get<PersistedClient>(IDB_KEY);
        return client;
      } catch (error) {
        console.warn("[QueryPersist] Error restaurando caché:", error);
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        await del(IDB_KEY);
      } catch (error) {
        console.warn("[QueryPersist] Error eliminando caché:", error);
      }
    },
  };
}

/**
 * QueryClient configurado para persistencia offline
 * - gcTime: 24 horas (mantiene datos en memoria)
 * - staleTime: 5 minutos (datos frescos por 5 min)
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: TWENTY_FOUR_HOURS, // Garbage Collection Time: 24h
      staleTime: 1000 * 60 * 5, // Datos considerados frescos por 5 min
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Opciones de persistencia para PersistQueryClientProvider
 */
export const persistOptions = {
  persister: createIDBPersister(),
  maxAge: TWENTY_FOUR_HOURS, // Caché válido por 24 horas
  buster: "v1", // Cambiar para invalidar caché antiguo
};
