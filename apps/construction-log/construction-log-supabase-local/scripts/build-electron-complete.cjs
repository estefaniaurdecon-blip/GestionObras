const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('💻 ========================================');
console.log('💻 Build Automático de Electron');
console.log('💻 ========================================\n');

// Función para leer la versión actual
function getCurrentVersion() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')
  );
  return packageJson.version;
}

// Función para crear el directorio de release si no existe
function ensureReleaseDir() {
  const releaseDir = path.join(__dirname, '../electron-release');
  if (!fs.existsSync(releaseDir)) {
    fs.mkdirSync(releaseDir, { recursive: true });
  }
  return releaseDir;
}

// Función para copiar y renombrar ejecutables
function organizeBuilds(version, releaseDir) {
  const defaultReleaseDir = path.join(__dirname, '../release');
  
  if (!fs.existsSync(defaultReleaseDir)) {
    console.log('⚠️  No se encontraron builds en release/');
    return;
  }
  
  const timestamp = new Date().toISOString().split('T')[0];
  const files = fs.readdirSync(defaultReleaseDir);
  
  console.log('\n📦 Organizando builds...\n');
  
  files.forEach(file => {
    if (file.endsWith('.exe') || file.endsWith('.dmg') || file.endsWith('.AppImage')) {
      const sourcePath = path.join(defaultReleaseDir, file);
      const ext = path.extname(file);
      const platform = ext === '.exe' ? 'win' : ext === '.dmg' ? 'mac' : 'linux';
      const newName = `Sistema-Gestion-Obras-${version}-${platform}-${timestamp}${ext}`;
      const destPath = path.join(releaseDir, newName);
      
      fs.copyFileSync(sourcePath, destPath);
      const stats = fs.statSync(destPath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`✅ ${newName} (${sizeMB} MB)`);
    }
  });
  
  // Copiar archivos yml para auto-updater
  const ymlFiles = files.filter(f => f.endsWith('.yml'));
  ymlFiles.forEach(file => {
    const sourcePath = path.join(defaultReleaseDir, file);
    const destPath = path.join(releaseDir, file);
    fs.copyFileSync(sourcePath, destPath);
    console.log(`📄 ${file} (auto-updater)`);
  });
}

