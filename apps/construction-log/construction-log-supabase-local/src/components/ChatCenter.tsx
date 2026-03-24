import { useMemo, useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Send, Search, UserCircle2, ArrowLeft, Check, CheckCheck, Paperclip, Trash2, X, Download, FileText, ImageIcon, Mic, Building2, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useMessages } from "@/hooks/useMessages";
import { useMessageableUsers } from "@/hooks/useMessageableUsers";
import { useProjectConversation } from "@/hooks/useProjectConversation";
import { useWorkMessageDirectory } from "@/hooks/useWorkMessageDirectory";
import { useUserPresence } from "@/hooks/useUserPresence";
import { useAuth } from "@/contexts/AuthContext";
import { useSharedFiles } from "@/hooks/useSharedFiles";
import { broadcastMessageToProject } from "@/integrations/api/client";
import {
  clearConversationSelection,
  selectConversationDirect,
  selectConversationFromWork,
  selectWorkConversation,
  type ActiveWorkConversationContext,
} from "@/components/chatCenterContext";
import { toast } from "sonner";

const IMAGE_EXTS = /\.(jpg|jpeg|png|gif|webp)$/i;
const AUDIO_EXTS = /\.(webm|mp3|m4a|ogg|wav|aac)$/i;
const isImageFile = (name: string) => IMAGE_EXTS.test(name);
const isAudioFile = (name: string) => AUDIO_EXTS.test(name);
const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

interface ConversationItem {
  userId: string;
  userName: string;
  unread: number;
  lastSnippet: string;
  lastAt: string;
}

