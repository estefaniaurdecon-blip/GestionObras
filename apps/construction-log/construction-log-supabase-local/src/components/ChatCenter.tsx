import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { Trash2, MessageCircle, Building2, Users } from "lucide-react";
import { useMessages } from "@/hooks/useMessages";
import { useMessageableUsers } from "@/hooks/useMessageableUsers";
import { useProjectConversation } from "@/hooks/useProjectConversation";
import { useWorkMessageDirectory } from "@/hooks/useWorkMessageDirectory";
import { useUserPresence } from "@/hooks/useUserPresence";
import { useAuth } from "@/contexts/AuthContext";
import { useSharedFiles } from "@/hooks/useSharedFiles";
import { useAiHelpConversation } from "@/hooks/useAiHelpConversation";
import { AI_HELP_USER_ID, AI_HELP_USER_NAME, isAiHelpUserId } from "@/lib/aiHelp";
import {
  clearConversationSelection,
  selectConversationDirect,
  selectConversationFromWork,
  selectWorkConversation,
  type ActiveWorkConversationContext,
} from "@/components/chatCenterContext";

import { ConversationListPanel } from "@/components/messaging/ConversationListPanel";
import { WorksPanel } from "@/components/messaging/WorksPanel";
import { ContactsPanel } from "@/components/messaging/ContactsPanel";
import { ConversationDetailPanel } from "@/components/messaging/ConversationDetailPanel";
import { useWorkConversationSummaries } from "@/hooks/useWorkConversationSummaries";

