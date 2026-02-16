import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.partesdetrabajo.app',
  appName: 'Partes de Trabajo',
  webDir: 'dist',
  android: {
    permissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS'
    ],
    backgroundColor: '#1e3a5f',
    // Permitir mixed content para desarrollo
    allowMixedContent: true
  },
  ios: {
    contentInset: 'automatic'
  },
  plugins: {
    SplashScreen: {
      // NO mostrar splash nativo - usamos el HTML fallback
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: "#1e3a5f",
      showSpinner: false
    }
  },
  // Configuración del servidor - importante para producción
  server: {
    // En producción, usar los archivos locales del dist
    androidScheme: 'http',
    cleartext: true
  }
};

export default config;
