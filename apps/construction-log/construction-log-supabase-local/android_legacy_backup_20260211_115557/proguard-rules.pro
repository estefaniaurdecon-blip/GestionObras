# Reglas ProGuard para Capacitor y plugins

# Mantener todas las clases de Capacitor
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.** { *; }

# Mantener plugins de Capacitor
-keep class com.capacitorjs.plugins.** { *; }

# Mantener WebView JavaScript interfaces
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Mantener clases de la app
-keep class com.partesdetrabajo.app.** { *; }

# No ofuscar nombres de métodos para debugging
-keepattributes SourceFile,LineNumberTable

# Mantener anotaciones
-keepattributes *Annotation*

# Mantener serialización JSON
-keepclassmembers class * {
    public <init>();
}

# Evitar warnings de librerías
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-dontwarn org.conscrypt.**
