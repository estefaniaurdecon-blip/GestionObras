const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const androidDir = path.join(projectRoot, 'android');
const skipAssemble = process.argv.includes('--skip-assemble');
const isWindows = process.platform === 'win32';

function log(message) {
  console.log(`[android:migration:check] ${message}`);
}

function quoteShellArg(arg) {
  if (/^[a-zA-Z0-9_./:=-]+$/.test(arg)) return arg;
  return `"${String(arg).replace(/"/g, '\\"')}"`;
}

function run(command, args, options = {}) {
  const cwd = options.cwd || projectRoot;
  const env = options.env || process.env;
  const commandLine = [command, ...args].map(quoteShellArg).join(' ');

  const result = spawnSync(commandLine, {
    cwd,
    env,
    stdio: 'inherit',
    shell: true,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function ensurePathExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label} not found: ${targetPath}`);
  }
}

function findFirstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function detectJavaHome() {
  const envJavaHome = process.env.JAVA_HOME;
  const localAppData = process.env.LOCALAPPDATA || '';

  return findFirstExistingPath([
    envJavaHome,
    'C:\\Program Files\\Android\\Android Studio\\jbr',
    'C:\\Program Files\\Android\\Android Studio\\jre',
    localAppData ? path.join(localAppData, 'Programs', 'Android Studio', 'jbr') : null,
  ]);
}

function detectAndroidSdk() {
  const localAppData = process.env.LOCALAPPDATA || '';

  return findFirstExistingPath([
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    localAppData ? path.join(localAppData, 'Android', 'Sdk') : null,
  ]);
}

function createBuildEnv(javaHome, androidSdk) {
  const currentPath = process.env.Path || process.env.PATH || '';
  const prependEntries = [];
  if (javaHome) prependEntries.push(path.join(javaHome, 'bin'));
  if (androidSdk) prependEntries.push(path.join(androidSdk, 'platform-tools'));

  const mergedPath = prependEntries.length > 0
    ? `${prependEntries.join(path.delimiter)}${path.delimiter}${currentPath}`
    : currentPath;

  return {
    ...process.env,
    JAVA_HOME: javaHome || process.env.JAVA_HOME,
    ANDROID_HOME: androidSdk || process.env.ANDROID_HOME,
    ANDROID_SDK_ROOT: androidSdk || process.env.ANDROID_SDK_ROOT,
    Path: mergedPath,
    PATH: mergedPath,
  };
}

function writeLocalProperties(androidSdk) {
  if (!androidSdk) return;
  ensurePathExists(androidDir, 'Android directory');

  const localPropertiesPath = path.join(androidDir, 'local.properties');
  const escapedSdk = androidSdk.replace(/\\/g, '\\\\');
  const content = `sdk.dir=${escapedSdk}\n`;

  if (fs.existsSync(localPropertiesPath)) {
    const current = fs.readFileSync(localPropertiesPath, 'utf8');
    if (current.includes(`sdk.dir=${escapedSdk}`)) {
      log('local.properties already aligned with detected Android SDK');
      return;
    }
  }

  fs.writeFileSync(localPropertiesPath, content, 'utf8');
  log(`local.properties updated (${localPropertiesPath})`);
}

function assertAndroidScaffold() {
  const requiredPaths = [
    path.join(androidDir, 'gradlew'),
    path.join(androidDir, 'gradlew.bat'),
    path.join(androidDir, 'app', 'build.gradle'),
    path.join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml'),
  ];

  for (const targetPath of requiredPaths) {
    ensurePathExists(targetPath, 'Required Android file');
  }

  log('Android scaffold check passed');
}

function assertSyncedAssets() {
  const requiredPaths = [
    path.join(androidDir, 'app', 'src', 'main', 'assets', 'public', 'index.html'),
    path.join(androidDir, 'app', 'src', 'main', 'assets', 'capacitor.config.json'),
  ];

  for (const targetPath of requiredPaths) {
    ensurePathExists(targetPath, 'Synced asset');
  }

  log('Android synced assets check passed');
}

function runAssembleDebug(env) {
  if (skipAssemble) {
    log('Skipping assembleDebug (--skip-assemble)');
    return;
  }

  const gradleCommand = isWindows ? 'gradlew.bat' : './gradlew';
  run(gradleCommand, ['assembleDebug'], { cwd: androidDir, env });
  log('assembleDebug completed');
}

function main() {
  log('Starting Android migration readiness check');
  assertAndroidScaffold();

  const javaHome = detectJavaHome();
  const androidSdk = detectAndroidSdk();

  if (!javaHome) {
    throw new Error(
      'JAVA_HOME not found. Install Android Studio JDK or set JAVA_HOME before running this check.',
    );
  }
  if (!androidSdk) {
    throw new Error(
      'Android SDK not found. Set ANDROID_HOME or install Android SDK (usually at %LOCALAPPDATA%\\Android\\Sdk).',
    );
  }

  log(`Using JAVA_HOME=${javaHome}`);
  log(`Using ANDROID_HOME=${androidSdk}`);

  writeLocalProperties(androidSdk);
  const buildEnv = createBuildEnv(javaHome, androidSdk);
  const npxCommand = 'npx';
  const npmCommand = 'npm';

  run(npxCommand, ['cap', 'doctor'], { env: buildEnv });
  run(npmCommand, ['run', 'build'], { env: buildEnv });
  run(npxCommand, ['cap', 'sync', 'android'], { env: buildEnv });
  assertSyncedAssets();
  runAssembleDebug(buildEnv);

  log('All Android migration checks passed');
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[android:migration:check] FAILED: ${message}`);
  process.exit(1);
}
