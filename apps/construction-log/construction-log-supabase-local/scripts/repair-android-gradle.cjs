const fs = require('fs');
const path = require('path');

function findMatchingBrace(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function removeAllBlocks(content, keyword) {
  let result = content;
  while (true) {
    const idx = result.indexOf(`${keyword} {`);
    if (idx === -1) break;
    const open = result.indexOf('{', idx);
    if (open === -1) break;
    const close = findMatchingBrace(result, open);
    if (close === -1) break;
    result = result.slice(0, idx) + result.slice(close + 1);
  }
  return result;
}

function getAndroidBlockBounds(text) {
  const androidStartKeyword = 'android {';
  const idx = text.indexOf(androidStartKeyword);
  if (idx === -1) return null;
  const braceOpen = text.indexOf('{', idx);
  const braceClose = findMatchingBrace(text, braceOpen);
  if (braceOpen === -1 || braceClose === -1) return null;
  return { startKeywordIdx: idx, openIdx: braceOpen, closeIdx: braceClose };
}

function ensureSigningConfigs(androidBlock) {
  if (androidBlock.includes('signingConfigs {')) return androidBlock;

  const prelude = `\n    def keystorePropertiesFile = rootProject.file("key.properties")\n    def keystoreProperties = new Properties()\n    if (keystorePropertiesFile.exists()) {\n        keystoreProperties.load(new FileInputStream(keystorePropertiesFile))\n    }\n\n    signingConfigs {\n        release {\n            if (keystorePropertiesFile.exists()) {\n                keyAlias keystoreProperties['keyAlias']\n                keyPassword keystoreProperties['keyPassword']\n                storeFile file(keystoreProperties['storeFile'])\n                storePassword keystoreProperties['storePassword']\n            }\n        }\n    }\n`;

  const insertPos = androidBlock.indexOf('{') + 1;
  return androidBlock.slice(0, insertPos) + prelude + androidBlock.slice(insertPos);
}

function insertDesiredBuildTypes(androidBlock) {
  const desired = `\n    buildTypes {\n        release {\n            signingConfig signingConfigs.release\n            minifyEnabled false\n            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'\n        }\n    }\n`;

  // Insert right before the closing brace of the android block
  const lastBrace = androidBlock.lastIndexOf('}');
  if (lastBrace !== -1) {
    return androidBlock.slice(0, lastBrace) + desired + androidBlock.slice(lastBrace);
  }
  return androidBlock + desired;
}

(function main() {
  const gradlePath = path.join(__dirname, '../android/app/build.gradle');
  if (!fs.existsSync(gradlePath)) {
    console.error('⚠️  No se encontró android/app/build.gradle. Ejecuta "npx cap sync android" primero.');
    process.exit(1);
  }

  const original = fs.readFileSync(gradlePath, 'utf8');
  const backupPath = gradlePath + '.bak';
  fs.writeFileSync(backupPath, original);

  // 1) Normalizar proguard default file
  let content = original.replace(/getDefaultProguardFile\('proguard-android\.txt'\)/g, "getDefaultProguardFile('proguard-android-optimize.txt')");

  // 2) Eliminar TODOS los bloques buildTypes en el archivo (haya donde estén)
  content = removeAllBlocks(content, 'buildTypes');

  // 3) Localizar bloque android
  const bounds = getAndroidBlockBounds(content);
  if (!bounds) {
    console.error('❌ No se pudo localizar el bloque android { ... } en build.gradle');
    process.exit(1);
  }

  const before = content.slice(0, bounds.startKeywordIdx);
  let androidBlock = content.slice(bounds.startKeywordIdx, bounds.closeIdx + 1);
  const after = content.slice(bounds.closeIdx + 1);

  // 4) Asegurar signingConfigs dentro de android
  androidBlock = ensureSigningConfigs(androidBlock);

  // 5) Insertar buildTypes cerca del final del bloque android
  androidBlock = insertDesiredBuildTypes(androidBlock);

  const finalContent = before + androidBlock + after;
  fs.writeFileSync(gradlePath, finalContent);

  console.log('✅ build.gradle reparado (buildTypes único dentro de android y firma configurada).');
  console.log('🗂️  Copia de seguridad creada en:', backupPath);
})();


