# 🚨 ACCIONES URGENTES DE SEGURIDAD

## ✅ COMPLETADO - Fuga de Datos Entre Organizaciones

### Cambios Implementados:

1. **Storage keys ahora incluyen `organization_id`**:
   ```typescript
   // Antes: work_reports_cache:userId
   // Ahora: work_reports_cache:userId:organizationId
   ```

2. **Filtros de seguridad en caché**:
   - `saveToCache()`: Solo guarda reportes de la organización actual
   - `loadInitialCache()`: Solo carga reportes de la organización actual
   - Ambas funciones verifican `organization_id` antes de procesar

3. **Limpieza automática de caché contaminado**:
   - Componente `CacheCleaner` añadido a App.tsx
   - Se ejecuta una vez por usuario
   - Elimina todas las claves de caché antiguas sin `organization_id`

### Próximos Pasos:
1. **Probar exhaustivamente**:
   - ✅ Iniciar sesión con usuario de Basic 2
   - ✅ Verificar que NO aparezcan partes de Urdecon
   - ✅ Crear nuevo parte y verificar que se guarde correctamente
   - ✅ Cerrar sesión e iniciar con otro usuario de otra organización
   - ✅ Verificar aislamiento total

2. **Desplegar en producción**:
   - Generar nueva APK con los cambios
   - Forzar actualización en todos los dispositivos
   - Monitorear logs para confirmar limpieza de caché

---

## ❌ PENDIENTE - Edge Functions Sin Autenticación

### Problema:
7 edge functions permiten llamadas sin JWT, exponiendo funcionalidad crítica.

### Solución:

**PASO 1**: Editar `supabase/config.toml`:

```toml
# IMPORTANTE: Cambiar TODAS estas funciones a verify_jwt = true

[functions.check-updates]
verify_jwt = true  # ✅ Solo usuarios autenticados pueden verificar actualizaciones

[functions.publish-update]
verify_jwt = true  # ✅ CRÍTICO - Solo admins pueden publicar actualizaciones

[functions.analyze-invoice]
verify_jwt = true  # ✅ Solo usuarios autenticados pueden analizar facturas

[functions.analyze-inventory]
verify_jwt = true  # ✅ Solo usuarios autenticados pueden analizar inventario

[functions.construction-chat]
verify_jwt = true  # ✅ Solo usuarios autenticados pueden usar el chat

[functions.auto-duplicate-rental-machinery]
verify_jwt = true  # ✅ Solo usuarios autenticados pueden duplicar maquinaria

[functions.clean-inventory]
verify_jwt = true  # ✅ Solo usuarios autenticados pueden limpiar inventario
```

**PASO 2**: Actualizar código de edge functions para verificar roles:

Ejemplo para `publish-update/index.ts`:
```typescript
// Al inicio de la función, después de obtener el usuario:
const { data: { user }, error: authError } = await supabase.auth.getUser(
  req.headers.get('Authorization')?.replace('Bearer ', '') || ''
);

if (authError || !user) {
  return new Response(
    JSON.stringify({ error: 'No autorizado' }),
    { status: 401, headers: corsHeaders }
  );
}

// Verificar rol de admin/master
const { data: roles, error: rolesError } = await supabase
  .from('user_roles')
  .select('role')
  .eq('user_id', user.id);

const hasAdminRole = roles?.some(r => 
  r.role === 'admin' || r.role === 'master'
);

if (!hasAdminRole) {
  return new Response(
    JSON.stringify({ error: 'Requiere rol de administrador' }),
    { status: 403, headers: corsHeaders }
  );
}
```

**PASO 3**: Probar cada función:
```bash
# Probar sin autenticación (debe fallar):
curl https://[proyecto].supabase.co/functions/v1/publish-update

# Probar con usuario normal (debe fallar):
curl -H "Authorization: Bearer [token-usuario-normal]" ...

# Probar con admin (debe funcionar):
curl -H "Authorization: Bearer [token-admin]" ...
```

---

## ❌ PENDIENTE - Protección de Contraseñas

### Pasos para Habilitar:

