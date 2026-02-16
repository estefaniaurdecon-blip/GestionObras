const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Iniciando construcción de la aplicación Electron...');

try {
  // 0. Incrementar versión automáticamente
  console.log('📌 Incrementando versión automáticamente...');
  execSync('node scripts/version-bump.cjs patch', { stdio: 'inherit' });

  // 1. Construir la aplicación web
  console.log('📦 Construyendo la aplicación web...');
  execSync('npm run build', { stdio: 'inherit' });

  // 2. Actualizar package.json temporalmente para Electron
  const packagePath = path.join(__dirname, '../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  // Backup del package.json original
  fs.writeFileSync(
    path.join(__dirname, '../package.json.backup'), 
    JSON.stringify(packageJson, null, 2)
  );

  // 2.5. Validar icono PNG (electron-builder convertirá a ICO automáticamente)
  console.log('🎨 Validando icono...');
  try {
    execSync('node scripts/validate-icon.cjs', { stdio: 'inherit' });
    console.log('\n✅ Icono validado correctamente');
  } catch (error) {
    console.warn('⚠️ Problema con el icono:', error.message);
    console.warn('   Se usará icono por defecto de Electron');
  }

  // 2.6. Generar icon.ico compatible con NSIS
  console.log('🎨 Generando icon.ico para instalador NSIS...');
  try {
    execSync('node scripts/convert-icon-to-ico.cjs', { stdio: 'inherit' });
  } catch (error) {
    console.warn('⚠️ No se pudo generar icon.ico, el instalador usará el icono por defecto');
  }

  // Modificar package.json para Electron
  packageJson.main = 'electron/main.js';
  packageJson.type = 'commonjs'; // Electron necesita CommonJS
  packageJson.description = packageJson.description || 'Construction Log - Aplicación de registro de construcción';
  packageJson.author = packageJson.author || 'By Tony Bautista';
  // Forzar versión visible en el instalador si está en 0.0.0 o no definida
  packageJson.version = packageJson.version && packageJson.version !== '0.0.0' ? packageJson.version : '2.0.0';

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
    // Si no está en ningún lado, agregar versión por defecto
    if (!packageJson.devDependencies[pkg]) {
      const defaultVersions = {
        'electron': '^38.2.0',
        'electron-builder': '^25.1.8',
        'concurrently': '^9.2.1',
        'wait-on': '^9.0.1'
      };
      packageJson.devDependencies[pkg] = defaultVersions[pkg];
    }
  });
  
  packageJson.scripts = {
    ...packageJson.scripts,
    'electron': 'electron .',
    'electron-dev': 'concurrently "npm run dev" "wait-on http://localhost:8080 && NODE_ENV=development electron ."',
    'dist': 'electron-builder -c electron-builder.config.js',
    'dist:win': 'electron-builder --win -c electron-builder.config.js',
    'dist:mac': 'electron-builder --mac -c electron-builder.config.js',
    'dist:linux': 'electron-builder --linux -c electron-builder.config.js'
  };

  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));

  // 3. Construir el ejecutable
  console.log('⚡ Construyendo el ejecutable...');
  execSync('npx electron-builder --win --config electron-builder.config.js', { stdio: 'inherit' });

  // 3.5. Mover archivos de dist/ a release...
  console.log('📦 Moviendo archivos a la carpeta release...');
  
  // Crear carpeta release si no existe
  const releaseDir = path.join(__dirname, '../release');
  if (!fs.existsSync(releaseDir)) {
    fs.mkdirSync(releaseDir, { recursive: true });
  }
  
  // Copiar artefactos desde posibles carpetas de salida a release/
  const outDirs = [path.join(__dirname, '../release'), path.join(__dirname, '../dist')];
  for (const dir of outDirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file.endsWith('.exe') || file.endsWith('.blockmap')) {
          const srcPath = path.join(dir, file);
          const destPath = path.join(releaseDir, file);
          if (srcPath !== destPath) {
            fs.copyFileSync(srcPath, destPath);
          }
        }
      }
    }
  }

  // 4. Restaurar package.json original
  const originalPackage = fs.readFileSync(
    path.join(__dirname, '../package.json.backup'), 
    'utf8'
  );
  fs.writeFileSync(packagePath, originalPackage);
  fs.unlinkSync(path.join(__dirname, '../package.json.backup'));

  console.log('✅ ¡Aplicación construida exitosamente!');
  console.log(`📦 Versión: ${packageJson.version}`);
  console.log('📁 El ejecutable se encuentra en la carpeta "release"');
  console.log(`📄 Nombre: Partes-de-Trabajo Setup ${packageJson.version}.exe`);

} catch (error) {
  console.error('❌ Error durante la construcción:', error.message);
  
  // Restaurar package.json en caso de error
  const backupPath = path.join(__dirname, '../package.json.backup');
  if (fs.existsSync(backupPath)) {
    const originalPackage = fs.readFileSync(backupPath, 'utf8');
    fs.writeFileSync(path.join(__dirname, '../package.json'), originalPackage);
    fs.unlinkSync(backupPath);
  }
  
  process.exit(1);
}
