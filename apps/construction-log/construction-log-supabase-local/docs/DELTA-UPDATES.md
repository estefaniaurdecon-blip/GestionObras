# Delta Updates (Actualizaciones Diferenciales)

## Qué son los Delta Updates

Las actualizaciones diferenciales permiten descargar solo las partes de la aplicación que han cambiado, en lugar de descargar el instalador completo. Esto puede reducir el tamaño de descarga hasta un **90%** en actualizaciones menores.

## Cómo funcionan

1. **Al compilar**: electron-builder genera un archivo `.blockmap` junto con el instalador
2. **Al actualizar**: El cliente compara su blockmap con el del servidor
3. **Descarga**: Solo se descargan los bloques que han cambiado
4. **Reconstrucción**: El instalador se reconstruye localmente

## Archivos generados

Al compilar con `npm run build:electron`, se generan:

```
release/
├── Sistema-de-Gestion-de-Obras-Setup-X.Y.Z.exe       # Instalador completo
├── Sistema-de-Gestion-de-Obras-Setup-X.Y.Z.exe.blockmap  # Mapa de bloques para delta
├── latest.yml                                         # Metadata de la última versión
└── builder-effective-config.yaml                      # Configuración usada
```

## Configuración del servidor

Para que los delta updates funcionen, debes subir TODOS estos archivos al servidor:

### Supabase Storage

1. Crea un bucket público llamado `app-updates`
2. Sube los archivos después de cada build:
   - `Sistema-de-Gestion-de-Obras-Setup-X.Y.Z.exe`
   - `Sistema-de-Gestion-de-Obras-Setup-X.Y.Z.exe.blockmap`
   - `latest.yml`

### Estructura en Supabase Storage

```
app-updates/
├── latest.yml                           # IMPORTANTE: siempre actualizar
├── Sistema-de-Gestion-de-Obras-Setup-2.1.0.exe
├── Sistema-de-Gestion-de-Obras-Setup-2.1.0.exe.blockmap
├── Sistema-de-Gestion-de-Obras-Setup-2.0.0.exe           # Versiones anteriores
├── Sistema-de-Gestion-de-Obras-Setup-2.0.0.exe.blockmap  # para delta desde ellas
```

## Flujo de actualización

```
┌─────────────────┐      ┌─────────────────┐
│   Cliente       │      │    Servidor     │
│   (v2.0.0)      │      │                 │
└────────┬────────┘      └────────┬────────┘
         │                        │
         │  GET latest.yml        │
         │───────────────────────>│
         │                        │
         │  versión: 2.1.0        │
         │<───────────────────────│
         │                        │
         │  GET 2.1.0.blockmap    │
         │───────────────────────>│
         │                        │
         │  Compara con local     │
         │  (solo 15% cambió)     │
         │                        │
         │  GET bloques delta     │
         │───────────────────────>│
         │                        │
         │  Reconstruye .exe      │
         │  Instala               │
         │                        │
```

## Ahorro de datos estimado

| Tipo de cambio | Instalador completo | Delta update | Ahorro |
|----------------|---------------------|--------------|--------|
| Hotfix menor   | ~80 MB              | ~2-5 MB      | 94-97% |
| Actualización  | ~80 MB              | ~10-20 MB    | 75-88% |
| Cambio mayor   | ~80 MB              | ~40-60 MB    | 25-50% |

## Limitaciones

1. **Primera instalación**: Siempre descarga el instalador completo
2. **Saltos de versión grandes**: Si se salta muchas versiones, el delta puede ser grande
3. **Android**: No aplica a APK (Google Play tiene su propio sistema)
4. **Requiere mantener versiones anteriores**: Para calcular deltas desde cualquier versión

## Script de publicación

```bash
# Después de compilar
npm run build:electron

# Subir a Supabase Storage
node scripts/publish-electron-update.cjs
```

## Verificar que funciona

1. Instala una versión anterior
2. El sistema detectará la actualización
3. En los logs de Electron verás:
   ```
   [Updates] Differential update available
   [Updates] Downloading delta: 5.2 MB (was 80 MB)
   ```
