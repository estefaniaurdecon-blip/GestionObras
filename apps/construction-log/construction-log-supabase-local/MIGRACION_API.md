# Migración de Supabase a API Propio

## Resumen

Esta aplicación ha sido migrada de Supabase a un backend FastAPI propio (`backend-fastapi`).

## Cambios Realizados

### 1. Variables de Entorno (.env.local)

Actualizado en `.env.local`:
```bash
# Nuevas variables
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_TENANT_ID=1

# Variables antiguas (ya no se usan)
# VITE_SUPABASE_URL=...
# VITE_SUPABASE_PUBLISHABLE_KEY=...
```

### Dependencias

✅ **La dependencia `@supabase/supabase-js` ha sido eliminada** de `package.json`.

El archivo `src/integrations/supabase/client.ts` ahora exporta un "stub" que lanza errores si se intenta usar, manteniendo la compatibilidad con archivos no migrados pero impidiendo el uso accidental de Supabase en runtime.

### 2. Nuevo Cliente API
- **Ubicación**: `src/integrations/api/`
- **Archivos**:
  - `storage.ts` - Almacenamiento de tokens JWT
  - `client.ts` - Cliente HTTP y funciones de API

### 3. Autenticación Migrada
- **Archivos modificados**:
  - `src/contexts/AuthContext.tsx`
  - `src/pages/Auth.tsx`
- **Cambios**:
  - Login con JWT en lugar de sesiones Supabase
  - Soporte para MFA mantenido
  - Token almacenado en localStorage

### 4. Obras/Works Migrado
- **Archivo modificado**: `src/hooks/useWorks.ts`
- **Endpoints usados**:
  - `GET /api/v1/erp/projects` - Listar obras
  - `POST /api/v1/erp/projects` - Crear obra
  - `PATCH /api/v1/erp/projects/{id}` - Actualizar obra
  - `DELETE /api/v1/erp/projects/{id}` - Eliminar obra

### 5. Funciones Desactivadas (Pendientes de Migración)

Las siguientes funciones han sido desactivadas temporalmente:

| Función | Motivo |
|---------|--------|
| Inventario (`work_inventory`) | Tabla no disponible en nuevo backend |
| Tareas de calendario (`check-calendar-tasks`) | Edge function no migrada |
| Análisis de imágenes con IA | Edge function no migrada |
| Chat de construcción | Edge function no migrada |
| Actualización de contraseña | Requiere implementación en backend |
| Registro de nuevos usuarios | Requiere implementación en backend |
| Clonación de entradas de residuos | Tabla no disponible |
| Verificación de duplicados en backend | Query no migrada |

### 6. Endpoints del Backend Usados

#### Autenticación
- `POST /api/v1/auth/login` - Login (form-urlencoded)
- `POST /api/v1/auth/mfa/verify` - Verificación MFA
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/users/me` - Info del usuario actual

#### ERP (Obras)
- `GET /api/v1/erp/projects` - Listar proyectos
- `GET /api/v1/erp/projects/{id}` - Obtener proyecto
- `POST /api/v1/erp/projects` - Crear proyecto
- `PATCH /api/v1/erp/projects/{id}` - Actualizar proyecto
- `DELETE /api/v1/erp/projects/{id}` - Eliminar proyecto

## Mapeo de Tipos

### Usuario
**Antes (Supabase)**:
```typescript
interface User {
  id: string;
  email: string;
  user_metadata: { full_name?: string };
}
```

**Después (API)**:
```typescript
interface ApiUser {
  id: number;
  email: string;
  full_name?: string;
  is_active: boolean;
  tenant_id?: number;
  roles?: string[];
}
```

### Obra/Work
**Antes (Supabase)**:
```typescript
interface Work {
  id: string;
  number: string;
  name: string;
  // ...
}
```

**Después (API)**:
```typescript
interface ApiProject {
  id: number;
  code?: string;
  name: string;
  // ...
}
```

Nota: Se mantiene conversión entre `number` (frontend) y `code` (backend).

## Verificación

### Compilar y ejecutar
```bash
cd apps/construction-log
npm run install:app
npm run tsc
npm run dev
```

### Verificar funcionamiento
1. Login funciona y guarda token
2. Listado de obras carga desde `/api/v1/erp/projects`
3. Crear/editar/eliminar obras funciona

### DevTools Network
- 0 requests a `*.supabase.co`
- Requests solo a `http://127.0.0.1:8000/api/v1/*`

## Notas Importantes

### CORS
Si el backend FastAPI devuelve errores de CORS, asegúrate de que esté configurado para permitir:
- Origin: `http://localhost:5173` (o el puerto de Vite)
- Headers: `Authorization`, `Content-Type`, `X-Tenant-Id`

### Tenant ID
El header `X-Tenant-Id` se envía automáticamente si está configurado en `VITE_TENANT_ID`.

### Token JWT
El token se almacena en localStorage bajo la clave `api_access_token`.

## Archivos Modificados

1. `src/contexts/AuthContext.tsx` - Migrado
2. `src/pages/Auth.tsx` - Migrado
3. `src/hooks/useWorks.ts` - Migrado
4. `src/pages/Index.tsx` - Desactivadas funciones no migradas
5. `src/pages/UpdatePassword.tsx` - Desactivado
6. `src/integrations/api/client.ts` - Nuevo
7. `src/integrations/api/storage.ts` - Nuevo
8. `.env.local` - Actualizado

## Archivos Pendientes de Migración

- `src/hooks/useWorkReports.ts` - Pendiente
- `src/hooks/useOrganization.ts` - Pendiente
- `src/hooks/useUsers.ts` - Pendiente
- `src/hooks/useMessages.ts` - Pendiente
- `src/hooks/useInventoryMovements.ts` - Pendiente
- Y otros hooks que usan Supabase...

## Contacto

Para dudas sobre la migración, revisa el código en `src/integrations/api/` o consulta la documentación del backend en `backend-fastapi/`.
