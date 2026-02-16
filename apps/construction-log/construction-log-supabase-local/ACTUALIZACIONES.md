# Sistema de Actualizaciones Automáticas

Este proyecto incluye un sistema completo de actualizaciones automáticas para Windows, Android y Web.

## Características

- ✅ Verificación automática de actualizaciones al iniciar la aplicación
- ✅ Notificaciones cuando hay nuevas versiones disponibles
- ✅ Descarga e instalación simplificada
- ✅ Soporte para actualizaciones obligatorias
- ✅ Notas de versión para cada actualización
- ✅ Panel de administración para publicar actualizaciones

## Cómo Funciona

### Para Usuarios

1. **Verificación automática**: La aplicación verifica actualizaciones 5 segundos después de iniciar
2. **Notificación**: Si hay una actualización, aparece un diálogo con los detalles
3. **Descarga**: El usuario puede descargar e instalar con un clic
4. **Actualizaciones obligatorias**: Algunas actualizaciones deben instalarse para continuar

### Para Administradores

1. **Incrementar versión**: 
   ```bash
   node scripts/version-bump.cjs [patch|minor|major]
   ```
   - `patch`: 2.0.0 → 2.0.1 (correcciones de errores)
   - `minor`: 2.0.0 → 2.1.0 (nuevas características)
   - `major`: 2.0.0 → 3.0.0 (cambios importantes)

2. **Construir la aplicación**:
   - **Windows**: `npm run build-electron`
   - **Android**: `npx cap build android`

3. **Publicar actualización**:
   - Inicia sesión como administrador
   - Ve a la pestaña "Actualizaciones"
   - Completa el formulario:
     - Versión (ej: 2.0.1)
     - Plataforma (Windows/Android/Web)
     - Archivo de instalación (.exe o .apk)
     - Notas de la versión
     - Marcar si es obligatoria
   - Haz clic en "Subir y publicar actualización"

4. **Verificación**: Los usuarios recibirán la notificación en su próximo inicio

## Estructura

### Base de Datos
- **Tabla `app_versions`**: Almacena información de cada versión publicada
  - version (texto único)
  - platform (windows/android/web)
  - file_url (URL del archivo en Supabase Storage)
  - file_size (tamaño en bytes)
  - release_notes (notas de la versión)
  - is_mandatory (si es obligatoria)
  - created_at, published_by

### Storage
- **Bucket `app-updates`**: Almacena archivos ejecutables y APKs
  - `/windows/` - Ejecutables .exe
  - `/android/` - Archivos .apk
  - `/web/` - (Opcional) Assets para web

### Edge Functions
- **check-updates**: Verifica si hay actualizaciones disponibles
  - Input: currentVersion, platform
  - Output: updateAvailable, version, fileUrl, releaseNotes, etc.

- **publish-update**: Publica una nueva versión (solo admins)
  - Input: version, platform, fileName, releaseNotes, isMandatory
  - Output: success, version details

### Componentes Frontend
- **useAppUpdates** (hook): Lógica para verificar y descargar actualizaciones
- **UpdateNotification**: Diálogo de notificación de actualización
- **UpdateManager**: Panel de administración para publicar actualizaciones

## Seguridad

- Solo administradores pueden publicar actualizaciones
- Los archivos se almacenan en Supabase Storage público (necesario para descarga)
- RLS policies protegen la tabla app_versions
- Verificación de roles en edge functions

## Versionado Semántico

Este proyecto usa [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0): Cambios incompatibles en la API
- **MINOR** (0.X.0): Nueva funcionalidad compatible con versiones anteriores
- **PATCH** (0.0.X): Correcciones de errores compatibles

## Ejemplo de Flujo Completo

1. **Desarrollador hace cambios**
2. **Incrementa versión**: `node scripts/version-bump.cjs patch`
3. **Construye**: `npm run build-electron`
4. **Sube a actualizaciones**: Va a panel de admin → Actualizaciones
5. **Completa formulario**: Versión 2.0.1, sube .exe, añade notas
6. **Publica actualización**
7. **Usuarios reciben notificación** al abrir la app
8. **Descargan e instalan** con un clic

## Notas Importantes

- La versión en `package.json` y `useAppUpdates.ts` debe coincidir
- Los archivos deben estar correctamente nombrados en Storage
- Las actualizaciones obligatorias bloquean el acceso hasta instalar
- Siempre prueba las actualizaciones en un entorno de desarrollo primero

## Troubleshooting

**No aparece la notificación de actualización:**
- Verifica que la versión publicada sea mayor a la actual
- Revisa los logs de la edge function `check-updates`
- Asegúrate de que el archivo existe en Storage

**Error al descargar:**
- Verifica que el bucket `app-updates` sea público
- Comprueba que la URL del archivo sea correcta
- Revisa los permisos de storage

**No se puede publicar:**
- Verifica que el usuario sea administrador
- Comprueba que el archivo se haya subido correctamente
- Revisa los logs de `publish-update`
