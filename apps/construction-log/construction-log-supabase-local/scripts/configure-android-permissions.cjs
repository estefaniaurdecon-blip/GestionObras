const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

if (!fs.existsSync(manifestPath)) {
  console.log('⚠️  AndroidManifest.xml no encontrado. Ejecuta "npx cap add android" primero.');
  process.exit(0);
}

console.log('📝 Configurando permisos de micrófono en AndroidManifest.xml...');

let manifest = fs.readFileSync(manifestPath, 'utf8');

// Permisos necesarios para el micrófono y ubicación
const permissions = [
  '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
  '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
  '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
  '<uses-feature android:name="android.hardware.location.gps" />'
];

let modified = false;

permissions.forEach(permission => {
  if (!manifest.includes(permission)) {
    // Buscar la etiqueta <manifest> y agregar el permiso después
    const manifestTagIndex = manifest.indexOf('<manifest');
    const manifestCloseIndex = manifest.indexOf('>', manifestTagIndex);
    
    if (manifestTagIndex !== -1 && manifestCloseIndex !== -1) {
      const insertPosition = manifestCloseIndex + 1;
      manifest = manifest.slice(0, insertPosition) + '\n    ' + permission + manifest.slice(insertPosition);
      modified = true;
      console.log(`✅ Agregado: ${permission}`);
    }
  } else {
    console.log(`✓ Ya existe: ${permission}`);
  }
});

if (modified) {
  fs.writeFileSync(manifestPath, manifest, 'utf8');
  console.log('✅ AndroidManifest.xml actualizado correctamente');
  console.log('\n⚠️  IMPORTANTE: Desinstala completamente la app del dispositivo y vuelve a instalar la nueva APK');
} else {
  console.log('✅ Todos los permisos ya están configurados');
}
