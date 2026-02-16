module.exports = {
  appId: 'com.partesdetrabajo.app',
  productName: 'Sistema de Gestion de Obras',
  directories: {
    output: 'release',
    buildResources: 'resources',
  },
  files: [
    'dist/**/*',
    'electron/**/*',
    '!electron/preload.js',
    '!dist/**/*.map', // Excluir source maps
    '!dist/assets/**/*.md', // Excluir archivos markdown de assets
    '!**/*.log', // Excluir logs
    '!**/.DS_Store', // Excluir archivos de sistema Mac
  ],
  extraFiles: [
    {
      from: 'electron/preload.js',
      to: 'preload.js',
    },
  ],
  // Configuración de publicación para delta updates
  // Usar 'generic' permite servir desde cualquier servidor (Supabase Storage, S3, etc.)
  publish: {
    provider: 'generic',
    url: 'https://fcjmyylskklmfkogmmwt.supabase.co/storage/v1/object/public/app-updates',
    channel: 'latest',
  },
  // Generar archivos blockmap para actualizaciones diferenciales
  generateUpdatesFilesForAllChannels: true,
  asar: true, // Mantener compresión para reducir tamaño final
  asarUnpack: ['node_modules/@supabase/**/*'],
  compression: 'normal', // Usar compresión normal en lugar de maximum (más rápido)
  // Excluir archivos innecesarios de node_modules
  npmRebuild: false, // Ya se hace rebuild antes
  extraMetadata: {
    main: 'electron/main.js',
  },
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    icon: 'resources/icon.png',
    artifactName: 'Sistema-de-Gestion-de-Obras-Setup-${version}.${ext}',
    requestedExecutionLevel: 'asInvoker',
  },
  nsis: {
    // CRÍTICO: oneClick: true permite actualizaciones automáticas in-place
    oneClick: true,
    perMachine: false,
    allowElevation: true,
    // CRÍTICO: false asegura que siempre se instale en el mismo directorio
    allowToChangeInstallationDirectory: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Sistema de Gestion de Obras',
    installerIcon: 'resources/icon.ico',
    uninstallerIcon: 'resources/icon.ico',
    installerHeaderIcon: 'resources/icon.ico',
    packElevateHelper: true,
    // HABILITAR differential package para delta updates
    differentialPackage: true,
    // Configuración para actualizaciones automáticas
    deleteAppDataOnUninstall: false,
    runAfterFinish: true,
    // GUID único - garantiza que Windows reconozca como la misma app
    guid: 'f8c5e4d3-2a1b-4c9d-8e7f-6a5b4c3d2e1f',
    uninstallDisplayName: 'Sistema de Gestion de Obras',
    // Script personalizado para cerrar la app antes de actualizar
    include: 'installer-scripts/installer.nsh',
  },
  mac: {
    target: 'dmg',
    icon: 'resources/icon.png',
  },
  linux: {
    target: 'AppImage',
    icon: 'resources/icon.png',
  },
};
