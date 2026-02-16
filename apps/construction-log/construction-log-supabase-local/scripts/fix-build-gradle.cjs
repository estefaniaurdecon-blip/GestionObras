const fs = require('fs');
const path = require('path');

(function main() {
  const gradlePath = path.join(__dirname, '../android/app/build.gradle');
  if (!fs.existsSync(gradlePath)) {
    console.error('⚠️  No se encontró android/app/build.gradle');
    process.exit(1);
  }

  const original = fs.readFileSync(gradlePath, 'utf8');
  const backupPath = gradlePath + '.backup2';
  fs.writeFileSync(backupPath, original);

  // Crear el contenido correcto del archivo
  const fixedContent = `apply plugin: 'com.android.application'

android {
    def keystorePropertiesFile = rootProject.file("key.properties")
    def keystoreProperties = new Properties()
    if (keystorePropertiesFile.exists()) {
        keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
    }

    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
            }
        }
    }

    namespace "com.lovable.constructionlog"
    compileSdk rootProject.ext.compileSdkVersion
    
    defaultConfig {
        applicationId "com.lovable.constructionlog"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "0.0.4"
        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
        aaptOptions {
             // Files and dirs to omit from the packaged assets dir, modified to accommodate modern web apps.
             // Default: https://android.googlesource.com/platform/frameworks/base/+/282e181b58cf72b6ca770dc7ca5f91f135444502/tools/aapt/AaptAssets.cpp#61
            ignoreAssetsPattern '!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~'
        }
    }

    // Configuración personalizada del nombre del APK y metadatos
    applicationVariants.all { variant ->
        variant.outputs.all { output ->
            def version = variant.versionName
            def buildType = variant.buildType.name
            outputFileName = "Partes-de-Trabajo-\${version}-\${buildType}.apk"
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}

repositories {
    flatDir{
        dirs '../capacitor-cordova-android-plugins/src/main/libs', 'libs'
    }
}

dependencies {
    implementation fileTree(include: ['*.jar'], dir: 'libs')
    implementation "androidx.appcompat:appcompat:$androidxAppCompatVersion"
    implementation "androidx.coordinatorlayout:coordinatorlayout:$androidxCoordinatorLayoutVersion"
    implementation "androidx.core:core-splashscreen:$coreSplashScreenVersion"
    implementation project(':capacitor-android')
    testImplementation "junit:junit:$junitVersion"
    androidTestImplementation "androidx.test.ext:junit:$androidxJunitVersion"
    androidTestImplementation "androidx.test.espresso:espresso-core:$androidxEspressoCoreVersion"
    implementation project(':capacitor-cordova-android-plugins')
}

apply from: 'capacitor.build.gradle'

try {
    def servicesJSON = file('google-services.json')
    if (servicesJSON.text) {
        apply plugin: 'com.google.gms.google-services'
    }
} catch(Exception e) {
    logger.info("google-services.json not found, google-services plugin not applied. Push Notifications won't work")
}
`;

  fs.writeFileSync(gradlePath, fixedContent);
  console.log('✅ build.gradle completamente reconstruido y corregido');
  console.log('🗂️  Copia de seguridad en:', backupPath);
})();
