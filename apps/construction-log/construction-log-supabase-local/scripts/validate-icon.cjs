const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Requisitos mínimos para el icono
const REQUIREMENTS = {
  MIN_SIZE: 256,           // Tamaño mínimo recomendado (256x256)
  OPTIMAL_SIZE: 512,       // Tamaño óptimo (512x512)
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB máximo
  REQUIRED_FORMAT: 'png',
  REQUIRE_ALPHA: true,     // Debe tener canal alpha (transparencia)
};

async function validateIcon() {
  const iconPath = path.join(__dirname, '..', 'resources', 'icon.png');
  
  console.log('🔍 Validando icon.png...\n');

  // 1. Verificar que el archivo existe
  if (!fs.existsSync(iconPath)) {
    console.error('❌ ERROR: icon.png no encontrado en resources/');
    return false;
  }
  console.log('✅ Archivo existe');

  try {
    // 2. Obtener información del archivo
    const stats = fs.statSync(iconPath);
    const fileSize = stats.size;
    
    console.log(`📊 Tamaño del archivo: ${(fileSize / 1024).toFixed(2)} KB`);
    
    if (fileSize > REQUIREMENTS.MAX_FILE_SIZE) {
      console.error(`❌ ERROR: El archivo es demasiado grande (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
      console.error(`   Tamaño máximo permitido: ${REQUIREMENTS.MAX_FILE_SIZE / 1024 / 1024} MB`);
      return false;
    }

    // 3. Validar con Sharp
    const metadata = await sharp(iconPath).metadata();
    
    // 3.1 Validar formato
    console.log(`📄 Formato: ${metadata.format}`);
    if (metadata.format !== REQUIREMENTS.REQUIRED_FORMAT) {
      console.warn(`⚠️ Formato actual: ${metadata.format.toUpperCase()}, convirtiendo a PNG...`);
      try {
        // Convertir a PNG
        await sharp(iconPath)
          .png()
          .toFile(iconPath + '.tmp');
        
        // Reemplazar archivo original
        fs.unlinkSync(iconPath);
        fs.renameSync(iconPath + '.tmp', iconPath);
        console.log('✅ Icono convertido exitosamente a PNG');
        
        // Re-leer metadata después de conversión
        const newMetadata = await sharp(iconPath).metadata();
        Object.assign(metadata, newMetadata);
      } catch (conversionError) {
        console.error(`❌ ERROR: No se pudo convertir a PNG:`, conversionError.message);
        return false;
      }
    } else {
      console.log('✅ Formato válido (PNG)');
    }

    // 3.2 Validar dimensiones
    const { width, height } = metadata;
    console.log(`📐 Dimensiones: ${width}x${height}px`);
    
    if (!width || !height) {
      console.error('❌ ERROR: No se pudieron leer las dimensiones de la imagen');
      return false;
    }

    if (width !== height) {
      console.warn('⚠️  ADVERTENCIA: El icono no es cuadrado. Se recomienda usar una imagen cuadrada.');
    }

    const minDimension = Math.min(width, height);
    
    if (minDimension < REQUIREMENTS.MIN_SIZE) {
      console.error(`❌ ERROR: Dimensiones muy pequeñas (${width}x${height})`);
      console.error(`   Tamaño mínimo: ${REQUIREMENTS.MIN_SIZE}x${REQUIREMENTS.MIN_SIZE}px`);
      return false;
    }
    console.log('✅ Dimensiones suficientes');

    if (minDimension < REQUIREMENTS.OPTIMAL_SIZE) {
      console.warn(`⚠️  ADVERTENCIA: Tamaño menor al óptimo (${REQUIREMENTS.OPTIMAL_SIZE}x${REQUIREMENTS.OPTIMAL_SIZE}px)`);
      console.warn('   Para mejor calidad, se recomienda usar al menos 512x512px');
    } else if (minDimension >= REQUIREMENTS.OPTIMAL_SIZE) {
      console.log(`✅ Tamaño óptimo (>= ${REQUIREMENTS.OPTIMAL_SIZE}x${REQUIREMENTS.OPTIMAL_SIZE}px)`);
    }

    // 3.3 Validar canal alpha (transparencia)
    const hasAlpha = metadata.hasAlpha;
    console.log(`🎨 Canal Alpha (transparencia): ${hasAlpha ? 'Sí' : 'No'}`);
    
    if (REQUIREMENTS.REQUIRE_ALPHA && !hasAlpha) {
      console.warn('⚠️  ADVERTENCIA: El icono no tiene canal alpha (transparencia)');
      console.warn('   Se recomienda usar un PNG con transparencia para mejor apariencia');
    } else if (hasAlpha) {
      console.log('✅ Tiene transparencia');
    }

    // 3.4 Verificar que no sea una potencia de 2 (recomendado)
    const isPowerOfTwo = (n) => n > 0 && (n & (n - 1)) === 0;
    if (isPowerOfTwo(width) && isPowerOfTwo(height)) {
      console.log('✅ Dimensiones son potencias de 2 (ideal para iconos)');
    } else {
      console.warn('⚠️  SUGERENCIA: Para mejor compatibilidad, usa dimensiones en potencias de 2');
      console.warn('   Recomendado: 256x256, 512x512, o 1024x1024px');
    }

    // 3.5 Validar espacio de color
    if (metadata.space) {
      console.log(`🎨 Espacio de color: ${metadata.space}`);
      if (metadata.space === 'srgb') {
        console.log('✅ Espacio de color estándar (sRGB)');
      }
    }

    console.log('\n✅ Validación completada exitosamente');
    console.log('   El icono cumple con los requisitos mínimos\n');
    return true;

  } catch (error) {
    console.error('❌ ERROR al validar el icono:', error.message);
    if (error.message.includes('Input file is missing')) {
      console.error('   El archivo PNG está corrupto o no es válido');
    }
    return false;
  }
}

// Ejecutar validación
validateIcon()
  .then((isValid) => {
    if (!isValid) {
      console.error('\n❌ La validación del icono falló');
      console.error('   Por favor, corrija los errores antes de continuar con la build\n');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('❌ Error fatal durante la validación:', error);
    process.exit(1);
  });