export const ChatCenter = () => {
  const { user } = useAuth();
  const currentUserId = user ? String(user.id) : null;

  // ---- Hooks (unchanged) ----
  const {
    messages,
    unreadCount,
    sendMessage,
    markAsRead,
    deleteConversation,
    clearAllMessages,
    reloadMessages,
  } = useMessages();
  const { users: contacts, loading: loadingContacts } = useMessageableUsers();
  const {
    messages: aiHelpMessages,
    sending: sendingAiHelp,
    sendMessage: sendAiHelpMessage,
  } = useAiHelpConversation();
  const { works, membersByWorkId, loadingWorks, loadingMembersByWorkId, loadMembersForWork } =
    useWorkMessageDirectory();
  const { isUserOnline } = useUserPresence();
  const { shareFile, sentFiles, receivedFiles, downloadFile, getFileBlob, reloadFiles } =
    useSharedFiles();

  // ---- Work conversation summaries (for Conversaciones tab) ----
  const {
    summaries: workConversationSummaries,
    reload: reloadWorkConversationSummaries,
  } = useWorkConversationSummaries(works, true);

  // ---- Selection state ----
  const [open, setOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [activeWorkContext, setActiveWorkContext] =
    useState<ActiveWorkConversationContext | null>(null);
  const [selectedWorkConversation, setSelectedWorkConversation] =
    useState<ActiveWorkConversationContext | null>(null);
  const [activeTab, setActiveTab] = useState<string>("conversations");

  const hasActiveConversation = Boolean(selectedUserId || selectedWorkConversation);

  // ---- Project conversation hook (enabled only when a work conversation is selected) ----
  const {
    participantCount: projectConversationParticipantCount,
    messages: projectConversationMessages,
    loading: loadingProjectConversation,
    sending: sendingProjectConversation,
    error: projectConversationError,
    reload: reloadProjectConversation,
    sendMessage: sendProjectConversationMessage,
  } = useProjectConversation(
    selectedWorkConversation,
    open && selectedWorkConversation !== null,
  );

  // ---- External open/close events (for ChatBubble) ----
  useEffect(() => {
    const openHandler = () => setOpen(true);
    const closeHandler = () => setOpen(false);
    document.addEventListener("open-chat-center", openHandler as EventListener);
    document.addEventListener("close-chat-center", closeHandler as EventListener);
    return () => {
      document.removeEventListener("open-chat-center", openHandler as EventListener);
      document.removeEventListener("close-chat-center", closeHandler as EventListener);
    };
  }, []);

  useEffect(() => {
    document.dispatchEvent(new CustomEvent("chat-center-state", { detail: { open } }));
  }, [open]);

  // ---- Reload data when drawer opens ----
  useEffect(() => {
    if (open) {
      reloadMessages();
      reloadFiles();
      void reloadWorkConversationSummaries();
      if (selectedWorkConversation) {
        void reloadProjectConversation();
      }
    }
  }, [open, reloadFiles, reloadMessages, reloadWorkConversationSummaries, reloadProjectConversation, selectedWorkConversation]);

  // ---- Auto mark-as-read for selected DM ----
  useEffect(() => {
    if (!open || !currentUserId || !selectedUserId || isAiHelpUserId(selectedUserId)) return;
    messages
      .filter(
        (m) =>
          m.from_user_id === selectedUserId &&
          m.to_user_id === currentUserId &&
          !m.read,
      )
      .forEach((m) => markAsRead(m.id));
  }, [open, currentUserId, selectedUserId, messages, markAsRead]);

  // ---- Selection helpers ----
  const applySelection = (next: ReturnType<typeof clearConversationSelection>) => {
    setSelectedUserId(next.selectedUserId);
    setActiveWorkContext(next.activeWorkContext);
    setSelectedWorkConversation(next.selectedWorkConversation);
  };

  const openConversationDirect = (userId: string) => {
    applySelection(selectConversationDirect(userId));
  };

  const openConversationFromWork = (
    userId: string,
    workContext: ActiveWorkConversationContext,
  ) => {
    applySelection(selectConversationFromWork(userId, workContext));
  };

  const openProjectConversation = (workContext: ActiveWorkConversationContext) => {
    applySelection(selectWorkConversation(workContext));
  };

  const resetConversationSelection = () => {
    applySelection(clearConversationSelection());
  };

  const handleDeleteConversation = (userId: string) => {
    deleteConversation(userId);
    if (selectedUserId === userId) resetConversationSelection();
  };

  // ---- Resolve selected user info ----
  const selectedUser = (() => {
    if (!selectedUserId) return undefined;
    if (isAiHelpUserId(selectedUserId)) {
      return { id: AI_HELP_USER_ID, full_name: AI_HELP_USER_NAME, roles: [], approved: true };
    }
    const fromContacts = contacts.find((c) => c.id === selectedUserId);
    if (fromContacts) return fromContacts;
    const fromWorkMembers = Object.values(membersByWorkId)
      .flat()
      .find((member) => member.id === selectedUserId);
    if (fromWorkMembers) {
      return { id: fromWorkMembers.id, full_name: fromWorkMembers.full_name, roles: [], approved: true };
    }
    // Fallback from message data
    for (const m of messages) {
      const isFromMe = m.from_user_id === currentUserId;
      const otherId = isFromMe ? m.to_user_id : m.from_user_id;
      if (otherId === selectedUserId) {
        const name = (isFromMe ? m.to_user?.full_name : m.from_user?.full_name) || "Usuario";
        return { id: selectedUserId, full_name: name, roles: [], approved: true };
      }
    }
    return undefined;
  })();

  // ---- Render ----
  return (
    <Drawer open={open} onOpenChange={setOpen} dismissible>
      <DrawerContent
        className="h-[100svh] overflow-hidden bg-white"
        onPointerDownOutside={() => setOpen(false)}
        onInteractOutside={() => setOpen(false)}
      >
        {/* Header */}
        <DrawerHeader className="pb-0 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DrawerTitle className="text-xl">Mensajería</DrawerTitle>
              <DrawerDescription className="text-sm">
                Chatea con tu equipo en tiempo real
              </DrawerDescription>
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
                    Esta acción eliminará permanentemente todos tus mensajes y
                    conversaciones. No se puede deshacer.
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

        {/* Main area: full-screen list OR full-screen detail — never both */}
        <div className="flex-1 min-h-0 flex flex-col h-full">
          {/* ===== LIST (hidden when conversation active) ===== */}
          <div
            className={`${hasActiveConversation ? "hidden" : "flex"} flex-col min-h-0 flex-1`}
          >
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex flex-col min-h-0 h-full"
            >
              <div className="px-3 pt-3 pb-0">
                <TabsList className="w-full h-11">
                  <TabsTrigger value="conversations" className="flex-1 gap-2 text-base">
                    <MessageCircle className="h-4 w-4" />
                    Chats
                  </TabsTrigger>
                  <TabsTrigger value="works" className="flex-1 gap-2 text-base">
                    <Building2 className="h-4 w-4" />
                    Obras
                  </TabsTrigger>
                  <TabsTrigger value="contacts" className="flex-1 gap-2 text-base">
                    <Users className="h-4 w-4" />
                    Contactos
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent
                value="conversations"
                className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden"
              >
                <ConversationListPanel
                  currentUserId={currentUserId}
                  messages={messages}
                  loadingContacts={loadingContacts}
                  selectedUserId={selectedUserId}
                  selectedWorkConversationId={selectedWorkConversation?.workId ?? null}
                  aiHelpMessages={aiHelpMessages}
                  onSelectConversation={openConversationDirect}
                  onDeleteConversation={handleDeleteConversation}
                  workConversationSummaries={workConversationSummaries}
                  onSelectWorkConversation={(workId, workName) =>
                    openProjectConversation({ workId, workName })
                  }
                />
              </TabsContent>

              <TabsContent
                value="works"
                className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden"
              >
                <WorksPanel
                  works={works}
                  loadingWorks={loadingWorks}
                  membersByWorkId={membersByWorkId}
                  loadingMembersByWorkId={loadingMembersByWorkId}
                  loadMembersForWork={loadMembersForWork}
                  onSelectMemberDM={openConversationFromWork}
                  selectedUserId={selectedUserId}
                />
              </TabsContent>

              <TabsContent
                value="contacts"
                className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden"
              >
                <ContactsPanel
                  contacts={contacts}
                  loading={loadingContacts}
                  selectedUserId={selectedUserId}
                  isUserOnline={isUserOnline}
                  onSelectContact={openConversationDirect}
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* ===== DETAIL (full-screen when conversation active) ===== */}
          {hasActiveConversation && (
          <div className="flex flex-col min-h-0 flex-1">

            <ConversationDetailPanel
              currentUserId={currentUserId}
              currentUserName={user?.full_name}
              selectedUser={selectedUser}
              selectedWorkConversation={selectedWorkConversation}
              activeWorkContext={activeWorkContext}
              isUserOnline={isUserOnline}
              messages={messages}
              sendMessage={sendMessage}
              projectConversationMessages={projectConversationMessages}
              projectConversationParticipantCount={projectConversationParticipantCount}
              loadingProjectConversation={loadingProjectConversation}
              sendingProjectConversation={sendingProjectConversation}
              projectConversationError={projectConversationError ?? null}
              sendProjectConversationMessage={sendProjectConversationMessage}
              aiHelpMessages={aiHelpMessages}
              sendingAiHelp={sendingAiHelp}
              sendAiHelpMessage={sendAiHelpMessage}
              sentFiles={sentFiles}
              receivedFiles={receivedFiles}
              shareFile={shareFile}
              getFileBlob={getFileBlob}
              downloadFile={downloadFile}
              onBack={resetConversationSelection}
            />
          </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};
