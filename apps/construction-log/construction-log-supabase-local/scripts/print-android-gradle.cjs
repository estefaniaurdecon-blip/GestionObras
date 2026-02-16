const fs = require('fs');
const path = require('path');

(function main() {
  const gradlePath = path.join(__dirname, '../android/app/build.gradle');
  const start = parseInt(process.argv[2] || '1', 10);
  const end = parseInt(process.argv[3] || '200', 10);

  if (!fs.existsSync(gradlePath)) {
    console.error('⚠️  No se encontró android/app/build.gradle. Ejecuta "npx cap sync android" primero.');
    process.exit(1);
  }

  const content = fs.readFileSync(gradlePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const pad = String(lines.length).length;

  console.log(`\n=== android/app/build.gradle (líneas ${start}-${Math.min(end, lines.length)}) ===`);
  for (let i = Math.max(1, start); i <= Math.min(end, lines.length); i++) {
    const num = String(i).padStart(pad, ' ');
    console.log(`${num}: ${lines[i - 1]}`);
  }
  console.log('=== fin ===\n');
})();
