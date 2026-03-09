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
import { MessageSquare, Send, Search, UserCircle2, ArrowLeft, Check, CheckCheck, Paperclip, Trash2, X, Download, FileText } from "lucide-react";
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
import { useUserPresence } from "@/hooks/useUserPresence";
import { useAuth } from "@/contexts/AuthContext";
import { useSharedFiles } from "@/hooks/useSharedFiles";
import { toast } from "sonner";

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
  const { isUserOnline } = useUserPresence();
  const { shareFile, sentFiles, receivedFiles, downloadFile, reloadFiles } = useSharedFiles();

  const [open, setOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [isSharingFile, setIsSharingFile] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Allow external triggers to open the drawer (e.g., from MobileActionsMenu)
  useEffect(() => {
    const openHandler = () => setOpen(true);
    document.addEventListener('open-chat-center', openHandler as EventListener);
    return () => document.removeEventListener('open-chat-center', openHandler as EventListener);
  }, []);

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

  const selectedUser = useMemo(() => contacts.find((c) => c.id === selectedUserId), [contacts, selectedUserId]);

  useEffect(() => {
    if (open) {
      reloadMessages();
      reloadFiles();
    }
  }, [open, reloadMessages, reloadFiles]);

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

  const handleSend = async () => {
    if (!user || !selectedUserId || !text.trim()) return;
    const msg = text.trim();
    setText("");
    await sendMessage(selectedUserId, msg);
    scrollToBottom();
  };

  const handleFileShare = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedUserId) return;
    
    setIsSharingFile(true);
    try {
      await shareFile(file, selectedUserId);
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
    if (selectedUserId && open) {
      scrollToBottom();
    }
  }, [selectedUserId, open, messages.length, sentFiles.length, receivedFiles.length]);

  const unreadBadge = unreadCount > 0 ? (
    <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center">
      {unreadCount > 9 ? "9+" : unreadCount}
    </Badge>
  ) : null;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        onClick={() => setOpen(true)}
        className="relative h-9 w-9 text-primary-foreground hover:bg-primary-foreground/20"
        title="Chat"
      >
        <MessageSquare className="h-4 w-4" />
        {unreadBadge}
      </Button>

      <DrawerContent className="h-[80svh] md:h-[72vh] overflow-hidden">
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
                      setSelectedUserId("");
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
          <div className={`${selectedUserId ? 'hidden md:flex' : 'flex'} md:col-span-1 border rounded-lg overflow-hidden flex-col min-h-0`}>
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
                    <button onClick={() => setSelectedUserId(c.userId)} className={`w-full text-left rounded-md px-3 py-2 hover:bg-accent ${selectedUserId === c.userId ? "bg-accent" : ""}`}>
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
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
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
                                setSelectedUserId("");
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

                <div className="pt-2 pb-1 px-2 text-[11px] text-muted-foreground font-medium">Contactos</div>
                {contacts
                  .filter((u) => u.id !== currentUserId && u.full_name.toLowerCase().includes(search.toLowerCase()))
                  .map((u) => (
                    <button key={`contact-${u.id}`} onClick={() => setSelectedUserId(u.id)} className={`w-full text-left rounded-md px-3 py-2 hover:bg-accent ${selectedUserId === u.id ? "bg-accent" : ""}`}>
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
              </div>
            </ScrollArea>
          </div>

          {/* Conversation */}
          <div className={`${selectedUserId ? 'flex' : 'hidden md:flex'} md:col-span-2 border rounded-lg overflow-hidden flex-col min-h-0`}>
            <div className="p-3 border-b flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setSelectedUserId("")}
                title="Volver"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2 min-w-0">
                <UserCircle2 className="h-5 w-5" />
                <span className="font-medium truncate">
                  {selectedUser ? selectedUser.full_name : "Selecciona un contacto"}
                </span>
                {selectedUser && (
                  <span className={`ml-2 h-2 w-2 rounded-full ${isUserOnline(selectedUser.id) ? "bg-green-500" : "bg-muted-foreground"}`} />
                )}
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-0" ref={listRef as any}>
              <div className="p-4 space-y-2">
                {!selectedUser && (
                  <div className="text-sm text-muted-foreground">Elige una conversación o un contacto para empezar.</div>
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
                      return (
                        <div key={`msg-${m.id}`} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${isMine ? "ml-auto bg-primary/10" : "bg-muted"}`}>
                          <div className="whitespace-pre-wrap break-words">{m.message}</div>
                          <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
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
                      );
                    } else {
                      const f = item.data;
                      const isMine = f.from_user_id === currentUserId;
                      return (
                        <div key={`file-${f.id}`} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${isMine ? "ml-auto bg-primary/10" : "bg-muted"}`}>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate">{f.file_name}</div>
                              <div className="text-xs text-muted-foreground">
                                {(f.file_size / 1024).toFixed(1)} KB
                              </div>
                            </div>
                            {!isMine && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 shrink-0"
                                onClick={() => downloadFile(f)}
                                title="Descargar"
                              >
                                <Download className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1">
                            {new Date(f.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.xlsx,.xls,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={handleFileShare}
                  className="hidden"
                  id="chat-file-input"
                  disabled={!selectedUser || isSharingFile}
                />
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
              </div>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
