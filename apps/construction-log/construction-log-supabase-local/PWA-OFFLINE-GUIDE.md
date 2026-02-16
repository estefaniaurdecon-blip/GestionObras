# Guía PWA y Funcionalidad Offline

## 🎯 Descripción General

La aplicación ahora es una **PWA (Progressive Web App) completa** con capacidades offline avanzadas. Esto significa que:

- ✅ **Funciona completamente sin conexión a Internet**
- ✅ **Se puede instalar como app nativa** en móviles y ordenadores
- ✅ **Sincroniza automáticamente** cuando vuelve la conexión
- ✅ **Cache inteligente** para carga ultrarrápida
- ✅ **Indicadores visuales** de estado online/offline

## 📱 Instalación como App

### En Android/iOS:
1. Abre la app en el navegador
2. Busca "Añadir a pantalla de inicio" en el menú del navegador
3. La app se instalará como una aplicación nativa

### En Desktop (Chrome/Edge):
1. Busca el icono de instalación (➕) en la barra de direcciones
2. Click en "Instalar"
3. La app se abrirá en su propia ventana

## 🔄 Sincronización Offline

### Funcionamiento Automático

La app detecta automáticamente cuándo pierdes/recuperas conexión:

1. **Sin conexión**: 
   - Banner rojo superior indica "Sin conexión"
   - Todos los cambios se guardan localmente
   - Cola de operaciones pendientes

2. **Vuelve conexión**:
   - Banner verde confirma "Conexión restaurada"
   - Sincronización automática en 3-5 segundos
   - Opción de sincronizar manualmente

### Datos que Funcionan Offline

✅ **Partes de trabajo**:
- Crear, editar, eliminar
- Añadir fotos (se guardan en base64)
- Firmas
- Todos los datos del formulario

✅ **Control de accesos**:
- Crear nuevos controles
- Editar registros existentes
- Personal y maquinaria

✅ **Obras**:
- Ver obras asignadas
- Datos básicos cacheados

✅ **Usuarios**:
- Lista de usuarios (cache)
- Información básica

### Limitaciones Offline

❌ **Funciones que requieren servidor**:
- Análisis IA de albaranes (requiere Gemini)
- Generación automática de controles de acceso
- Chat de construcción
- Subida de imágenes a almacenamiento (se guardan temporalmente)

## 🛠️ Estrategias de Cache

### 1. Assets Estáticos (Cache First)
- JavaScript, CSS, fuentes
- Se cachean en primera carga
- Actualización en background

### 2. Imágenes (Cache First + Background Update)
- Fotos de albaranes, logos
- Se muestran desde cache
- Se actualizan en segundo plano

### 3. API Calls (Network First + Fallback)
- Intenta red primero
- Si falla, usa cache
- Sincroniza cuando vuelve conexión

## 📊 Indicadores Visuales

### Banner Superior (Offline)
```
🔴 Sin conexión - Los cambios se guardarán localmente
```

### Banner Superior (Vuelta conexión)
```
🟢 Conexión restaurada - Sincronizando cambios pendientes...
[Botón: Sincronizar ahora]
```

### Indicador de Operaciones Pendientes
```
☁️ Sincronizando...
[Botón: ⟳]
```

## 🔧 Comandos Útiles

### Limpiar Cache del Service Worker
```javascript
// En consola del navegador
await caches.keys().then(names => 
  Promise.all(names.map(name => caches.delete(name)))
);
```

### Forzar Actualización del Service Worker
```javascript
navigator.serviceWorker.getRegistration().then(reg => {
  reg.update();
});
```

### Ver Estado de Sincronización
```javascript
// Comprobar operaciones pendientes
const pending = await localStorage.getItem('work_reports_pending_sync');
console.log('Pendientes:', JSON.parse(pending));
```

## 🐛 Solución de Problemas

### La app no funciona offline
1. Verifica que estás en HTTPS (o localhost)
2. Abre DevTools → Application → Service Workers
3. Verifica que el SW esté "activated and running"

### Los cambios no se sincronizan
1. Verifica conexión en el indicador superior
2. Click en "Sincronizar ahora" manualmente
3. Recarga la página (F5)

### Cache desactualizado
1. Abre DevTools → Application → Storage
2. Click "Clear site data"
3. Recarga la página

## 📈 Rendimiento

### Tiempos de Carga (aprox.)

**Primera visita**: 2-3 segundos
**Visitas posteriores (online)**: < 500ms
**Visitas posteriores (offline)**: < 200ms

### Tamaño de Cache

- **Static cache**: ~2-3 MB (assets de la app)
- **Runtime cache**: Variable (API responses)
- **Image cache**: Variable (fotos de usuarios)

**Total recomendado**: < 50 MB

## 🔐 Seguridad

- Service Worker solo funciona en HTTPS
- Cache separado por origin
- No se cachean tokens sensibles
- Las imágenes en cache son públicas de Supabase

## 🚀 Próximos Pasos

- [ ] Push notifications cuando vuelve conexión
- [ ] Sincronización en background incluso con app cerrada
- [ ] Precarga inteligente de datos frecuentes
- [ ] Compresión de imágenes offline
- [ ] Modo "solo lectura" cuando offline total

## 📚 Referencias

- [PWA Checklist](https://web.dev/pwa-checklist/)
- [Service Worker API](https://developer.mozilla.org/es/docs/Web/API/Service_Worker_API)
- [Cache Storage API](https://developer.mozilla.org/es/docs/Web/API/CacheStorage)