1. **Abrir Lovable Cloud Dashboard**:
   ```
   Click en "View Backend" en el proyecto
   ```

2. **Ir a Auth Settings**:
   - Navegar a: Authentication → Settings → Password Settings

3. **Configurar Políticas**:
   ```
   ✅ Enable Leaked Password Protection
   ✅ Minimum password length: 12 caracteres
   ✅ Require uppercase letters
   ✅ Require lowercase letters
   ✅ Require numbers
   ✅ Require special characters
   ```

4. **Guardar cambios** y probar registro de nuevos usuarios

---

## ❌ PENDIENTE - Auditoría de Accesos

### Implementación Recomendada:

**Crear tabla de audit_logs**:
```sql
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  organization_id UUID REFERENCES public.organizations(id),
  action TEXT NOT NULL, -- 'view', 'create', 'update', 'delete'
  resource_type TEXT NOT NULL, -- 'work_report', 'inventory', etc.
  resource_id UUID,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at);
CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id, created_at);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- RLS: Solo admins pueden ver logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
ON public.audit_logs
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND organization_id = current_user_organization()
);
```

**Función helper para registrar acciones**:
```typescript
// src/utils/auditLog.ts
export async function logAction(
  action: 'view' | 'create' | 'update' | 'delete',
  resourceType: string,
  resourceId: string
) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', (await supabase.auth.getUser()).data.user?.id)
    .single();

  await supabase.from('audit_logs').insert({
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    organization_id: profile?.organization_id,
  });
}
```

**Uso en componentes críticos**:
```typescript
// Al ver un parte de trabajo:
await logAction('view', 'work_report', reportId);

// Al eliminar un usuario:
await logAction('delete', 'user', userId);

// Al aprobar un parte:
await logAction('update', 'work_report', reportId);
```

---

## 📊 PRIORIDADES Y TIMELINE

### Semana 1 (URGENTE):
- ✅ **DÍA 1**: Fuga de datos organizaciones - COMPLETADO
- ❌ **DÍA 2**: Habilitar JWT en edge functions
- ❌ **DÍA 3**: Habilitar protección contraseñas
- ❌ **DÍA 4**: Probar y validar cambios
- ❌ **DÍA 5**: Desplegar APK actualizada

### Semana 2:
- ❌ Implementar audit_logs
- ❌ Mover extensiones de public schema
- ❌ Eliminar columna role legacy

### Semana 3:
- ❌ Rate limiting en edge functions
- ❌ Implementar 2FA (opcional)
- ❌ Penetration testing

---

## 🔍 VERIFICACIÓN DE SEGURIDAD

### Checklist Post-Implementación:

#### Fuga de Datos:
- [ ] Usuario A no ve partes de organización B
- [ ] Caché limpiado automáticamente
- [ ] Realtime solo recibe datos de org actual
- [ ] Storage keys incluyen organization_id
- [ ] Probado en múltiples dispositivos

#### Edge Functions:
- [ ] Todas las funciones requieren JWT
- [ ] publish-update solo permite admins
- [ ] Funciones AI verifican autenticación
- [ ] Probado con/sin token

#### Contraseñas:
- [ ] No se aceptan contraseñas débiles
- [ ] No se aceptan contraseñas filtradas
- [ ] Mínimo 12 caracteres requerido
- [ ] Usuarios existentes notificados

#### Audit Logs:
- [ ] Todas las acciones críticas se registran
- [ ] Solo admins pueden ver logs
- [ ] Logs incluyen IP y timestamp
- [ ] Retención de logs configurada

---

## 📞 CONTACTO Y SOPORTE

**En caso de detectar nuevas vulnerabilidades**:
1. Documentar detalladamente el problema
2. Reproducir en ambiente de desarrollo
3. No exponer la vulnerabilidad públicamente
4. Implementar fix y verificar
5. Desplegar en producción urgentemente

**Recursos**:
- [Supabase Security Best Practices](https://supabase.com/docs/guides/auth/security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [RGPD/GDPR Guidelines](https://gdpr.eu/)