// Función principal
async function buildElectron() {
  try {
    // Paso 1: Incrementar versión
    console.log('📌 Paso 1: Incrementando versión...\n');
    execSync('node scripts/version-bump.cjs', { stdio: 'inherit' });
    
    const currentVersion = getCurrentVersion();
    console.log(`\n✅ Nueva versión: ${currentVersion}\n`);
    
    // Paso 2: Construir la aplicación web
    console.log('📦 Paso 2: Construyendo aplicación web...\n');
    execSync('npm run build', { stdio: 'inherit' });
    console.log('\n✅ Build web completado\n');
    
    // Paso 3: Validar icono (electron-builder convertirá a ICO automáticamente)
    console.log('🎨 Paso 3: Validando icono...\n');
    try {
      execSync('node scripts/validate-icon.cjs', { stdio: 'inherit' });
    } catch (error) {
      console.log('⚠️  Problema con el icono, continuando...\n');
    }

    // Paso 3.5: Generar icon.ico compatible con NSIS
    console.log('🎨 Paso 3.5: Generando icon.ico para instalador NSIS...\n');
    try {
      execSync('node scripts/convert-icon-to-ico.cjs', { stdio: 'inherit' });
    } catch (error) {
      console.log('⚠️  No se pudo generar icon.ico, el instalador usará el icono por defecto\n');
    }

    // Paso 4: Preparar package.json para Electron
    console.log('⚙️  Paso 4: Preparando configuración Electron...\n');
    const packagePath = path.join(__dirname, '../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    
    // Backup
    const backupPath = path.join(__dirname, '../package.json.backup');
    fs.writeFileSync(backupPath, JSON.stringify(packageJson, null, 2));
    
    // Modificar para Electron
    packageJson.main = 'electron/main.js';
    packageJson.type = 'commonjs';
    
    // Asegurar que electron y electron-builder estén SOLO en devDependencies
    packageJson.devDependencies = packageJson.devDependencies || {};
    packageJson.dependencies = packageJson.dependencies || {};
    
    const devPackages = ['electron', 'electron-builder', 'concurrently', 'wait-on'];
    devPackages.forEach(pkg => {
      // Mover de dependencies a devDependencies si existe
      if (packageJson.dependencies[pkg]) {
        packageJson.devDependencies[pkg] = packageJson.dependencies[pkg];
        delete packageJson.dependencies[pkg];
      }
    });
    
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
    console.log('✅ package.json configurado para Electron\n');
    
    // Paso 5: Construir ejecutable con electron-builder
    console.log('🔨 Paso 5: Construyendo ejecutable Electron...\n');
    console.log('   (Esto puede tardar varios minutos)\n');
    
    try {
      execSync('npx electron-builder --win --config electron-builder.config.js', { 
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'production' }
      });
      console.log('\n✅ Ejecutable Windows construido\n');
    } catch (buildError) {
      console.error('❌ Error al construir ejecutable');
      throw buildError;
    }
    
    // Paso 6: Restaurar package.json
    console.log('🔄 Paso 6: Restaurando configuración...\n');
    const originalPackage = fs.readFileSync(backupPath, 'utf8');
    fs.writeFileSync(packagePath, originalPackage);
    fs.unlinkSync(backupPath);
    console.log('✅ package.json restaurado\n');
    
    // Paso 7: Organizar archivos de release
    console.log('📦 Paso 7: Organizando archivos de release...\n');
    const releaseDir = ensureReleaseDir();
    organizeBuilds(currentVersion, releaseDir);
    
    // Resumen final
    console.log('\n✨ ========================================');
    console.log('✨ Build Completado Exitosamente');
    console.log('✨ ========================================\n');
    console.log(`💻 Versión: ${currentVersion}`);
    console.log(`📂 Ejecutables en: electron-release/\n`);
    
    const files = fs.readdirSync(releaseDir).filter(f => f.includes(currentVersion));
    if (files.length > 0) {
      console.log('📋 Archivos generados:');
      files.forEach(file => {
        const filePath = path.join(releaseDir, file);
        if (fs.statSync(filePath).isFile()) {
          const sizeMB = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(2);
          console.log(`   - ${file} (${sizeMB} MB)`);
        }
      });
    }
    
    console.log('\n💡 Próximos pasos:');
    console.log('   1. Probar el ejecutable localmente');
    console.log('   2. Publicar actualización (auto-updater):');
    console.log('      node scripts/publish-electron-update.cjs');
    console.log('   3. Distribuir el instalador a usuarios\n');
    
    // Verificar si hay latest.yml para auto-updater
    const latestYml = path.join(releaseDir, 'latest.yml');
    if (fs.existsSync(latestYml)) {
      console.log('✅ Auto-updater configurado (latest.yml generado)\n');
    }
    
  } catch (error) {
    console.error('\n❌ Error durante el build:', error.message);
    
    // Restaurar package.json en caso de error
    const backupPath = path.join(__dirname, '../package.json.backup');
    if (fs.existsSync(backupPath)) {
      const packagePath = path.join(__dirname, '../package.json');
      const originalPackage = fs.readFileSync(backupPath, 'utf8');
      fs.writeFileSync(packagePath, originalPackage);
      fs.unlinkSync(backupPath);
      console.log('✅ package.json restaurado después del error\n');
    }
    
    console.log('\n💡 Soluciones posibles:');
    console.log('   1. Verifica que tengas Node.js y npm instalados');
    console.log('   2. Ejecuta: npm install');
    console.log('   3. Verifica que resources/icon.png exista');
    console.log('   4. Para builds multi-plataforma, necesitas la plataforma correspondiente\n');
    process.exit(1);
  }
}

// Ejecutar el build
buildElectron();
