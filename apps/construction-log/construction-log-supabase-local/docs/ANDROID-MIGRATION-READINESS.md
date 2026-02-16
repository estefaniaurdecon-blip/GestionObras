# Android Migration Readiness (2026-02-11)

## Objetivo
Dejar una base coherente para migrar a Android sin romper el flujo web/electron actual, y sin bloquear futuras funcionalidades del parte de obra.

## Estado actual verificado
- Plataforma Android de Capacitor recreada y valida (`android/` incluye `gradlew`, `app`, `build.gradle`).
- Build web en verde (`npm run build`).
- Sync Android en verde (`npx cap sync android`).
- Build Android debug en verde con entorno correcto (`gradlew assembleDebug`).
- Flujo de creacion/edicion de parte en `GenerateWorkReportPanel` como origen principal en `src/pages/Index.tsx`.

## Comando canonico de comprobacion
Se agrega un chequeo unico para migracion:

```bash
npm run android:migration:check
```

Este comando:
1. Valida scaffold Android requerido.
2. Detecta `JAVA_HOME` y `ANDROID_HOME` (incluye rutas comunes de Android Studio en Windows).
3. Genera/actualiza `android/local.properties` con `sdk.dir`.
4. Ejecuta `npx cap doctor`.
5. Ejecuta `npm run build`.
6. Ejecuta `npx cap sync android`.
7. Verifica assets sincronizados en `android/app/src/main/assets`.
8. Ejecuta `assembleDebug`.

Para ejecucion rapida sin compilar APK:

```bash
npm run android:migration:check -- --skip-assemble
```

## Criterios de coherencia para siguientes features
1. Mantener un unico flujo de UI para partes (`GenerateWorkReportPanel`) y evitar duplicados legacy.
2. Mantener persistencia offline como fuente de verdad local antes de sincronizacion.
3. Encapsular comportamiento de plataforma (web/electron/native) en utilidades centrales, no en componentes de negocio.
4. Evitar depender de APIs exclusivas de Electron en funcionalidades que deben correr en Android.
5. Cualquier feature nueva de "Generar Parte" debe pasar `android:migration:check` antes de cerrar tarea.

## Riesgos actuales a controlar
- Hay scripts/documentacion Android historicos con problemas de encoding. Se recomienda consolidarlos progresivamente en UTF-8.
- Existen rutas de codigo con deteccion de plataforma duplicada (`electron` vs `capacitor`). Conviene unificar helper para reducir divergencias.
- `offline-db` usa `sql.js` serializado a storage; funciona, pero hay que vigilar tamano y rendimiento en Android en partes grandes.

## Siguiente bloque recomendado
1. Unificar deteccion de plataforma en un helper comun.
2. Sustituir confirmaciones nativas (`window.confirm`) por modal consistente y compatible.
3. Crear smoke tests funcionales del flujo "Generar Parte" en Android emulator.
4. Continuar desarrollo funcional (mano de obra, maquinaria, materiales) sobre el flujo unico ya consolidado.
