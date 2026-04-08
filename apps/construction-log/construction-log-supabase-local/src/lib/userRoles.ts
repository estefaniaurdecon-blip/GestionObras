export type CanonicalUserRole = 'super_admin' | 'tenant_admin' | 'usuario';

const ROLE_ALIASES: Record<string, CanonicalUserRole> = {
  super_admin: 'super_admin',
  master: 'super_admin',
  tenant_admin: 'tenant_admin',
  admin: 'tenant_admin',
  site_manager: 'tenant_admin',
  usuario: 'usuario',
  user: 'usuario',
  foreman: 'usuario',
  reader: 'usuario',
  ofi: 'usuario',
};

export function toCanonicalUserRole(role: unknown, fallback: CanonicalUserRole = 'usuario'): CanonicalUserRole {
  const normalized = String(role ?? '').trim().toLowerCase();
  return ROLE_ALIASES[normalized] || fallback;
}

export function getCanonicalUserRoleLabel(role: CanonicalUserRole): string {
  switch (role) {
    case 'super_admin':
      return 'Super Admin';
    case 'tenant_admin':
      return 'Tenant Admin';
    default:
      return 'Usuario';
  }
}

export function getCanonicalUserRoleBadgeClass(role: CanonicalUserRole): string {
  switch (role) {
    case 'super_admin':
      return 'bg-purple-100 text-purple-800 border-purple-300 border-2';
    case 'tenant_admin':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-slate-100 text-slate-800';
  }
}

export function getUserPrimaryCanonicalRole(params: {
  isSuperAdmin?: boolean | null | undefined;
  roles?: unknown;
  roleName?: unknown;
  fallback?: CanonicalUserRole;
}): CanonicalUserRole {
  if (params.isSuperAdmin) return 'super_admin';

  const fallback = params.fallback ?? 'usuario';
  const roleCandidates = Array.isArray(params.roles)
    ? params.roles
    : params.roleName != null
      ? [params.roleName]
      : [];

  for (const candidate of roleCandidates) {
    const normalized = String(candidate ?? '').trim().toLowerCase();
    if (!normalized) continue;
    if (normalized in ROLE_ALIASES) {
      return ROLE_ALIASES[normalized];
    }
  }

  return fallback;
}

export function getAssignableCanonicalRoles(includeSuperAdmin: boolean): CanonicalUserRole[] {
  return includeSuperAdmin
    ? ['super_admin', 'tenant_admin', 'usuario']
    : ['tenant_admin', 'usuario'];
}
