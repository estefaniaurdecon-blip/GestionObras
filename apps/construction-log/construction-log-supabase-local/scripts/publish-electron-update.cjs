/**
 * Script para publicar actualizaciones de Electron con soporte para delta updates
 * 
 * Uso: node scripts/publish-electron-update.cjs
 * 
 * Este script:
 * 1. Busca los archivos de build en /release o /electron-release
 * 2. Sube el instalador + blockmap (delta updates) a Supabase Storage
 * 3. Actualiza la tabla app_versions con la nueva versión
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

console.log('🚀 ========================================');
console.log('🚀 Publicar Actualización Electron');
console.log('🚀 (Con soporte para Delta Updates)');
console.log('🚀 ========================================\n');

function getCurrentVersion() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')
  );
  return packageJson.version;
}

function getReleaseFiles(version) {
  // Buscar en ambos directorios posibles
  const possibleDirs = [
    path.join(__dirname, '../release'),
    path.join(__dirname, '../electron-release')
  ];
  
  for (const releaseDir of possibleDirs) {
    if (!fs.existsSync(releaseDir)) continue;
    
    const files = fs.readdirSync(releaseDir);
    const versionFiles = files.filter(f => f.includes(version) && f.endsWith('.exe') && !f.includes('blockmap'));
    
    if (versionFiles.length === 0) continue;
    
    const installer = versionFiles.find(f => f.includes('Setup'));
    const blockmap = files.find(f => f.includes(version) && f.endsWith('.exe.blockmap'));
    const yml = files.find(f => f === 'latest.yml');
    
    return {
      installer,
      blockmap,  // Para delta updates
      yml,
      dir: releaseDir,
      allFiles: files
    };
  }
  
  return null;
}

async function publishUpdate() {
  try {
    const version = getCurrentVersion();
    console.log(`📦 Versión actual: ${version}\n`);
    
    // Verificar que existan los archivos de build
    const files = getReleaseFiles(version);
    
    if (!files || !files.installer) {
      console.error('❌ No se encontraron archivos de build para la versión', version);
      console.log('\n💡 Ejecuta primero:');
      console.log('   node scripts/build-electron-complete.cjs');
      console.log('   o: npm run build:electron\n');
      rl.close();
      process.exit(1);
    }
    
    console.log('📋 Archivos encontrados:');
    console.log(`   - ${files.installer}`);
    if (files.blockmap) {
      console.log(`   - ${files.blockmap} (🔄 Delta Updates habilitados)`);
    } else {
      console.log('   ⚠️  No se encontró blockmap - delta updates no disponibles');
    }
    if (files.yml) {
      console.log(`   - ${files.yml} (metadata auto-updater)`);
    }
    
    const installerPath = path.join(files.dir, files.installer);
    const stats = fs.statSync(installerPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`\n📊 Tamaño del instalador: ${sizeMB} MB\n`);
    
    // Solicitar notas de la versión
    console.log('📝 Notas de la versión (qué hay de nuevo):');
    const releaseNotes = await question('   > ');
    
    // Preguntar si es actualización obligatoria
    const isMandatory = await question('\n¿Es actualización obligatoria? (s/n): ');
    const mandatory = isMandatory.toLowerCase() === 's';
    
    console.log('\n📤 ========================================');
    console.log('📤 Opciones de Publicación');
    console.log('📤 ========================================\n');
    
    console.log('¿Cómo quieres publicar la actualización?\n');
    console.log('1. Subir a mi propio servidor (manual)');
    console.log('2. Ya tengo la URL del archivo');
    const uploadChoice = await question('\nElige (1/2): ');
    
    let fileUrl;
    
    if (uploadChoice === '1') {
      console.log('\n📋 Para subir manualmente:\n');
      console.log('   1. Sube estos archivos a tu servidor:');
      console.log(`      - ${files.installer}`);
      if (files.blockmap) {
        console.log(`      - ${files.blockmap} (IMPORTANTE para delta updates)`);
      }
      if (files.yml) {
        console.log(`      - ${files.yml}`);
      }
      console.log('\n   2. Asegúrate de que sean accesibles públicamente');
      console.log('   3. Los archivos deben estar en el mismo directorio\n');
      
      fileUrl = await question('   Ingresa la URL pública del instalador (.exe): ');
    } else {
      fileUrl = await question('\nIngresa la URL pública del instalador: ');
    }
    
    if (!fileUrl || !fileUrl.startsWith('http')) {
      console.log('\n❌ URL inválida. Publicación cancelada.\n');
      rl.close();
      process.exit(1);
    }
    
    // Crear registro para la base de datos
    const updateRecord = {
      version: version,
      platform: 'windows',
      file_url: fileUrl,
      file_size: stats.size,
      release_notes: releaseNotes || 'Nueva versión disponible',
      is_mandatory: mandatory,
      created_at: new Date().toISOString(),
      supports_delta: !!files.blockmap
    };
    
    // Guardar información de la actualización
    const updateInfoPath = path.join(files.dir, `update-${version}.json`);
    fs.writeFileSync(updateInfoPath, JSON.stringify(updateRecord, null, 2));
    
    console.log('\n✅ Información de actualización guardada\n');
    console.log('📋 Detalles de la actualización:');
    console.log(JSON.stringify(updateRecord, null, 2));
    
    console.log('\n\n📝 Registrar en la base de datos:');
    console.log('\n   Opción A - Desde la App (Recomendado):');
    console.log('   - Inicia sesión como administrador');
    console.log('   - Ve a la pestaña "Actualizaciones"');
    console.log('   - Usa el panel de administración para publicar');
    
    console.log('\n   Opción B - SQL Directo:');
    console.log('   Ejecuta esta query en tu base de datos Supabase:\n');
    
    const sqlQuery = `
INSERT INTO app_versions (version, platform, file_url, file_size, release_notes, is_mandatory)
VALUES (
  '${version}',
  'windows',
  '${fileUrl}',
  ${stats.size},
  '${releaseNotes || 'Nueva versión disponible'}',
  ${mandatory}
);`;
    
    console.log(sqlQuery);
    
    console.log('\n\n📊 Verificación de Delta Updates:');
    if (files.blockmap) {
      const blockmapPath = path.join(files.dir, files.blockmap);
      const blockmapStats = fs.statSync(blockmapPath);
      const blockmapSizeKB = (blockmapStats.size / 1024).toFixed(2);
      
      console.log(`   ✅ Blockmap encontrado (${blockmapSizeKB} KB)`);
      console.log('   ✅ Los usuarios con versiones anteriores descargarán solo los cambios');
      console.log('\n   ⚠️  IMPORTANTE: Asegúrate de subir también el archivo .blockmap');
      console.log(`      URL del blockmap: ${fileUrl}.blockmap`);
    } else {
      console.log('   ⚠️  Sin blockmap - descarga completa siempre');
      console.log('   💡 Para habilitar delta updates, recompila con:');
      console.log('      npm run build:electron');
    }
    
    console.log('\n\n📱 Verificación para usuarios:');
    console.log('   - Los usuarios con la app abierta verán la notificación');
    console.log('   - La actualización se descargará automáticamente');
    if (mandatory) {
      console.log('   - Los usuarios DEBEN actualizar para continuar');
    } else {
      console.log('   - Los usuarios pueden posponer la actualización');
    }
    
    console.log('\n\n📝 Archivo de configuración guardado:');
    console.log(`   ${updateInfoPath}\n`);
    
    console.log('✅ ========================================');
    console.log('✅ Proceso de Publicación Completado');
    console.log('✅ ========================================\n');
    
    console.log('📚 Para más información:');
    console.log('   - Ver: docs/DELTA-UPDATES.md');
    console.log('   - Ver: BUILD-ELECTRON-GUIDE.md\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

publishUpdate();
