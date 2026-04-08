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
      "Soy **Ayuda IA**. Puedes preguntarme cosas como:\n\n" +
      "- Donde puedo ver un parte de obra\n" +
      "- Como puedo crear un parte\n" +
      "- Que analiza el analisis economico\n" +
      "- Donde esta el inventario de una obra\n" +
      "- Como entrar en repasos o post-venta\n" +
      "- Como gestionar usuarios o abrir ajustes\n\n" +
      "Cuando exista una ruta real, te la dare con enlace directo.",
    read: true,
    created_at: now,
    from_user: { full_name: AI_HELP_USER_NAME },
    to_user: { full_name: "Tú" },
  };
}
