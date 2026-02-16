const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIcoModule = require('png-to-ico');
const pngToIco = pngToIcoModule.default || pngToIcoModule;

async function convertPngToIco() {
  try {
    const pngPath = path.join(__dirname, '..', 'resources', 'icon.png');
    const icoPath = path.join(__dirname, '..', 'resources', 'icon.ico');

    console.log('🎨 Convirtiendo icon.png a icon.ico para NSIS...');

    if (!fs.existsSync(pngPath)) {
      console.warn('⚠️ icon.png no encontrado');
      return false;
    }

    // Leer metadata del PNG original
    const image = sharp(pngPath);
    const metadata = await image.metadata();

    console.log(`📄 Formato original: ${metadata.format}`);

    // Generar múltiples tamaños para un ICO válido (16, 32, 48, 256)
    // Windows requiere múltiples resoluciones en el archivo .ico
    console.log('📐 Generando múltiples resoluciones para icon.ico...');
    
    const sizes = [16, 32, 48, 256];
    const pngBuffers = [];

    for (const size of sizes) {
      console.log(`   - Generando ${size}x${size}px`);
      const buffer = await sharp(pngPath)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }, // Transparente
        })
        .png({ compressionLevel: 9 })
        .toBuffer();
      
      pngBuffers.push(buffer);
    }

    // Crear ICO con todas las resoluciones
    console.log('🔧 Generando archivo icon.ico con múltiples resoluciones...');

    try {
      // pngToIco acepta un array de buffers
      const icoBuffer = await pngToIco(pngBuffers);
      fs.writeFileSync(icoPath, icoBuffer);
      
      const stats = fs.statSync(icoPath);
      console.log(`✅ icon.ico generado exitosamente (${(stats.size / 1024).toFixed(2)} KB)`);
      console.log('   Contiene resoluciones: 16x16, 32x32, 48x48, 256x256');
      console.log('ℹ️  Este icono se usará en el instalador NSIS y el ejecutable');
      return true;
    } catch (icoError) {
      console.error('❌ Error generando icon.ico:', icoError.message);
      console.warn('⚠️ Se usará icono por defecto del instalador');
      return false;
    }
  } catch (error) {
    console.error('❌ Error al convertir:', error.message);
    console.warn('⚠️ Se usará icono por defecto');
    return false;
  }
}

convertPngToIco()
  .then((success) => {
    if (success) {
      console.log('🎉 Conversión completada');
    } else {
      console.log('⚠️ Usando icono por defecto');
    }
  })
  .catch((error) => {
    console.error('❌ Error fatal:', error);
    process.exit(0);
  });
