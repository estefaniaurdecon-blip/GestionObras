import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/contexts/AuthContext';
import { storage } from '@/utils/storage';

/**
 * One-time security cleanup for legacy cache keys that were not tenant-scoped.
 */
export const CacheCleaner = () => {
  const INITIAL_NATIVE_CACHE_CLEANUP_DELAY_MS = 30000;
  const { user } = useAuth();

  useEffect(() => {
    const cleanLegacyCache = async () => {
      if (!user) return;

      const cleanupFlagKey = `cache_cleaned_v2:${user.id}`;

      try {
        const alreadyCleaned = await storage.getItem(cleanupFlagKey);
        if (alreadyCleaned === 'true') {
          console.log('[CacheCleaner] Cache already cleaned for this user');
          return;
        }

        const legacyKeys = [
          `work_reports_cache:${user.id}`,
          `work_reports_pending_sync:${user.id}`,
          `work_reports_last_sync:${user.id}`,
          'work_reports_cache',
          'work_reports_pending_sync',
          'work_reports_last_sync',
        ];

        const storedKeys = new Set(await storage.keys());
        const keysToRemove = legacyKeys.filter(
          (key) =>
            storedKeys.has(key) ||
            storedKeys.has(`${key}__chunked`) ||
            storedKeys.has(`${key}__chunk_count`),
        );

        if (keysToRemove.length === 0) {
          await storage.setItem(cleanupFlagKey, 'true');
          return;
        }

        console.log('[CacheCleaner] Starting deferred legacy cache cleanup');

        for (const key of keysToRemove) {
          try {
            await storage.removeItem(key);
          } catch (error) {
            console.warn(`[CacheCleaner] Error removing ${key}:`, error);
          }

          if (Capacitor.isNativePlatform()) {
            await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
          }
        }

        await storage.setItem(cleanupFlagKey, 'true');
        console.log('[CacheCleaner] Legacy cache cleanup completed');
      } catch (error) {
        console.error('[CacheCleaner] Error during cleanup:', error);
      }
    };

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;

    const runCleanup = () => {
      if (cancelled) return;
      void cleanLegacyCache();
    };

    if (Capacitor.isNativePlatform()) {
      timeoutId = globalThis.setTimeout(() => {
        if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
          idleId = window.requestIdleCallback(runCleanup, { timeout: 4000 });
          return;
        }

        runCleanup();
      }, INITIAL_NATIVE_CACHE_CLEANUP_DELAY_MS);
    } else {
      runCleanup();
    }

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
      if (idleId !== null && typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [user]);

  return null;
};
