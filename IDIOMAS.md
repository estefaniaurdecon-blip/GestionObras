## 🧠 Enfoque recomendado (high level

1. **Frontend (React)**

   * Manejar traducciones con una librería i18n (no “a mano”).
   * Detectar idioma del navegador automáticamente.
   * Permitir cambiar idioma desde *Settings*.
   * Guardar el idioma elegido (localStorage + backend).

2. **Backend (FastAPI)**

   * Guardar `language` en el modelo `User`.
   * Usar ese idioma para:

     * Emails
     * Mensajes de error
     * Respuestas internacionalizadas (si aplica)
   * Fallback al header `Accept-Language`.

---

## 🧩 FRONTEND (React)

### 1️⃣ Usa `react-i18next` (estándar de facto)

```bash
npm install i18next react-i18next i18next-browser-languagedetector
```

### 2️⃣ Configuración básica (`i18n.ts`)

```ts
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import es from "./locales/es.json";
import en from "./locales/en.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: ["en", "es"],
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
```

📁 Estructura recomendada:

```
src/
 └─ locales/
     ├─ en.json
     └─ es.json
```

---

### 3️⃣ Uso en componentes

```tsx
import { useTranslation } from "react-i18next";

function Profile() {
  const { t } = useTranslation();

  return <h1>{t("settings.language")}</h1>;
}
```

---

### 4️⃣ Selector de idioma en Settings

```tsx
import i18n from "i18next";

const changeLanguage = async (lang: string) => {
  i18n.changeLanguage(lang);

  // Persistir en backend
  await api.put("/users/me", { language: lang });
};
```

---

### 5️⃣ Detección automática del navegador

`i18next-browser-languagedetector` ya detecta:

* localStorage
* navegador
* cookie

👉 Si el usuario **no tiene idioma guardado**, se usará el del navegador.

---

## 🧩 BACKEND (FastAPI)

### 1️⃣ Añade `language` al modelo User

```py
class User(Base):
    ...
    language = Column(String, default="en")
```

Y en el schema:

```py
class UserUpdate(BaseModel):
    language: str | None = None
```

---

### 2️⃣ Endpoint `/users/me`

```py
@router.put("/users/me")
def update_user_me(
    user_in: UserUpdate,
    current_user: User = Depends(get_current_user),
):
    if user_in.language:
        current_user.language = user_in.language
    db.commit()
    return current_user
```

---

### 3️⃣ Leer idioma desde el request

Orden recomendado:

1. `current_user.language`
2. Header `Accept-Language`
3. Default (`en`)

```py
def get_language(
    request: Request,
    user: User | None = None,
):
    if user and user.language:
        return user.language
    return request.headers.get("accept-language", "en")[:2]
```

---

### 4️⃣ (Opcional) Traducciones en backend

Si necesitas **emails, errores, notificaciones**, usa `gettext` o `babel`.

Ejemplo rápido con `gettext`:

```py
import gettext

translations = gettext.translation(
    "messages", localedir="locales", languages=[lang], fallback=True
)
_ = translations.gettext

raise HTTPException(status_code=400, detail=_("Invalid credentials"))
```

---

## 🧩 Qué NO recomiendo

❌ Guardar traducciones en la base de datos
❌ Traducir textos largos en backend para UI
❌ Tener lógica de idioma solo en backend

---

## ✅ Resumen final

✔ **React**: `react-i18next`
✔ **Detección automática**: navegador
✔ **Settings**: selector + persistencia
✔ **Backend**: guarda `user.language`
✔ **Fallback**: `Accept-Language → en`

# Ejemplos de archivos de idiomas

Buena pregunta — ahí está la clave de que el i18n sea **mantenible** 👍
Te muestro **cómo estructurar** `es.json` / `en.json`, con ejemplos reales y buenas prácticas.

---

## 🧱 Estructura recomendada

La idea es:

* **Claves estables**
* **Anidado por dominio funcional**
* **Sin textos “hardcodeados” en React**

### 📁 `locales/en.json`

```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "loading": "Loading..."
  },

  "auth": {
    "login": {
      "title": "Sign in",
      "email": "Email",
      "password": "Password",
      "submit": "Sign in",
      "error": "Invalid email or password"
    },
    "logout": "Log out"
  },

  "settings": {
    "title": "Settings",
    "language": "Language",
    "languageOptions": {
      "en": "English",
      "es": "Spanish"
    }
  },

  "profile": {
    "title": "Profile",
    "name": "Name",
    "email": "Email"
  },

  "errors": {
    "required": "This field is required",
    "invalidEmail": "Invalid email address",
    "server": "Unexpected server error"
  }
}
```

---

### 📁 `locales/es.json`

```json
{
  "common": {
    "save": "Guardar",
    "cancel": "Cancelar",
    "delete": "Eliminar",
    "loading": "Cargando..."
  },

  "auth": {
    "login": {
      "title": "Iniciar sesión",
      "email": "Correo electrónico",
      "password": "Contraseña",
      "submit": "Entrar",
      "error": "Correo o contraseña incorrectos"
    },
    "logout": "Cerrar sesión"
  },

  "settings": {
    "title": "Configuración",
    "language": "Idioma",
    "languageOptions": {
      "en": "Inglés",
      "es": "Español"
    }
  },

  "profile": {
    "title": "Perfil",
    "name": "Nombre",
    "email": "Correo electrónico"
  },

  "errors": {
    "required": "Este campo es obligatorio",
    "invalidEmail": "Correo electrónico inválido",
    "server": "Error inesperado del servidor"
  }
}
```

---

## 🧩 Uso en React

### Acceso a claves simples

```tsx
t("common.save")
```

### Acceso a claves anidadas

```tsx
t("auth.login.title")
```

---

## 🔁 Textos dinámicos (interpolación)

### JSON

```json
"welcome": "Welcome, {{name}}!"
```

```json
"welcome": "¡Bienvenido, {{name}}!"
```

### React

```tsx
t("welcome", { name: user.name })
```

---

## 🔢 Plurales (muy importante)

### JSON

```json
"notifications": "{{count}} notification",
"notifications_plural": "{{count}} notifications"
```

```json
"notifications": "{{count}} notificación",
"notifications_plural": "{{count}} notificaciones"
```

### React

```tsx
t("notifications", { count: notifications.length })
```

---

## 🚀 Buenas prácticas clave

### ✅ Claves SEMÁNTICAS (no texto)

❌ `"save": "Save button"`
✅ `"save": "Save"`

---

### ✅ Agrupa por feature

```
auth.*
settings.*
profile.*
```

---

### ✅ Usa `common.*` para reutilizables

* save
* cancel
* yes / no
* loading

---

### ❌ No concatenes strings

```tsx
// ❌
t("common.save") + " " + t("profile.title")
```

Usa frases completas.

---

## 🛠️ Extra (recomendado): typing con TypeScript

Puedes generar tipos automáticamente:

```bash
npm install i18next-resources-for-ts
```

Evita errores como:

```tsx
t("settngs.langauge") // typo 😵
```

---

## 🧠 Regla de oro

> **Si mañana añades francés (`fr.json`) y no tocas React, lo hiciste bien.**
