# 📱 Guía Completa para Publicar en Google Play Store

Esta guía te llevará paso a paso para publicar tu aplicación en Google Play Store y comercializarla.

## 📋 Requisitos Previos

### 1. Cuenta de Desarrollador de Google Play
- Costo único: $25 USD
- Registro: [Google Play Console](https://play.google.com/console/signup)
- Necesitarás una cuenta de Google
- Proceso de verificación puede tomar 24-48 horas

### 2. Información Legal Requerida
- ✅ Nombre completo o empresa registrada
- ✅ Dirección física
- ✅ Correo electrónico de contacto
- ✅ Número de teléfono
- ✅ Sitio web (opcional pero recomendado)

### 3. Documentos Necesarios
- ✅ Política de privacidad (URL pública)
- ✅ Términos y condiciones
- ✅ Descripción de permisos utilizados

## 🎨 Preparar Assets Gráficos

### Iconos Requeridos
| Tipo | Tamaño | Formato |
|------|--------|---------|
| Icono de aplicación | 512x512 px | PNG (32 bits) |
| Gráfico destacado | 1024x500 px | PNG o JPG |

### Capturas de Pantalla (Mínimo 2, Máximo 8)
- **Teléfonos**: 16:9 o 9:16
  - Mínimo: 320px
  - Máximo: 3840px
- **Tablets** (opcional): Similar pero adaptado

### Imagen de Encabezado (Opcional)
- Tamaño: 1024x500 px
- Formato: PNG o JPG

## 📝 Información de la Tienda

### Título y Descripción
```
Título corto (30 caracteres): Sistema de Gestión de Obras
Título completo (50 caracteres): Sistema de Gestión de Obras - Partes de Trabajo

Descripción corta (80 caracteres):
Gestiona obras de construcción: partes, materiales, maquinaria y reportes.

Descripción completa (4000 caracteres):
[Escribe una descripción detallada que incluya:]
- Qué hace la aplicación
- Características principales
- Beneficios para el usuario
- Palabras clave para SEO
```

### Categoría
- **Recomendada**: Negocios
- **Alternativas**: Productividad, Herramientas

### Clasificación de Contenido
Completa el cuestionario en Play Console sobre:
- Violencia
- Contenido sexual
- Lenguaje
- Drogas/alcohol
- Información personal

## 🚀 Proceso de Publicación

### Paso 1: Crear la Aplicación en Play Console

1. Ve a [Google Play Console](https://play.google.com/console)
2. Clic en "Crear aplicación"
3. Completa:
   - Nombre de la aplicación
   - Idioma predeterminado: Español (España) o Español (Latinoamérica)
   - Tipo: Aplicación o juego → **Aplicación**
   - Gratis o de pago → Selecciona según tu modelo
4. Acepta declaraciones de políticas
5. Clic en "Crear aplicación"

### Paso 2: Configurar la Ficha de la Tienda

En el menú lateral, ve a **"Presencia en Play Store" → "Ficha de la tienda principal"**

Completa todos los campos requeridos:
- ✅ Detalles de la aplicación (título, descripción corta, descripción completa)
- ✅ Recursos gráficos (icono, gráfico destacado, capturas)
- ✅ Categorización (categoría, etiquetas)
- ✅ Datos de contacto (email, teléfono, sitio web)
- ✅ Política de privacidad (URL)

### Paso 3: Configurar Clasificación de Contenido

1. Ve a **"Políticas" → "Clasificación de contenido"**
2. Completa el cuestionario
3. Guarda y obtén tu clasificación
4. Verifica que sea correcta

### Paso 4: Configurar Público Objetivo

1. Ve a **"Políticas" → "Público objetivo y contenido"**
2. Selecciona:
   - Grupo de edad objetivo
   - Si hay anuncios
   - Si solicita permisos sensibles
3. Guarda los cambios

### Paso 5: Subir el APK/AAB

**Recomendación**: Usa Android App Bundle (.aab) en lugar de APK para mejor optimización.

#### Opción A: Subir APK (Actual)
1. Ve a **"Versión" → "Producción"**
2. Clic en "Crear nueva versión"
3. En "Firma de aplicaciones", acepta los términos (Google firmará tu app)
4. Sube tu APK desde:
   ```
   android/app/build/outputs/apk/release/Sistema-de-Gestion-de-Obras-[version]-release.apk
   ```
5. Google analizará el APK (puede tomar unos minutos)

#### Opción B: Generar AAB (Recomendado)
Para generar AAB en lugar de APK:
```bash
# En android/app/build.gradle, ejecuta:
cd android
./gradlew bundleRelease
# o en Windows:
gradlew.bat bundleRelease
```

El AAB estará en:
```
android/app/build/outputs/bundle/release/app-release.aab
```

Sube este archivo en lugar del APK.

### Paso 6: Notas de la Versión

Escribe las notas de la versión (qué hay de nuevo):
```
Versión 2.0.0
- Gestión completa de obras y partes de trabajo
- Escaneo de materiales con cámara
- Generación de reportes en PDF
- Gestión de maquinaria y alquileres
- Sistema de notificaciones
- Modo offline
```

### Paso 7: Revisar y Publicar

1. Revisa todos los datos en **"Resumen de la versión"**
2. Resuelve cualquier error o advertencia mostrada
3. Cuando todo esté en verde ✅, clic en **"Guardar"**
4. Luego clic en **"Revisar versión"**
5. Finalmente clic en **"Iniciar lanzamiento a producción"**

## ⏰ Tiempos de Revisión

- **Primera publicación**: 1-7 días (puede ser más largo)
- **Actualizaciones posteriores**: Generalmente 1-3 días
- Google puede solicitar información adicional

## 🛡️ Después de Publicar

### Monitoreo
- Revisa estadísticas en Play Console
- Responde a reseñas de usuarios
- Monitorea informes de fallos

### Actualizaciones
Para publicar actualizaciones:
1. Incrementa la versión con: `node scripts/version-bump.cjs`
2. Genera nuevo APK/AAB: `node scripts/build-android-release.cjs`
3. Sube a Play Console en una nueva versión
4. Escribe notas de actualización
5. Publica

## ⚠️ Problemas Comunes

### Error: "No se puede subir APK"
- Verifica que el APK esté firmado correctamente
- Confirma que el versionCode sea mayor que el anterior
- Revisa que el package name coincida

### Error: "Se requiere política de privacidad"
- Crea una página web con tu política de privacidad
- Usa servicios como [Privacy Policy Generator](https://www.privacypolicygenerator.info/)
- Asegúrate de que la URL sea accesible públicamente

### Error: "Clasificación de contenido incompleta"
- Completa todo el cuestionario
- No dejes ninguna pregunta sin responder

### Rechazo por permisos
- Justifica en la descripción por qué necesitas cada permiso
- Asegúrate de usar los permisos declarados
- Proporciona capturas que muestren su uso

## 💰 Monetización

### Aplicación de Pago
- Configura precio en **"Presencia en Play Store" → "Precios y distribución"**
- Configura cuenta de comerciante de Google

### Aplicación Gratis con Compras
- Implementa facturación en la app
- Declara las compras en Play Console

### Suscripciones
- Similar a compras dentro de la app
- Configura niveles de suscripción

## 🌍 Disponibilidad Geográfica

En **"Presencia en Play Store" → "Países y regiones"**:
- Selecciona países donde estará disponible
- Ten en cuenta regulaciones locales
- GDPR para Europa
- COPPA para menores en USA

## 📊 Optimización en Play Store (ASO)

### Palabras Clave
Incluye en título y descripción:
- Gestión de obras
- Construcción
- Partes de trabajo
- Control de proyectos
- Maquinaria
- Materiales

### Capturas Atractivas
- Muestra las funcionalidades principales
- Usa textos descriptivos en las capturas
- Orden: Las primeras 2-3 son las más importantes

### Reseñas y Calificaciones
- Responde a todas las reseñas
- Anima a usuarios satisfechos a dejar reseñas
- Soluciona problemas reportados rápidamente

## ✅ Checklist Pre-Publicación

- [ ] Cuenta de desarrollador de Google Play creada y verificada
- [ ] APK/AAB firmado y probado
- [ ] Icono de 512x512 px preparado
- [ ] Mínimo 2 capturas de pantalla
- [ ] Gráfico destacado 1024x500 px
- [ ] Título y descripciones escritas
- [ ] Política de privacidad publicada (URL)
- [ ] Clasificación de contenido completada
- [ ] Público objetivo configurado
- [ ] Países de distribución seleccionados
- [ ] Todos los permisos justificados
- [ ] Información de contacto completa
- [ ] Notas de la versión escritas
- [ ] App probada en dispositivos reales

## 🔗 Enlaces Útiles

- [Google Play Console](https://play.google.com/console)
- [Políticas de Desarrollador](https://play.google.com/about/developer-content-policy/)
- [Guía de Lanzamiento](https://developer.android.com/distribute/best-practices/launch)
- [Generador de Política de Privacidad](https://www.privacypolicygenerator.info/)
- [Criterios de Clasificación](https://support.google.com/googleplay/android-developer/answer/9859655)
- [Academy for App Success](https://playacademy.exceedlms.com/student/catalog)

## 🆘 Soporte

Si tienes problemas:
1. Revisa [Centro de Ayuda de Play Console](https://support.google.com/googleplay/android-developer)
2. Consulta la [Comunidad de Desarrolladores](https://groups.google.com/g/android-developers)
3. Contacta al soporte de Google Play

---

**¡Buena suerte con el lanzamiento de tu aplicación! 🚀**
