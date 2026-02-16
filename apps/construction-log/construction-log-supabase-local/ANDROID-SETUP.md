# 📱 Configuración de Android - Nuevos Iconos y Splash Screen

## ✅ Cambios Implementados

Se han actualizado los siguientes elementos para Android:

1. **Nuevo Icono de la App**
   - Icono profesional con casco y planos
   - Generado en múltiples tamaños (192x192, 512x512)
   - Con transparencia para mejor integración

2. **Splash Screen**
   - Pantalla de carga con gradiente naranja-azul
   - Muestra el logo y nombre de la app
   - Configuración optimizada para Android

3. **Manifest Actualizado**
   - Nombre actualizado: "Sistema de Gestión de Obras"
   - Tema naranja (#F97316)
   - Iconos PWA configurados

## 🔄 Pasos para Aplicar los Cambios

Después de hacer `git pull` del proyecto, ejecuta los siguientes comandos:

### 1. Instalar Dependencias
```bash
npm install
```

### 2. Generar Iconos Android
```bash
node scripts/generate-android-icons.cjs
```

### 3. Generar Assets de Capacitor
```bash
npx @capacitor/assets generate --android
```

Este comando genera automáticamente todos los tamaños de iconos y splash screens necesarios para Android en las carpetas correctas.

### 4. Sincronizar con Android
```bash
npm run build
npx cap sync android
```

### 5. Ejecutar en Android
```bash
npx cap run android
```

## 📁 Archivos Generados

Los assets se generan automáticamente en:
- `android/app/src/main/res/mipmap-*/` - Iconos de la app
- `android/app/src/main/res/drawable-*/` - Splash screens

## ⚙️ Configuración del Splash Screen

El splash screen está configurado en `capacitor.config.ts`:
- Duración: 2 segundos
- Fade out: 500ms
- Color de fondo: #1e3a5f (azul oscuro)
- Pantalla completa e inmersiva
- Sin spinner

## 🎨 Personalización

Si necesitas ajustar el splash screen:
1. Edita `resources/splash.png`
2. Regenera assets: `npx @capacitor/assets generate --android`
3. Sincroniza: `npx cap sync android`

## 📱 Resultado

La app Android mostrará:
- ✅ Nuevo icono en el launcher
- ✅ Splash screen con branding al iniciar
- ✅ Transición suave a la app

## 🔗 Recursos

- [Capacitor Assets Documentation](https://github.com/ionic-team/capacitor-assets)
- [Capacitor Splash Screen Plugin](https://capacitorjs.com/docs/apis/splash-screen)
