import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.partesdetrabajo.app',
  appName: 'Partes de Trabajo',
  webDir: 'dist',
  android: {
    backgroundColor: '#1e3a5f',
    // Permitir mixed content para desarrollo
    allowMixedContent: true
  },
  ios: {
    contentInset: 'automatic'
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      // Mantener el splash nativo hasta que React monte para evitar
      // pantallas negras/intermedias en Android al arrancar.
      launchShowDuration: 0,
      launchAutoHide: false,
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
