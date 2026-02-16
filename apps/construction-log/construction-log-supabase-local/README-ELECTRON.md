# 🚀 Construcción Log - Aplicación de Escritorio

Esta guía te ayudará a crear un archivo ejecutable (.exe) de la aplicación.

## 📋 Requisitos Previos

- Node.js instalado (versión 16 o superior)
- Windows (para generar archivos .exe)

## 🛠️ Comandos Disponibles

### Desarrollo con Electron
```bash
node scripts/dev-electron.cjs
```
Inicia la aplicación en modo desarrollo con Electron y hot-reload.

### Construir Ejecutable
```bash
node scripts/build-electron.cjs
```
Genera el archivo ejecutable (.exe) en la carpeta `release/`.

### Comandos Individuales
Una vez ejecutado el script de construcción, también tendrás disponibles:

```bash
# Ejecutar Electron en modo desarrollo
npm run electron-dev

# Construir para Windows
npm run dist:win

# Construir para macOS
npm run dist:mac

# Construir para Linux
npm run dist:linux
```

## 📁 Estructura de Archivos

```
proyecto/
├── electron/
│   └── main.js          # Archivo principal de Electron
├── scripts/
│   ├── build-electron.cjs # Script de construcción
│   └── dev-electron.cjs   # Script de desarrollo
├── release/             # Ejecutables generados
└── electron-builder.config.js # Configuración del builder
```

## 🎯 Proceso de Construcción

1. **Construcción Web**: Se genera la versión optimizada de React
2. **Configuración Electron**: Se ajusta temporalmente el package.json
3. **Generación Ejecutable**: Se crea el archivo .exe con electron-builder
4. **Restauración**: Se vuelve a la configuración original

## 📦 Resultado

El ejecutable final incluye:
- ✅ Toda la aplicación web empaquetada
- ✅ Runtime de Node.js y Chromium
- ✅ Instalador NSIS para Windows
- ✅ Acceso directo en escritorio y menú inicio
- ✅ Desinstalador automático

## 🔧 Personalización

Puedes modificar la configuración en `electron-builder.config.js`:
- Icono de la aplicación
- Nombre del producto
- Configuración del instalador
- Targets de compilación

## 🚀 ¡Listo para Usar!

Ejecuta `node scripts/build-electron.cjs` y en unos minutos tendrás tu aplicación lista para distribuir.