const fs = require('fs');
const path = require('path');

// Leer package.json
const packagePath = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

// Obtener versión actual
const currentVersion = packageJson.version;
const versionParts = currentVersion.split('.').map(Number);

// Determinar tipo de incremento (patch, minor, major)
const bumpType = process.argv[2] || 'patch';

switch (bumpType) {
  case 'major':
    versionParts[0]++;
    versionParts[1] = 0;
    versionParts[2] = 0;
    break;
  case 'minor':
    versionParts[1]++;
    versionParts[2] = 0;
    break;
  case 'patch':
  default:
    versionParts[2]++;
    break;
}

const newVersion = versionParts.join('.');

// Actualizar package.json
packageJson.version = newVersion;
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');

// Actualizar .env con la nueva versión
const envPath = path.join(__dirname, '../.env');
let envContent = '';
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
  if (envContent.includes('VITE_APP_VERSION=')) {
    envContent = envContent.replace(/VITE_APP_VERSION=.*/g, `VITE_APP_VERSION=${newVersion}`);
  } else {
    envContent += `\nVITE_APP_VERSION=${newVersion}\n`;
  }
} else {
  envContent = `VITE_APP_VERSION=${newVersion}\n`;
}
fs.writeFileSync(envPath, envContent);

console.log(`✅ Versión actualizada: ${currentVersion} → ${newVersion}`);
console.log(`\nArchivos actualizados:`);
console.log(`  - package.json`);
console.log(`  - .env`);
console.log(`\nPara publicar esta versión:`);
console.log(`  1. Construye la aplicación: npm run build-electron (Windows) o npx cap build android (Android)`);
console.log(`  2. Sube el archivo a la pestaña "Actualizaciones" en la app`);
console.log(`  3. Completa los datos y publica la actualización`);
