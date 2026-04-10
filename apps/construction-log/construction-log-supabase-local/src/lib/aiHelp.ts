import type { Message } from "@/types/notifications";

export const AI_HELP_USER_ID = "__ai_help__";
export const AI_HELP_USER_NAME = "Ayuda IA";

export function isAiHelpUserId(userId: string | null | undefined): boolean {
  return userId === AI_HELP_USER_ID;
}

export function createAiHelpWelcomeMessage(currentUserId: string): Message {
  const now = new Date().toISOString();
  return {
    id: `ai-help-welcome-${currentUserId}`,
    from_user_id: AI_HELP_USER_ID,
    to_user_id: currentUserId,
    message:
      "Soy **Ayuda IA**.\n\n" +
      "Puedo ayudarte a usar la app Android con respuestas más claras y directas.\n\n" +
      "Prueba con preguntas como:\n\n" +
      "1. ¿Dónde veo un parte de trabajo?\n" +
      "2. ¿Cómo creo un parte?\n" +
      "3. ¿Dónde está el inventario de una obra?\n" +
      "4. ¿Dónde veo las notificaciones?\n" +
      "5. ¿Cómo entro en la mensajería?\n\n" +
      "Si existe una ruta real dentro de la app, te la pondré como enlace.",
    read: true,
    created_at: now,
    from_user: { full_name: AI_HELP_USER_NAME },
    to_user: { full_name: "Tú" },
  };
}
