/**
 * Compatibility shim for legacy code paths that still reference `supabase`.
 * Do not use for new code. Migrate callers to `@/integrations/api/client`.
 */
const buildLegacySupabaseProxy = (path = 'supabase'): any => {
  const throwRemovedError = () => {
    throw new Error(
      `[legacy-supabase-removed] Access to "${path}" is no longer supported. ` +
        'Migrate this flow to integrations/api/client.'
    );
  };

  const callable = (() => {
    throwRemovedError();
  }) as unknown as (...args: unknown[]) => unknown;

  return new Proxy(callable, {
    get: (_target, prop) => {
      if (prop === 'then') return undefined;
      if (prop === Symbol.toStringTag) return 'LegacySupabaseRemoved';
      return buildLegacySupabaseProxy(`${path}.${String(prop)}`);
    },
    apply: () => {
      throwRemovedError();
      return undefined;
    },
    construct: () => {
      throwRemovedError();
      return {};
    },
  });
};

export const supabase = buildLegacySupabaseProxy();
