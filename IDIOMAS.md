# Guia de internacionalizacion (i18n)

> Referencia unica de endpoints: `documentacion/ENDPOINTS_UNIFICADOS.md`.

## Objetivo

Unificar la estrategia de idiomas en frontend y backend para evitar textos
hardcodeados y facilitar la ampliacion futura (por ejemplo, anadir `fr`).

## Recomendacion de arquitectura

1. Frontend:
   - Usar `react-i18next`.
   - Detectar idioma del navegador.
   - Permitir cambio manual en ajustes.
   - Persistir la preferencia en backend.
2. Backend:
   - Guardar `language` en el usuario.
   - Usar ese idioma en emails, notificaciones y mensajes de error.
   - Aplicar respaldo con `Accept-Language` si el usuario no tiene idioma guardado.

## Frontend (React)

Instalacion:

```bash
npm install i18next react-i18next i18next-browser-languagedetector
```

Configuracion base (`i18n.ts`):

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
    fallbackLng: "es",
    supportedLngs: ["es", "en"],
    resources: {
      es: { translation: es },
      en: { translation: en },
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
```

Estructura recomendada:

```text
src/
  locales/
    es.json
    en.json
```

Uso en componentes:

```tsx
import { useTranslation } from "react-i18next";

function Perfil() {
  const { t } = useTranslation();
  return <h1>{t("settings.language")}</h1>;
}
```

Cambio de idioma y persistencia:

```tsx
import i18n from "i18next";

const cambiarIdioma = async (lang: "es" | "en") => {
  await i18n.changeLanguage(lang);
  await api.patch("<ruta perfil; ver ENDPOINTS_UNIFICADOS>", { language: lang });
};
```

## Backend (FastAPI)

Modelo y esquema:

```py
class User(Base):
    ...
    language = Column(String, default="es")
```

```py
class UserUpdate(BaseModel):
    language: str | None = None
```

Resolucion de idioma:

```py
def get_language(request: Request, user: User | None = None) -> str:
    if user and user.language:
        return user.language
    return request.headers.get("accept-language", "es")[:2]
```

Nota sobre rutas:
- Para actualizar perfil y otras rutas, consultar siempre
  `documentacion/ENDPOINTS_UNIFICADOS.md`.

## Buenas practicas

- Usar claves semanticas (`auth.login.title`, `common.save`).
- Agrupar traducciones por dominio funcional (`auth.*`, `profile.*`, `errors.*`).
- Evitar concatenar textos traducidos en componentes.
- Mantener paridad de claves entre `es.json` y `en.json`.

## Que evitar

- Guardar textos de UI traducidos en base de datos.
- Mezclar logica de idioma en muchos puntos sin capa comun.
- Duplicar catalogos de textos fuera de `locales/*.json`.
