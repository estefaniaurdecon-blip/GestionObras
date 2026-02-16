const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function generateIcons() {
  try {
    const sourcePath = path.join(__dirname, '..', 'public', 'icon-512.png');
    const icon192Path = path.join(__dirname, '..', 'public', 'icon-192.png');
    
    console.log('📱 Generando iconos para Android...');
    
    // Generar icono 192x192
    await sharp(sourcePath)
      .resize(192, 192, { 
        fit: 'contain', 
        background: { r: 0, g: 0, b: 0, alpha: 0 } 
      })
      .png()
      .toFile(icon192Path);
    
    console.log('✅ icon-192.png generado');
    console.log('✅ Iconos Android listos');
    
  } catch (error) {
    console.error('❌ Error generando iconos:', error.message);
    process.exit(1);
  }
}

generateIcons();
