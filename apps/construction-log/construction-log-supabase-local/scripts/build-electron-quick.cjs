const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('⚡ ========================================');
console.log('⚡ Build Rápido Electron (Sin Versión)');
console.log('⚡ ========================================\n');

async function quickBuild() {
  try {
    // Paso 1: Build web
    console.log('📦 Paso 1: Build web...\n');
    execSync('npm run build', { stdio: 'inherit' });
    console.log('\n✅ Build web completado\n');
    
    // Paso 2: Validar icono (electron-builder convertirá a ICO automáticamente)
    console.log('🎨 Paso 2: Validando icono...\n');
    try {
      execSync('node scripts/validate-icon.cjs', { stdio: 'inherit' });
    } catch (error) {
      console.log('⚠️  Problema con icono, continuando...\n');
    }

    // Paso 2.5: Generar icon.ico compatible con NSIS
    console.log('🎨 Paso 2.5: Generando icon.ico para instalador NSIS...\n');
    try {
      execSync('node scripts/convert-icon-to-ico.cjs', { stdio: 'inherit' });
    } catch (error) {
      console.log('⚠️  No se pudo generar icon.ico, el instalador usará el icono por defecto\n');
    }

    // Paso 3: Preparar package.json
    console.log('⚙️  Paso 3: Configurando Electron...\n');
    const packagePath = path.join(__dirname, '../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    
    // Backup
    const backupPath = path.join(__dirname, '../package.json.backup');
    fs.writeFileSync(backupPath, JSON.stringify(packageJson, null, 2));
    
    // Modificar
    packageJson.main = 'electron/main.js';
    packageJson.type = 'commonjs';
    
    // Asegurar que electron y electron-builder estén en devDependencies
    packageJson.devDependencies = packageJson.devDependencies || {};
    packageJson.dependencies = packageJson.dependencies || {};
    
    const devPackages = ['electron', 'electron-builder', 'concurrently', 'wait-on'];
    devPackages.forEach(pkg => {
      if (packageJson.dependencies[pkg]) {
        packageJson.devDependencies[pkg] = packageJson.dependencies[pkg];
        delete packageJson.dependencies[pkg];
      }
    });
    
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
    
    // Paso 4: Build Electron
    console.log('🔨 Paso 4: Construyendo ejecutable...\n');
    execSync('npx electron-builder --win --config electron-builder.config.js --dir', { 
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' }
    });
    
    // Paso 5: Restaurar package.json
    const originalPackage = fs.readFileSync(backupPath, 'utf8');
    fs.writeFileSync(packagePath, originalPackage);
    fs.unlinkSync(backupPath);
    
    console.log('\n✅ ========================================');
    console.log('✅ Build Rápido Completado');
    console.log('✅ ========================================\n');
    console.log('📂 Ejecutable en: release/win-unpacked/\n');
    console.log('💡 Para ejecutar:');
    console.log('   release/win-unpacked/Sistema de Gestion de Obras.exe\n');
    console.log('📝 Nota: Este build NO crea instalador (más rápido para pruebas)\n');
    console.log('🚀 Para build completo con instalador:');
    console.log('   node scripts/build-electron-complete.cjs\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    // Restaurar package.json
    const backupPath = path.join(__dirname, '../package.json.backup');
    if (fs.existsSync(backupPath)) {
      const packagePath = path.join(__dirname, '../package.json');
      const originalPackage = fs.readFileSync(backupPath, 'utf8');
      fs.writeFileSync(packagePath, originalPackage);
      fs.unlinkSync(backupPath);
    }
    
    process.exit(1);
  }
}

quickBuild();
