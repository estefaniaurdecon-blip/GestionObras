const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Iniciando modo desarrollo con Electron...');

try {
  // Actualizar package.json temporalmente
  const packagePath = path.join(__dirname, '../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  // Backup
  fs.writeFileSync(
    path.join(__dirname, '../package.json.backup'), 
    JSON.stringify(packageJson, null, 2)
  );

  // Modificar para Electron
  packageJson.main = 'electron/main.js';
  packageJson.type = 'commonjs';
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));

  // Iniciar desarrollo
  const viteProcess = spawn('npm', ['run', 'dev'], { 
    stdio: 'inherit',
    shell: true 
  });

  // Esperar a que Vite esté listo y luego iniciar Electron
  setTimeout(() => {
    console.log('⚡ Iniciando Electron...');
    const electronProcess = spawn('npx', ['electron', '.'], { 
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, NODE_ENV: 'development' }
    });

    // Manejar cierre
    electronProcess.on('close', () => {
      console.log('🔚 Cerrando procesos...');
      viteProcess.kill();
      
      // Restaurar package.json
      const originalPackage = fs.readFileSync(
        path.join(__dirname, '../package.json.backup'), 
        'utf8'
      );
      fs.writeFileSync(packagePath, originalPackage);
      fs.unlinkSync(path.join(__dirname, '../package.json.backup'));
      
      process.exit(0);
    });
  }, 3000);

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}