export const ChatCenter = () => {
  const { user } = useAuth();
  const currentUserId = user ? String(user.id) : null;
  const { messages, unreadCount, sendMessage, markAsRead, deleteConversation, clearAllMessages, reloadMessages } = useMessages();
  const { users: contacts, loading: loadingContacts } = useMessageableUsers();
  const { works, membersByWorkId, loadingWorks, loadingMembersByWorkId, loadMembersForWork } = useWorkMessageDirectory();
  const { isUserOnline } = useUserPresence();
  const { shareFile, sentFiles, receivedFiles, downloadFile, getFileBlob, reloadFiles } = useSharedFiles();

  const [open, setOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [activeWorkContext, setActiveWorkContext] = useState<ActiveWorkConversationContext | null>(null);
  const [selectedWorkConversation, setSelectedWorkConversation] = useState<ActiveWorkConversationContext | null>(null);
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [expandedWorkIds, setExpandedWorkIds] = useState<number[]>([]);
  const [broadcastComposerWorkId, setBroadcastComposerWorkId] = useState<number | null>(null);
  const [broadcastText, setBroadcastText] = useState("");
  const [isBroadcastSending, setIsBroadcastSending] = useState(false);
  const [isSharingFile, setIsSharingFile] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});
  const imagePreviewUrls = useRef<Record<string, string>>({});
  const [audioPreviews, setAudioPreviews] = useState<Record<string, string>>({});
  const audioPreviewUrls = useRef<Record<string, string>>({});
  const {
    participantCount: projectConversationParticipantCount,
    messages: projectConversationMessages,
    loading: loadingProjectConversation,
    sending: sendingProjectConversation,
    error: projectConversationError,
    reload: reloadProjectConversation,
    sendMessage: sendProjectConversationMessage,
  } = useProjectConversation(selectedWorkConversation, open && selectedWorkConversation !== null);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(imagePreviewUrls.current).forEach(URL.revokeObjectURL);
      Object.values(audioPreviewUrls.current).forEach(URL.revokeObjectURL);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    };
  }, []);

  // Load image previews for files in the active conversation
  useEffect(() => {
    if (!selectedUserId || !currentUserId) return;
    const allFiles = [...sentFiles, ...receivedFiles].filter(
      (f) =>
        isImageFile(f.file_name) &&
        ((f.from_user_id === currentUserId && f.to_user_id === selectedUserId) ||
          (f.to_user_id === currentUserId && f.from_user_id === selectedUserId))
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
  }, [selectedUserId, currentUserId, getFileBlob, sentFiles, receivedFiles]);

  // Load audio previews for files in the active conversation
  useEffect(() => {
    if (!selectedUserId || !currentUserId) return;
    const allFiles = [...sentFiles, ...receivedFiles].filter(
      (f) =>
        isAudioFile(f.file_name) &&
        ((f.from_user_id === currentUserId && f.to_user_id === selectedUserId) ||
          (f.to_user_id === currentUserId && f.from_user_id === selectedUserId))
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
  }, [selectedUserId, currentUserId, getFileBlob, sentFiles, receivedFiles]);

  // Allow external triggers to open/close the drawer
  useEffect(() => {
    const openHandler  = () => setOpen(true);
    const closeHandler = () => setOpen(false);
    document.addEventListener('open-chat-center',  openHandler  as EventListener);
    document.addEventListener('close-chat-center', closeHandler as EventListener);
    return () => {
      document.removeEventListener('open-chat-center',  openHandler  as EventListener);
      document.removeEventListener('close-chat-center', closeHandler as EventListener);
    };
  }, []);

  // Notify bubble about open/close state changes
  useEffect(() => {
    document.dispatchEvent(new CustomEvent('chat-center-state', { detail: { open } }));
  }, [open]);

  // Build conversations grouped by the counterpart
  const conversations = useMemo<ConversationItem[]>(() => {
    if (!currentUserId) return [];
    const map = new Map<string, ConversationItem & { lastTs: number }>();

    for (const m of messages) {
      const isFromMe = m.from_user_id === currentUserId;
      const otherId = isFromMe ? m.to_user_id : m.from_user_id;
      const otherName = (isFromMe ? (m.to_user as any)?.full_name : (m.from_user as any)?.full_name) || "Usuario";
      const ts = new Date(m.created_at).getTime();

      if (!map.has(otherId)) {
        map.set(otherId, {
          userId: otherId,
          userName: otherName,
          unread: 0,
          lastSnippet: m.message.slice(0, 60),
          lastAt: new Date(m.created_at).toLocaleString(),
          lastTs: ts,
        });
      }

      const entry = map.get(otherId)!;
      entry.lastSnippet = m.message.slice(0, 60);
      entry.lastAt = new Date(m.created_at).toLocaleString();
      entry.lastTs = Math.max(entry.lastTs, ts);
      if (!isFromMe && !m.read) entry.unread += 1;
    }

    const items = Array.from(map.values())
      .sort((a, b) => b.lastTs - a.lastTs)
      .map(({ lastTs, ...rest }) => rest);

    return items.filter((c) =>
      c.userName.toLowerCase().includes(search.toLowerCase())
    );
  }, [messages, currentUserId, search]);

  const selectedUser = useMemo(() => {
    if (!selectedUserId) return undefined;
    const fromContacts = contacts.find((c) => c.id === selectedUserId);
    if (fromContacts) return fromContacts;
    const fromWorkMembers = Object.values(membersByWorkId)
      .flat()
      .find((member) => member.id === selectedUserId);
    if (fromWorkMembers) {
      return {
        id: fromWorkMembers.id,
        full_name: fromWorkMembers.full_name,
        roles: [],
        approved: true,
      };
    }
    // Fallback: build from conversation data in case contacts API failed or hasn't loaded yet
    const conv = conversations.find((c) => c.userId === selectedUserId);
    if (conv) return { id: conv.userId, full_name: conv.userName, roles: [], approved: true };
    return undefined;
  }, [contacts, conversations, membersByWorkId, selectedUserId]);

  const normalizedSearch = search.trim().toLowerCase();
  const isWorkConversationSelected = selectedWorkConversation !== null;
  const hasActiveConversation = Boolean(selectedUserId || selectedWorkConversation);

  const filteredWorks = useMemo(() => {
    if (!normalizedSearch) return works;
    return works.filter((work) => {
      if (work.name.toLowerCase().includes(normalizedSearch)) return true;
      const members = membersByWorkId[work.id] || [];
      return members.some((member) => member.full_name.toLowerCase().includes(normalizedSearch));
    });
  }, [membersByWorkId, normalizedSearch, works]);

  useEffect(() => {
    if (open) {
      reloadMessages();
      reloadFiles();
      if (selectedWorkConversation) {
        void reloadProjectConversation();
      }
    }
  }, [open, reloadFiles, reloadMessages, reloadProjectConversation, selectedWorkConversation]);

  useEffect(() => {
    if (!open || !currentUserId || !selectedUserId) return;
    // Mark messages from selected user as read
    messages
      .filter((m) => m.from_user_id === selectedUserId && m.to_user_id === currentUserId && !m.read)
      .forEach((m) => markAsRead(m.id));
  }, [open, currentUserId, selectedUserId, messages, markAsRead]);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (listRef.current) {
        const scrollElement = listRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (scrollElement) {
          scrollElement.scrollTop = scrollElement.scrollHeight;
        }
      }
    }, 100);
  };

  const startRecording = async () => {
    if (!selectedUserId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';
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
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        const ext = (mediaRecorder.mimeType || '').includes('webm') ? 'webm' : 'ogg';
        const audioFile = new File([blob], `nota_${Date.now()}.${ext}`, { type: blob.type });
        setIsSharingFile(true);
        try {
          await shareFile(audioFile, selectedUserId, undefined, undefined, selectedUser?.full_name);
          scrollToBottom();
        } finally {
          setIsSharingFile(false);
        }
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch {
      toast.error('No se pudo acceder al micrófono');
    }
  };

  const stopRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleSend = async () => {
    if (!user || !text.trim()) return;
    const msg = text.trim();
    setText("");
    try {
      if (selectedWorkConversation) {
        await sendProjectConversationMessage(msg);
      } else if (selectedUserId) {
        await sendMessage(selectedUserId, msg, undefined, selectedUser?.full_name);
      } else {
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      toast.error("Error al enviar mensaje", {
        description: message,
      });
      setText(msg);
      return;
    }
    scrollToBottom();
  };

  const handleFileShare = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedUserId) return;
    
    setIsSharingFile(true);
    try {
      await shareFile(file, selectedUserId, undefined, undefined, selectedUser?.full_name);
      toast.success("Archivo compartido exitosamente");
      scrollToBottom(); // Scroll to show the new file
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      toast.error("Error al compartir archivo");
    } finally {
      setIsSharingFile(false);
    }
  };

  // Scroll to bottom when opening a conversation or receiving new messages
  useEffect(() => {
    if (hasActiveConversation && open) {
      scrollToBottom();
    }
  }, [
    hasActiveConversation,
    open,
    messages.length,
    sentFiles.length,
    receivedFiles.length,
    projectConversationMessages.length,
  ]);

  const toggleWork = async (workId: number) => {
    const isExpanded = expandedWorkIds.includes(workId);
    if (isExpanded) {
      setExpandedWorkIds((prev) => prev.filter((id) => id !== workId));
      return;
    }

    setExpandedWorkIds((prev) => prev.concat(workId));
    await loadMembersForWork(workId);
  };

  const openConversationDirect = (userId: string) => {
    const next = selectConversationDirect(userId);
    setSelectedUserId(next.selectedUserId);
    setActiveWorkContext(next.activeWorkContext);
    setSelectedWorkConversation(next.selectedWorkConversation);
    setText("");
  };

  const openConversationFromWork = (
    userId: string,
    workContext: ActiveWorkConversationContext,
  ) => {
    const next = selectConversationFromWork(userId, workContext);
    setSelectedUserId(next.selectedUserId);
    setActiveWorkContext(next.activeWorkContext);
    setSelectedWorkConversation(next.selectedWorkConversation);
    setText("");
  };

  const openProjectConversation = (workContext: ActiveWorkConversationContext) => {
    const next = selectWorkConversation(workContext);
    setSelectedUserId(next.selectedUserId);
    setActiveWorkContext(next.activeWorkContext);
    setSelectedWorkConversation(next.selectedWorkConversation);
    setText("");
  };

  const resetConversationSelection = () => {
    const next = clearConversationSelection();
    setSelectedUserId(next.selectedUserId);
    setActiveWorkContext(next.activeWorkContext);
    setSelectedWorkConversation(next.selectedWorkConversation);
    setText("");
  };

  const handleBroadcastToWork = async (workId: number, workName: string) => {
    const body = broadcastText.trim();
    if (!body) {
      toast.error("Escribe un mensaje para la obra");
      return;
    }

    setIsBroadcastSending(true);
    try {
      const result = await broadcastMessageToProject(workId, { message: body });
      await reloadMessages();

      if (result.sent_count === 0) {
        toast("La obra no tiene destinatarios válidos visibles", {
          description: `${workName}: 0 envíos, ${result.skipped_count} descartados.`,
        });
      } else {
        toast.success("Mensaje enviado a la obra", {
          description: `${workName}: ${result.sent_count} envío(s), ${result.skipped_count} descartado(s).`,
        });
      }

      setBroadcastComposerWorkId(null);
      setBroadcastText("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      toast.error("Error al escribir a la obra", {
        description: message,
      });
    } finally {
      setIsBroadcastSending(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={setOpen} dismissible>
      <DrawerContent
        className="h-[100svh] overflow-hidden"
        onPointerDownOutside={() => setOpen(false)}
        onInteractOutside={() => setOpen(false)}
      >
        <DrawerHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <DrawerTitle>Mensajería</DrawerTitle>
              <DrawerDescription>Chatea con tu equipo en tiempo real</DrawerDescription>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  title="Vaciar todos los mensajes"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Vaciar todos los mensajes?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción eliminará permanentemente todos tus mensajes y conversaciones. 
                    No se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      clearAllMessages();
                      resetConversationSelection();
                    }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Vaciar mensajes
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </DrawerHeader>

        <div className="px-4 pb-2 grid grid-cols-1 md:grid-cols-3 gap-4 min-h-0 h-full">
          {/* Conversations list */}
          <div className={`${hasActiveConversation ? 'hidden md:flex' : 'flex'} md:col-span-1 border rounded-lg overflow-hidden flex-col min-h-0`}>
            <div className="p-3 border-b flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar conversaciones"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8"
              />
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-2 space-y-1">
                {conversations.length === 0 && (
                  <div className="text-sm text-muted-foreground p-3">No hay conversaciones</div>
                )}
                {conversations.map((c) => (
                  <div key={c.userId} className="relative group">
                    <button onClick={() => openConversationDirect(c.userId)} className={`w-full text-left rounded-md px-3 py-2 hover:bg-accent ${selectedUserId === c.userId ? "bg-accent" : ""}`}>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <UserCircle2 className="h-6 w-6" />
                          <span className={`absolute -right-0 -bottom-0 h-2 w-2 rounded-full ${isUserOnline(c.userId) ? "bg-green-500" : "bg-muted-foreground"}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium truncate">{c.userName}</span>
                            {c.unread > 0 && (<Badge variant="default" className="h-5 px-1.5 text-[10px]">{c.unread}</Badge>)}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{c.lastSnippet}</p>
                        </div>
                      </div>
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar conversación?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Se eliminarán todos los mensajes con {c.userName}. Esta acción no se puede deshacer.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              deleteConversation(c.userId);
                              if (selectedUserId === c.userId) {
                                resetConversationSelection();
                              }
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}

                <div className="pt-2 pb-1 px-2 text-[11px] text-muted-foreground font-medium">
                  Directorio general
                </div>
                {loadingContacts && (
                  <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Cargando usuarios...</span>
                  </div>
                )}
                {!loadingContacts &&
                  contacts.filter(
                    (u) => u.id !== currentUserId && u.full_name.toLowerCase().includes(search.toLowerCase())
                  ).length === 0 && (
                    <div className="text-sm text-muted-foreground px-3 py-2">
                      No hay usuarios disponibles en el directorio general.
                    </div>
                  )}
                {contacts
                  .filter((u) => u.id !== currentUserId && u.full_name.toLowerCase().includes(search.toLowerCase()))
                  .map((u) => (
                    <button key={`contact-${u.id}`} onClick={() => openConversationDirect(u.id)} className={`w-full text-left rounded-md px-3 py-2 hover:bg-accent ${selectedUserId === u.id ? "bg-accent" : ""}`}>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <UserCircle2 className="h-6 w-6" />
                          <span className={`absolute -right-0 -bottom-0 h-2 w-2 rounded-full ${isUserOnline(u.id) ? "bg-green-500" : "bg-muted-foreground"}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="font-medium truncate">{u.full_name}</span>
                        </div>
                      </div>
                    </button>
                ))}

                <div className="pt-3 pb-1 px-2 text-[11px] text-muted-foreground font-medium">Obras</div>
                {loadingWorks && (
                  <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Cargando obras...</span>
                  </div>
                )}
                {!loadingWorks && filteredWorks.length === 0 && (
                  <div className="text-sm text-muted-foreground px-3 py-2">
                    No hay obras disponibles para conversar.
                  </div>
                )}
                {filteredWorks.map((work) => {
                  const isExpanded = expandedWorkIds.includes(work.id);
                  const members = membersByWorkId[work.id] || [];
                  const filteredMembers = members.filter((member) =>
                    member.full_name.toLowerCase().includes(normalizedSearch)
                  );
                  const visibleMembers = normalizedSearch ? filteredMembers : members;
                  const workContext = {
                    workId: work.id,
                    workName: work.name,
                  } satisfies ActiveWorkConversationContext;

                  return (
                    <div key={`work-${work.id}`} className="rounded-md border border-border/60">
                      <button
                        type="button"
                        onClick={() => void toggleWork(work.id)}
                        className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-accent/50"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <Building2 className="h-4 w-4 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{work.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {work.visible_member_count} contacto{work.visible_member_count === 1 ? "" : "s"} visible{work.visible_member_count === 1 ? "" : "s"}
                          </div>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-border/60 px-2 py-2 space-y-1">
                          <button
                            type="button"
                            onClick={() => openProjectConversation(workContext)}
                            className={`w-full text-left rounded-md px-2 py-2 hover:bg-accent ${
                              isWorkConversationSelected && selectedWorkConversation?.workId === work.id
                                ? "bg-accent"
                                : ""
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Building2 className="h-5 w-5 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="font-medium truncate">Conversación de obra</div>
                                <div className="text-[11px] text-muted-foreground truncate">
                                  Hilo persistente del equipo visible de esta obra
                                </div>
                              </div>
                            </div>
                          </button>
                          <div className="flex items-center justify-between gap-2 px-1 pb-1">
                            <div className="text-[11px] text-muted-foreground">
                              Enviar el mismo mensaje a los DMs visibles de esta obra
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={work.visible_member_count <= 0}
                              onClick={() => {
                                setBroadcastComposerWorkId((current) =>
                                  current === work.id ? null : work.id
                                );
                                setBroadcastText("");
                              }}
                            >
                              Escribir a la obra
                            </Button>
                          </div>
                          {broadcastComposerWorkId === work.id && (
                            <div className="rounded-md border border-border/70 bg-background p-2 space-y-2">
                              <Textarea
                                value={broadcastText}
                                onChange={(event) => setBroadcastText(event.target.value)}
                                placeholder="Escribe un mensaje para los destinatarios válidos de esta obra"
                                className="min-h-[88px] resize-none"
                                rows={4}
                              />
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-[11px] text-muted-foreground">
                                  Se enviará por DM 1:1. No se crea chat grupal.
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setBroadcastComposerWorkId(null);
                                      setBroadcastText("");
                                    }}
                                  >
                                    Cancelar
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={isBroadcastSending || !broadcastText.trim()}
                                    onClick={() => void handleBroadcastToWork(work.id, work.name)}
                                  >
                                    {isBroadcastSending ? "Enviando..." : "Enviar"}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                          {loadingMembersByWorkId[work.id] && (
                            <div className="px-2 py-1 text-xs text-muted-foreground flex items-center gap-2">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              <span>Cargando personas...</span>
                            </div>
                          )}
                          {!loadingMembersByWorkId[work.id] && visibleMembers.length === 0 && (
                            <div className="px-2 py-1 text-xs text-muted-foreground">
                              No hay personas visibles en esta obra.
                            </div>
                          )}
                          {visibleMembers.map((member) => (
                            <button
                              key={`work-${work.id}-member-${member.id}`}
                              type="button"
                              onClick={() => openConversationFromWork(member.id, workContext)}
                              className={`w-full text-left rounded-md px-2 py-2 hover:bg-accent ${selectedUserId === member.id ? "bg-accent" : ""}`}
                            >
                              <div className="flex items-center gap-2">
                                <UserCircle2 className="h-5 w-5 shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium truncate">{member.full_name}</div>
                                  <div className="text-[11px] text-muted-foreground truncate">
                                    DM 1:1 desde contexto de obra
                                  </div>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

              </div>
            </ScrollArea>
          </div>

          {/* Conversation */}
          <div className={`${hasActiveConversation ? 'flex' : 'hidden md:flex'} md:col-span-2 border rounded-lg overflow-hidden flex-col min-h-0`}>
            <div className="p-3 border-b flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={resetConversationSelection}
                title="Volver"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2 min-w-0">
                {isWorkConversationSelected ? (
                  <Building2 className="h-5 w-5" />
                ) : (
                  <UserCircle2 className="h-5 w-5" />
                )}
                <span className="font-medium truncate">
                  {selectedWorkConversation
                    ? selectedWorkConversation.workName
                    : selectedUser
                    ? selectedUser.full_name
                    : "Selecciona una conversación"}
                </span>
                {selectedUser && !isWorkConversationSelected && (
                  <span className={`ml-2 h-2 w-2 rounded-full ${isUserOnline(selectedUser.id) ? "bg-green-500" : "bg-muted-foreground"}`} />
                )}
              </div>
            </div>
            {selectedWorkConversation && (
              <div className="px-3 py-2 border-b bg-muted/30">
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1 text-xs text-muted-foreground">
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
              <div className="px-3 py-2 border-b bg-muted/30">
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1 text-xs text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  <span>Desde obra: {activeWorkContext.workName}</span>
                </div>
              </div>
            )}

            <ScrollArea className="flex-1 min-h-0" ref={listRef as any}>
              <div className="p-4 space-y-2">
                {!selectedUser && !selectedWorkConversation && (
                  <div className="text-sm text-muted-foreground">Elige una conversación, una obra o un contacto para empezar.</div>
                )}
                {selectedWorkConversation && (
                  <>
                    {loadingProjectConversation && (
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Cargando conversación de obra...</span>
                      </div>
                    )}
                    {!loadingProjectConversation && projectConversationError && (
                      <div className="text-sm text-destructive">
                        {projectConversationError}
                      </div>
                    )}
                    {!loadingProjectConversation && !projectConversationError && projectConversationMessages.length === 0 && (
                      <div className="text-sm text-muted-foreground">
                        No hay mensajes todavía en esta conversación de obra.
                      </div>
                    )}
                    {!loadingProjectConversation && !projectConversationError &&
                      projectConversationMessages.map((message) => {
                        const isMine = currentUserId === String(message.from_user_id);
                        const senderName = isMine
                          ? (user?.full_name || "Tú")
                          : (message.from_user?.full_name || "Usuario");
                        return (
                          <div key={`project-message-${message.id}`} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                            <span className="text-[11px] font-medium text-muted-foreground mb-0.5 px-1">{senderName}</span>
                            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${isMine ? "bg-primary/15 rounded-br-none" : "bg-sky-100 dark:bg-sky-900/30 rounded-bl-none"}`}>
                              <div className="whitespace-pre-wrap break-words">{message.message}</div>
                              <div className={`text-[10px] text-muted-foreground mt-1 ${isMine ? "text-right" : ""}`}>
                                {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </>
                )}
                {selectedUser && (() => {
                  // Combine messages and files
                  const userMessages = messages.filter(
                    (m) =>
                      (m.from_user_id === currentUserId && m.to_user_id === selectedUser.id) ||
                      (m.to_user_id === currentUserId && m.from_user_id === selectedUser.id)
                  ).map(m => ({ type: 'message' as const, data: m, timestamp: new Date(m.created_at).getTime() }));

                  const userFiles = [...sentFiles, ...receivedFiles].filter(
                    (f) =>
                      (f.from_user_id === currentUserId && f.to_user_id === selectedUser.id) ||
                      (f.to_user_id === currentUserId && f.from_user_id === selectedUser.id)
                  ).map(f => ({ type: 'file' as const, data: f, timestamp: new Date(f.created_at).getTime() }));

                  const combined = [...userMessages, ...userFiles].sort((a, b) => a.timestamp - b.timestamp);

                  return combined.map((item, idx) => {
                    if (item.type === 'message') {
                      const m = item.data;
                      const isMine = m.from_user_id === currentUserId;
                      const senderName = isMine
                        ? (user?.full_name || "Tú")
                        : ((m.from_user as any)?.full_name || selectedUser?.full_name || "Usuario");
                      return (
                        <div key={`msg-${m.id}`} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                          <span className="text-[11px] font-medium text-muted-foreground mb-0.5 px-1">{senderName}</span>
                          <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${isMine ? "bg-primary/15 rounded-br-none" : "bg-sky-100 dark:bg-sky-900/30 rounded-bl-none"}`}>
                            <div className="whitespace-pre-wrap break-words">{m.message}</div>
                            <div className={`text-[10px] text-muted-foreground mt-1 flex items-center gap-1 ${isMine ? "justify-end" : ""}`}>
                              <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              {isMine && (
                                m.read ? (
                                  <CheckCheck className="h-3 w-3 text-blue-500" />
                                ) : (
                                  <CheckCheck className="h-3 w-3" />
                                )
                              )}
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
                        ? (user?.full_name || "Tú")
                        : ((f.from_user as any)?.full_name || selectedUser?.full_name || "Usuario");
                      return (
                        <div key={`file-${f.id}`} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                          <span className="text-[11px] font-medium text-muted-foreground mb-0.5 px-1">{fileSender}</span>
                        <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${isMine ? "bg-primary/15 rounded-br-none" : "bg-sky-100 dark:bg-sky-900/30 rounded-bl-none"}`}>
                          {isImg && previewUrl && (
                            <img
                              src={previewUrl}
                              alt={f.file_name}
                              className="rounded-md mb-2 max-h-48 max-w-full object-contain"
                            />
                          )}
                          {isImg && !previewUrl && (
                            <div className="mb-2 h-12 flex items-center justify-center text-muted-foreground">
                              <ImageIcon className="h-6 w-6 animate-pulse" />
                            </div>
                          )}
                          {isAudio && audioUrl && (
                            <audio
                              controls
                              src={audioUrl}
                              className="mb-2 w-full"
                              style={{ maxWidth: 260, height: 36 }}
                            />
                          )}
                          {isAudio && !audioUrl && (
                            <div className="mb-2 flex items-center gap-1 text-muted-foreground text-xs">
                              <Mic className="h-4 w-4 animate-pulse" />
                              <span>Cargando audio...</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            {isImg ? <ImageIcon className="h-4 w-4 shrink-0" /> : isAudio ? <Mic className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate">{f.file_name}</div>
                              <div className="text-xs text-muted-foreground">
                                {(f.file_size / 1024).toFixed(1)} KB
                              </div>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 shrink-0"
                              onClick={() => downloadFile(f)}
                              title="Descargar"
                            >
                              <Download className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1">
                            {new Date(f.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        </div>
                      );
                    }
                  });
                })()}
              </div>
            </ScrollArea>

            <div className="p-3 border-t">
              <div className="flex items-end gap-2">
                {isWorkConversationSelected ? (
                  <>
                    <Textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder={selectedWorkConversation ? "Escribe en la conversación de obra..." : "Selecciona una obra"}
                      disabled={!selectedWorkConversation || sendingProjectConversation}
                      className="min-h-[44px] h-[44px] resize-none"
                      rows={2}
                    />
                    <Button
                      onClick={handleSend}
                      disabled={!selectedWorkConversation || !text.trim() || sendingProjectConversation}
                      size="icon"
                      title="Enviar"
                      className="shrink-0"
                    >
                      {sendingProjectConversation ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
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
                        <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                        <span className="flex-1 text-sm font-medium text-red-500">
                          Grabando {fmtDuration(recordingDuration)}
                        </span>
                        <Button
                          onClick={stopRecording}
                          variant="destructive"
                          size="icon"
                          title="Detener y enviar"
                          className="shrink-0"
                        >
                          <Send className="h-4 w-4" />
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
                      className="shrink-0"
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={startRecording}
                      disabled={!selectedUser || isSharingFile}
                      title="Nota de voz"
                      className="shrink-0"
                    >
                      <Mic className="h-4 w-4" />
                    </Button>
                    <Textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder={selectedUser ? "Escribe un mensaje..." : "Selecciona un contacto"}
                      disabled={!selectedUser}
                      className="min-h-[44px] h-[44px] resize-none"
                      rows={2}
                    />
                    <Button onClick={handleSend} disabled={!selectedUser || !text.trim()} size="icon" title="Enviar" className="shrink-0">
                      <Send className="h-4 w-4" />
                    </Button>
                      </>
                    )}
                  </>
                )}  
              </div>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
