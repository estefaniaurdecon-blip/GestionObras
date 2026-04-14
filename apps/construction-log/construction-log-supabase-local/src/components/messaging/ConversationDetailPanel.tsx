import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Send,
  ArrowLeft,
  Check,
  CheckCheck,
  Paperclip,
  Trash2,
  X,
  Download,
  FileText,
  ImageIcon,
  Mic,
  Building2,
  Loader2,
  UserCircle2,
  Bot,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { ActiveWorkConversationContext } from "@/components/chatCenterContext";
import { isAiHelpUserId } from "@/lib/aiHelp";
import type { Message } from "@/types/notifications";
import type { ProjectConversationMessageApi } from "@/integrations/api/client";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useNavigate } from "react-router-dom";

const IMAGE_EXTS = /\.(jpg|jpeg|png|gif|webp)$/i;
const AUDIO_EXTS = /\.(webm|mp3|m4a|ogg|wav|aac)$/i;
const isImageFile = (name: string) => IMAGE_EXTS.test(name);
const isAudioFile = (name: string) => AUDIO_EXTS.test(name);
const fmtDuration = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

function nameColor(id: string): string {
  const colors = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-violet-500",
    "bg-cyan-500",
    "bg-pink-500",
    "bg-teal-500",
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

// ---------- Shared file type used by useSharedFiles ----------
interface SharedFile {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  from_user_id: string;
  to_user_id: string;
  work_report_id?: string;
  message?: string;
  downloaded: boolean;
  created_at: string;
  from_user?: { full_name: string };
  to_user?: { full_name: string };
}

interface SelectedUser {
  id: string;
  full_name: string;
}

export interface ConversationDetailPanelProps {
  currentUserId: string | null;
  currentUserName: string | undefined;
  selectedUser: SelectedUser | undefined;
  selectedWorkConversation: ActiveWorkConversationContext | null;
  activeWorkContext: ActiveWorkConversationContext | null;
  isUserOnline: (userId: string) => boolean;
  // Direct messages
  messages: Message[];
  sendMessage: (toUserId: string, message: string, workReportId?: string, toUserName?: string) => Promise<void>;
  // Project conversation
  projectConversationMessages: ProjectConversationMessageApi[];
  projectConversationParticipantCount: number;
  loadingProjectConversation: boolean;
  sendingProjectConversation: boolean;
  projectConversationError: string | null;
  sendProjectConversationMessage: (message: string) => Promise<unknown>;
  aiHelpMessages: Message[];
  sendingAiHelp: boolean;
  sendAiHelpMessage: (message: string) => Promise<void>;
  // Shared files
  sentFiles: SharedFile[];
  receivedFiles: SharedFile[];
  shareFile: (file: File, toUserId: string, message?: string, workReportId?: string, toUserName?: string) => Promise<void>;
  getFileBlob: (file: SharedFile) => Promise<Blob>;
  downloadFile: (file: SharedFile) => Promise<void>;
  // Navigation
  onBack: () => void;
}

export function ConversationDetailPanel({
  currentUserId,
  currentUserName,
  selectedUser,
  selectedWorkConversation,
  activeWorkContext,
  isUserOnline,
  messages,
  sendMessage,
  projectConversationMessages,
  projectConversationParticipantCount,
  loadingProjectConversation,
  sendingProjectConversation,
  projectConversationError,
  sendProjectConversationMessage,
  aiHelpMessages,
  sendingAiHelp,
  sendAiHelpMessage,
  sentFiles,
  receivedFiles,
  shareFile,
  getFileBlob,
  downloadFile,
  onBack,
}: ConversationDetailPanelProps) {
  const navigate = useNavigate();
  const isWorkConversationSelected = selectedWorkConversation !== null;
  const isAiHelpConversation = Boolean(selectedUser && isAiHelpUserId(selectedUser.id));
  const hasActiveConversation = Boolean(selectedUser || selectedWorkConversation);

  const [text, setText] = useState("");
  const [isSharingFile, setIsSharingFile] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Image/audio preview state
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});
  const imagePreviewUrls = useRef<Record<string, string>>({});
  const [audioPreviews, setAudioPreviews] = useState<Record<string, string>>({});
  const audioPreviewUrls = useRef<Record<string, string>>({});

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    const imageUrls = imagePreviewUrls.current;
    const audioUrls = audioPreviewUrls.current;
    return () => {
      Object.values(imageUrls).forEach(URL.revokeObjectURL);
      Object.values(audioUrls).forEach(URL.revokeObjectURL);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
    };
  }, []);

  // Load image previews for files in the active conversation
  useEffect(() => {
    if (!selectedUser?.id || !currentUserId) return;
    const uid = selectedUser.id;
    const allFiles = [...sentFiles, ...receivedFiles].filter(
      (f) =>
        isImageFile(f.file_name) &&
        ((f.from_user_id === currentUserId && f.to_user_id === uid) ||
          (f.to_user_id === currentUserId && f.from_user_id === uid)),
    );
    for (const f of allFiles) {
      if (imagePreviewUrls.current[f.id]) continue;
      getFileBlob(f)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          imagePreviewUrls.current[f.id] = url;
          setImagePreviews((prev) => ({ ...prev, [f.id]: url }));
        })
        .catch(() => {});
    }
  }, [selectedUser?.id, currentUserId, getFileBlob, sentFiles, receivedFiles]);

  // Load audio previews
  useEffect(() => {
    if (!selectedUser?.id || !currentUserId) return;
    const uid = selectedUser.id;
    const allFiles = [...sentFiles, ...receivedFiles].filter(
      (f) =>
        isAudioFile(f.file_name) &&
        ((f.from_user_id === currentUserId && f.to_user_id === uid) ||
          (f.to_user_id === currentUserId && f.from_user_id === uid)),
    );
    for (const f of allFiles) {
      if (audioPreviewUrls.current[f.id]) continue;
      getFileBlob(f)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          audioPreviewUrls.current[f.id] = url;
          setAudioPreviews((prev) => ({ ...prev, [f.id]: url }));
        })
        .catch(() => {});
    }
  }, [selectedUser?.id, currentUserId, getFileBlob, sentFiles, receivedFiles]);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (listRef.current) {
        const scrollElement = listRef.current.querySelector("[data-radix-scroll-area-viewport]");
        if (scrollElement) scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }, 100);
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    if (hasActiveConversation) scrollToBottom();
  }, [
    hasActiveConversation,
    messages.length,
    aiHelpMessages.length,
    sentFiles.length,
    receivedFiles.length,
    projectConversationMessages.length,
  ]);

  // ---------- Recording ----------
  const startRecording = async () => {
    if (!selectedUser) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      setRecordingDuration(0);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (audioChunksRef.current.length === 0) return;
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || "audio/webm" });
        const ext = (mediaRecorder.mimeType || "").includes("webm") ? "webm" : "ogg";
        const audioFile = new File([blob], `nota_${Date.now()}.${ext}`, { type: blob.type });
        setIsSharingFile(true);
        try {
          await shareFile(audioFile, selectedUser.id, undefined, undefined, selectedUser.full_name);
          scrollToBottom();
        } finally {
          setIsSharingFile(false);
        }
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      recordingTimerRef.current = window.setInterval(() => setRecordingDuration((d) => d + 1), 1000);
    } catch {
      toast.error("No se pudo acceder al micrófono");
    }
  };

  const stopRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  // ---------- Send ----------
  const handleSend = useCallback(async () => {
    if (!text.trim()) return;
    const msg = text.trim();
    setText("");
    try {
      if (selectedWorkConversation) {
        await sendProjectConversationMessage(msg);
      } else if (isAiHelpConversation) {
        await sendAiHelpMessage(msg);
      } else if (selectedUser) {
        await sendMessage(selectedUser.id, msg, undefined, selectedUser.full_name);
      } else {
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      toast.error("Error al enviar mensaje", { description: message });
      setText(msg);
      return;
    }
    scrollToBottom();
  }, [isAiHelpConversation, selectedUser, selectedWorkConversation, sendAiHelpMessage, sendMessage, sendProjectConversationMessage, text]);

  const handleFileShare = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedUser) return;
    setIsSharingFile(true);
    try {
      await shareFile(file, selectedUser.id, undefined, undefined, selectedUser.full_name);
      toast.success("Archivo compartido exitosamente");
      scrollToBottom();
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      toast.error("Error al compartir archivo");
    } finally {
      setIsSharingFile(false);
    }
  };

  const handleAiHelpLink = useCallback(
    (href?: string) => {
      if (!href) return;
      if (href.startsWith("#/settings/help")) {
        const parsedHref = href.startsWith("#") ? href.slice(1) : href;
        const url = new URL(parsedHref, window.location.origin);
        const nextParams = new URLSearchParams({ tab: "help" });
        const legacyHelpTab = url.searchParams.get("tab");
        if (legacyHelpTab === "features" || legacyHelpTab === "faq" || legacyHelpTab === "chat") {
          nextParams.set("helpTab", legacyHelpTab);
        }
        navigate(`/settings?${nextParams.toString()}`);
        return;
      }
      if (href.startsWith("#/")) {
        navigate(href.slice(1));
        return;
      }
      if (href.startsWith("/")) {
        navigate(href);
        return;
      }
      if (/^https?:\/\//i.test(href)) {
        window.open(href, "_blank", "noopener,noreferrer");
      }
    },
    [navigate],
  );

  // ---------- Combined timeline ----------
  const combinedTimeline = useMemo(() => {
    if (isAiHelpConversation) return [];
    if (!selectedUser || !currentUserId) return [];
    const uid = selectedUser.id;
    const userMessages = messages
      .filter(
        (m) =>
          (m.from_user_id === currentUserId && m.to_user_id === uid) ||
          (m.to_user_id === currentUserId && m.from_user_id === uid),
      )
      .map((m) => ({ type: "message" as const, data: m, timestamp: new Date(m.created_at).getTime() }));

    const userFiles = [...sentFiles, ...receivedFiles]
      .filter(
        (f) =>
          (f.from_user_id === currentUserId && f.to_user_id === uid) ||
          (f.to_user_id === currentUserId && f.from_user_id === uid),
      )
      .map((f) => ({ type: "file" as const, data: f, timestamp: new Date(f.created_at).getTime() }));

    return [...userMessages, ...userFiles].sort((a, b) => a.timestamp - b.timestamp);
  }, [isAiHelpConversation, selectedUser, currentUserId, messages, sentFiles, receivedFiles]);

  // ---------- Render ----------
  return (
    <div className="flex flex-col min-h-0 h-full border rounded-lg overflow-hidden bg-white">
      {/* Header */}
      <div className="p-3 border-b flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} title="Volver">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          {isWorkConversationSelected ? (
            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100">
              <Building2 className="h-4 w-4 text-blue-600" />
            </div>
          ) : isAiHelpConversation ? (
            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-amber-100">
              <Bot className="h-4 w-4 text-amber-700" />
            </div>
          ) : selectedUser ? (
            <Avatar className="h-8 w-8">
              <AvatarFallback className={`${nameColor(selectedUser.id)} text-white text-sm font-medium`}>
                {getInitials(selectedUser.full_name)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <UserCircle2 className="h-5 w-5 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <span className="font-medium truncate block text-base">
              {selectedWorkConversation
                ? selectedWorkConversation.workName
                : selectedUser
                  ? selectedUser.full_name
                  : "Selecciona una conversación"}
            </span>
          </div>
          {selectedUser && !isWorkConversationSelected && !isAiHelpConversation && (
            <span
              className={`ml-1 h-2.5 w-2.5 rounded-full shrink-0 ${isUserOnline(selectedUser.id) ? "bg-green-500" : "bg-gray-300"}`}
            />
          )}
        </div>
      </div>

      {/* Context badges */}
      {selectedWorkConversation && (
        <div className="px-3 py-2 border-b bg-slate-50">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white px-3 py-1 text-sm text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            <span>
              Conversación de obra
              {projectConversationParticipantCount > 0
                ? ` · ${projectConversationParticipantCount} participante${projectConversationParticipantCount === 1 ? "" : "s"}`
                : ""}
            </span>
          </div>
        </div>
      )}
      {selectedUser && activeWorkContext && (
        <div className="px-3 py-2 border-b bg-slate-50">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white px-3 py-1 text-sm text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            <span>Desde obra: {activeWorkContext.workName}</span>
          </div>
        </div>
      )}
      {isAiHelpConversation && (
        <div className="px-3 py-2 border-b bg-amber-50/60">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-1 text-sm text-muted-foreground">
            <Bot className="h-3.5 w-3.5 text-amber-700" />
            <span>Asistente para explicar cómo usar la aplicación</span>
          </div>
        </div>
      )}

      {/* Messages area */}
      <ScrollArea className="flex-1 min-h-0" ref={listRef}>
        <div className="p-4 space-y-4">
          {!selectedUser && !selectedWorkConversation && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <UserCircle2 className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-base">Elige una conversación o un contacto para empezar.</p>
            </div>
          )}

          {/* Project conversation messages */}
          {selectedWorkConversation && (
            <>
              {loadingProjectConversation && (
                <div className="text-base text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Cargando conversación de obra...</span>
                </div>
              )}
              {!loadingProjectConversation && projectConversationError && (
                <div className="text-sm text-destructive">{projectConversationError}</div>
              )}
              {!loadingProjectConversation &&
                !projectConversationError &&
                projectConversationMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Building2 className="h-10 w-10 mb-3 opacity-40" />
                    <p className="text-base">No hay mensajes todavía en esta conversación de obra.</p>
                  </div>
                )}
              {!loadingProjectConversation &&
                !projectConversationError &&
                projectConversationMessages.map((message) => {
                  const isMine = currentUserId === String(message.from_user_id);
                  const senderName = isMine
                    ? currentUserName || "Tú"
                    : message.from_user?.full_name || "Usuario";
                  return (
                    <div key={`project-message-${message.id}`} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                      <span className="text-base font-medium text-muted-foreground mb-1 px-1">{senderName}</span>
                      <div
                        className={`max-w-[90%] rounded-2xl px-5 py-4 text-lg ${isMine ? "bg-primary/15 rounded-br-none" : "bg-sky-100 rounded-bl-none"}`}
                      >
                        <div className="whitespace-pre-wrap break-words">{message.message}</div>
                        <div className={`text-sm text-muted-foreground mt-2 ${isMine ? "text-right" : ""}`}>
                          {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </>
          )}

          {/* Direct messages + files timeline */}
          {selectedUser &&
            isAiHelpConversation &&
            aiHelpMessages.map((m) => {
              const isMine = m.from_user_id === currentUserId;
              const senderName = isMine ? currentUserName || "Tú" : "Ayuda IA";
              return (
                <div key={`ai-msg-${m.id}`} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                  <span className="mb-1 px-1 text-[17px] font-medium text-muted-foreground">{senderName}</span>
                  <div
                    className={`max-w-[92%] rounded-2xl px-4 py-3 text-lg ${isMine ? "bg-primary/15 rounded-br-none" : "bg-amber-50 border border-amber-200 rounded-bl-none"}`}
                  >
                    {isMine ? (
                      <div className="whitespace-pre-wrap break-words text-lg leading-8">{m.message}</div>
                    ) : (
                      <div className="ai-response-container markdown-wrap w-full max-w-none break-words text-lg leading-8 text-foreground">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ node, ...props }) => (
                              <p className="mb-2.5 text-lg leading-8 text-foreground last:mb-0" {...props} />
                            ),
                            ul: ({ node, ...props }) => (
                              <ul className="mb-2.5 list-disc space-y-1.5 pl-5 text-lg leading-8 text-foreground" {...props} />
                            ),
                            ol: ({ node, ...props }) => (
                              <ol className="mb-2.5 list-decimal space-y-1.5 pl-5 text-lg leading-8 text-foreground" {...props} />
                            ),
                            li: ({ node, ...props }) => (
                              <li className="pl-1 marker:text-foreground" {...props} />
                            ),
                            strong: ({ node, ...props }) => (
                              <strong className="font-semibold text-foreground" {...props} />
                            ),
                            pre: ({ node, ...props }) => (
                              <pre
                                className="my-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100"
                                {...props}
                              />
                            ),
                            code: ({
                              node,
                              className,
                              children,
                              ...props
                            }: {
                              node?: unknown;
                              className?: string;
                              children?: React.ReactNode;
                            }) => {
                              const rawText = Array.isArray(children)
                                ? children.join("")
                                : typeof children === "string"
                                  ? children
                                  : "";
                              const isBlockCode =
                                Boolean(className?.startsWith("language-")) || rawText.includes("\n");

                              return (
                                <code
                                  className={
                                    isBlockCode
                                      ? "font-mono text-xs text-slate-100"
                                      : "rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[0.9em] text-slate-800"
                                  }
                                  {...props}
                                >
                                  {children}
                                </code>
                              );
                            },
                            a: ({ node, href, ...props }) => (
                              <a
                                {...props}
                                href={href}
                                className="font-medium text-blue-700 underline underline-offset-2"
                                onClick={(event) => {
                                  event.preventDefault();
                                  handleAiHelpLink(href);
                                }}
                              />
                            ),
                          }}
                        >
                          {m.message}
                        </ReactMarkdown>
                      </div>
                    )}
                    <div className={`text-sm text-muted-foreground mt-2 flex items-center gap-1 ${isMine ? "justify-end" : ""}`}>
                      <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          {selectedUser &&
            !isAiHelpConversation &&
            combinedTimeline.map((item) => {
              if (item.type === "message") {
                const m = item.data;
                const isMine = m.from_user_id === currentUserId;
                const senderName = isMine
                  ? currentUserName || "Tú"
                  : m.from_user?.full_name || selectedUser.full_name || "Usuario";
                return (
                  <div key={`msg-${m.id}`} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                    <span className="text-base font-medium text-muted-foreground mb-1 px-1">{senderName}</span>
                    <div
                      className={`max-w-[90%] rounded-2xl px-5 py-4 text-lg ${isMine ? "bg-primary/15 rounded-br-none" : "bg-sky-100 rounded-bl-none"}`}
                    >
                      <div className="whitespace-pre-wrap break-words">{m.message}</div>
                      <div className={`text-sm text-muted-foreground mt-2 flex items-center gap-1 ${isMine ? "justify-end" : ""}`}>
                        <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        {isMine &&
                          (m.read ? <CheckCheck className="h-3.5 w-3.5 text-blue-500" /> : <CheckCheck className="h-3.5 w-3.5" />)}
                      </div>
                    </div>
                  </div>
                );
              } else {
                const f = item.data;
                const isMine = f.from_user_id === currentUserId;
                const isImg = isImageFile(f.file_name);
                const isAudio = isAudioFile(f.file_name);
                const previewUrl = imagePreviews[f.id];
                const audioUrl = audioPreviews[f.id];
                const fileSender = isMine
                  ? currentUserName || "Tú"
                  : f.from_user?.full_name || selectedUser.full_name || "Usuario";
                return (
                  <div key={`file-${f.id}`} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                    <span className="text-base font-medium text-muted-foreground mb-1 px-1">{fileSender}</span>
                    <div
                      className={`max-w-[90%] rounded-2xl px-5 py-4 text-lg ${isMine ? "bg-primary/15 rounded-br-none" : "bg-sky-100 rounded-bl-none"}`}
                    >
                      {isImg && previewUrl && (
                        <img src={previewUrl} alt={f.file_name} className="rounded-md mb-2 max-h-48 max-w-full object-contain" />
                      )}
                      {isImg && !previewUrl && (
                        <div className="mb-2 h-12 flex items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-6 w-6 animate-pulse" />
                        </div>
                      )}
                      {isAudio && audioUrl && (
                        <audio controls src={audioUrl} className="mb-2 w-full" style={{ maxWidth: 260, height: 36 }} />
                      )}
                      {isAudio && !audioUrl && (
                        <div className="mb-2 flex items-center gap-1 text-muted-foreground text-xs">
                          <Mic className="h-4 w-4 animate-pulse" />
                          <span>Cargando audio...</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        {isImg ? (
                          <ImageIcon className="h-5 w-5 shrink-0" />
                        ) : isAudio ? (
                          <Mic className="h-5 w-5 shrink-0" />
                        ) : (
                          <FileText className="h-5 w-5 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate text-base">{f.file_name}</div>
                          <div className="text-sm text-muted-foreground">{(f.file_size / 1024).toFixed(1)} KB</div>
                        </div>
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => downloadFile(f)} title="Descargar">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="text-sm text-muted-foreground mt-2">
                        {new Date(f.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                );
              }
            })}
        </div>
      </ScrollArea>

      {/* Composer */}
      <div className="px-2 py-2 border-t bg-white sm:p-4">
        <div className="flex items-center gap-1 sm:items-end sm:gap-3">
          {isWorkConversationSelected ? (
            <>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={selectedWorkConversation ? "Escribe en la conversación de obra..." : "Selecciona una obra"}
                disabled={!selectedWorkConversation || sendingProjectConversation}
                className="h-10 min-h-[40px] resize-none text-sm sm:h-[56px] sm:min-h-[56px] sm:text-lg"
                rows={1}
              />
              <Button
                onClick={handleSend}
                disabled={!selectedWorkConversation || !text.trim() || sendingProjectConversation}
                size="icon"
                title="Enviar"
                className="shrink-0 h-10 w-10 sm:h-12 sm:w-12"
              >
                {sendingProjectConversation ? (
                  <Loader2 className="h-5 w-5 animate-spin sm:h-6 sm:w-6" />
                ) : (
                  <Send className="h-5 w-5 sm:h-6 sm:w-6" />
                )}
              </Button>
            </>
          ) : isAiHelpConversation ? (
            <>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Pregunta cómo hacer algo o dónde encontrar una función..."
                disabled={!selectedUser || sendingAiHelp}
                className="h-10 min-h-[40px] resize-none text-sm sm:h-[56px] sm:min-h-[56px] sm:text-lg"
                rows={1}
              />
              <Button
                onClick={() => void handleSend()}
                disabled={!selectedUser || !text.trim() || sendingAiHelp}
                size="icon"
                title="Enviar"
                className="shrink-0 h-10 w-10 sm:h-12 sm:w-12"
              >
                {sendingAiHelp ? (
                  <Loader2 className="h-5 w-5 animate-spin sm:h-6 sm:w-6" />
                ) : (
                  <Send className="h-5 w-5 sm:h-6 sm:w-6" />
                )}
              </Button>
            </>
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.xlsx,.xls,.doc,.docx,.jpg,.jpeg,.png"
                onChange={handleFileShare}
                className="hidden"
                id="chat-file-input"
                disabled={!selectedUser || isSharingFile}
              />
              {isRecording ? (
                <>
                  <span className="h-3 w-3 rounded-full bg-red-500 animate-pulse shrink-0" />
                  <span className="flex-1 text-sm font-medium text-red-500 sm:text-base">Grabando {fmtDuration(recordingDuration)}</span>
                  <Button onClick={stopRecording} variant="destructive" size="icon" title="Detener y enviar" className="shrink-0 h-10 w-10 sm:h-12 sm:w-12">
                    <Send className="h-5 w-5 sm:h-6 sm:w-6" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!selectedUser || isSharingFile}
                    title="Adjuntar archivo"
                    className="shrink-0 h-9 w-9 sm:h-12 sm:w-12"
                  >
                    <Paperclip className="h-5 w-5 sm:h-7 sm:w-7" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={startRecording}
                    disabled={!selectedUser || isSharingFile}
                    title="Nota de voz"
                    className="shrink-0 h-9 w-9 sm:h-12 sm:w-12"
                  >
                    <Mic className="h-5 w-5 sm:h-7 sm:w-7" />
                  </Button>
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={selectedUser ? "Escribe un mensaje..." : "Selecciona un contacto"}
                    disabled={!selectedUser}
                    className="h-10 min-h-[40px] resize-none text-sm sm:h-[56px] sm:min-h-[56px] sm:text-lg"
                    rows={1}
                  />
                  <Button onClick={() => void handleSend()} disabled={!selectedUser || !text.trim()} size="icon" title="Enviar" className="shrink-0 h-10 w-10 sm:h-12 sm:w-12">
                    <Send className="h-5 w-5 sm:h-6 sm:w-6" />
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
