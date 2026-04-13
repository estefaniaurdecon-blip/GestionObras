import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Building2,
  MessageCircle,
  Settings,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
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
  CHAT_UNREAD_COUNT_EVENT,
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
import { FavoriteContactsDialog } from "@/components/messaging/FavoriteContactsDialog";
import { useWorkConversationSummaries } from "@/hooks/useWorkConversationSummaries";
import { useFavoriteContacts } from "@/hooks/useFavoriteContacts";

export const ChatCenter = () => {
  const { user } = useAuth();
  const currentUserId = user ? String(user.id) : null;
  const currentTenantId = user?.tenant_id != null ? String(user.tenant_id) : null;
  const [open, setOpen] = useState(false);

  const {
    messages,
    unreadCount,
    sendMessage,
    markAsRead,
    deleteConversation,
    clearAllMessages,
  } = useMessages();
  const { users: contacts, loading: loadingContacts } = useMessageableUsers();
  const {
    messages: aiHelpMessages,
    sending: sendingAiHelp,
    sendMessage: sendAiHelpMessage,
  } = useAiHelpConversation();
  const {
    works,
    membersByWorkId,
    loadingWorks,
    loadingMembersByWorkId,
    loadMembersForWork,
  } = useWorkMessageDirectory();
  const { isUserOnline } = useUserPresence();
  const { shareFile, sentFiles, receivedFiles, downloadFile, getFileBlob } =
    useSharedFiles(open);

  const {
    summaries: workConversationSummaries,
  } = useWorkConversationSummaries(works, open);

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [activeWorkContext, setActiveWorkContext] =
    useState<ActiveWorkConversationContext | null>(null);
  const [selectedWorkConversation, setSelectedWorkConversation] =
    useState<ActiveWorkConversationContext | null>(null);
  const [activeTab, setActiveTab] = useState<string>("conversations");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [favoritesDialogOpen, setFavoritesDialogOpen] = useState(false);

  const { favoriteContactIds, toggleFavoriteContact } = useFavoriteContacts(
    currentUserId,
    currentTenantId,
  );
  const visibleFavoriteContactIds = useMemo(() => {
    const availableContactIds = new Set(contacts.map((contact) => contact.id));
    return favoriteContactIds.filter((contactId) => availableContactIds.has(contactId));
  }, [contacts, favoriteContactIds]);

  const hasActiveConversation = Boolean(selectedUserId || selectedWorkConversation);

  const {
    participantCount: projectConversationParticipantCount,
    messages: projectConversationMessages,
    loading: loadingProjectConversation,
    sending: sendingProjectConversation,
    error: projectConversationError,
    sendMessage: sendProjectConversationMessage,
  } = useProjectConversation(
    selectedWorkConversation,
    open && selectedWorkConversation !== null,
  );

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

  useEffect(() => {
    document.dispatchEvent(
      new CustomEvent(CHAT_UNREAD_COUNT_EVENT, { detail: { unreadCount } }),
    );
  }, [unreadCount]);

  useEffect(() => {
    if (!open) {
      setSettingsOpen(false);
      setFavoritesDialogOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !currentUserId || !selectedUserId || isAiHelpUserId(selectedUserId)) {
      return;
    }

    messages
      .filter(
        (message) =>
          message.from_user_id === selectedUserId &&
          message.to_user_id === currentUserId &&
          !message.read,
      )
      .forEach((message) => markAsRead(message.id));
  }, [open, currentUserId, selectedUserId, messages, markAsRead]);

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
    if (selectedUserId === userId) {
      resetConversationSelection();
    }
  };

  const selectedUser = (() => {
    if (!selectedUserId) {
      return undefined;
    }

    if (isAiHelpUserId(selectedUserId)) {
      return {
        id: AI_HELP_USER_ID,
        full_name: AI_HELP_USER_NAME,
        roles: [],
        approved: true,
      };
    }

    const fromContacts = contacts.find((contact) => contact.id === selectedUserId);
    if (fromContacts) {
      return fromContacts;
    }

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

    for (const message of messages) {
      const isFromMe = message.from_user_id === currentUserId;
      const otherId = isFromMe ? message.to_user_id : message.from_user_id;

      if (otherId === selectedUserId) {
        const name =
          (isFromMe ? message.to_user?.full_name : message.from_user?.full_name) ||
          "Usuario";

        return {
          id: selectedUserId,
          full_name: name,
          roles: [],
          approved: true,
        };
      }
    }

    return undefined;
  })();

  return (
    <Drawer open={open} onOpenChange={setOpen} dismissible>
      <DrawerContent
        className="h-[100svh] overflow-hidden bg-white"
        onPointerDownOutside={() => setOpen(false)}
        onInteractOutside={() => setOpen(false)}
      >
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Ajustes de mensajeria</DialogTitle>
              <DialogDescription>
                Gestiona las acciones generales de esta ventana.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="space-y-2">
                  <h3 className="text-base font-semibold text-foreground">
                    Contactos favoritos
                  </h3>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Elige los contactos que quieras ver primero en tus listas de
                    conversaciones y contactos.
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {visibleFavoriteContactIds.length === 0
                      ? "Aun no has marcado ningun favorito."
                      : `${visibleFavoriteContactIds.length} contacto(s) marcado(s) como favorito(s).`}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() => setFavoritesDialogOpen(true)}
                  >
                    <Star className="h-4 w-4" />
                    Gestionar
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="space-y-2">
                  <h3 className="text-base font-semibold text-foreground">
                    Borrar conversaciones
                  </h3>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Elimina todos los mensajes guardados en esta ventana de
                    mensajeria. Esta accion no se puede deshacer.
                  </p>
                </div>

                <div className="mt-4 flex justify-end">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        className="gap-2"
                        title="Vaciar todos los mensajes"
                      >
                        <Trash2 className="h-4 w-4" />
                        Vaciar mensajes
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Vaciar todos los mensajes</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta accion eliminara permanentemente todos tus mensajes
                          y conversaciones. No se puede deshacer.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            clearAllMessages();
                            resetConversationSelection();
                            setSettingsOpen(false);
                          }}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Vaciar mensajes
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <FavoriteContactsDialog
          open={favoritesDialogOpen}
          onOpenChange={setFavoritesDialogOpen}
          contacts={contacts}
          favoriteContactIds={visibleFavoriteContactIds}
          onToggleFavorite={toggleFavoriteContact}
        />

        <DrawerHeader className="border-b pb-0">
          <div className="flex items-center justify-between">
            <div>
              <DrawerTitle className="text-xl">Mensajeria</DrawerTitle>
              <DrawerDescription className="text-sm">
                Chatea con tu equipo en tiempo real
              </DrawerDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                title="Ajustes de mensajeria"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                title="Cerrar mensajeria"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DrawerHeader>

        <div className="flex h-full min-h-0 flex-1 flex-col">
          <div
            className={`${hasActiveConversation ? "hidden" : "flex"} min-h-0 flex-1 flex-col`}
          >
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex h-full min-h-0 flex-col"
            >
              <div className="px-3 pb-0 pt-3">
                <TabsList className="h-11 w-full">
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
                className="mt-0 flex-1 min-h-0 data-[state=inactive]:hidden"
              >
                <ConversationListPanel
                  currentUserId={currentUserId}
                  messages={messages}
                  favoriteContactIds={visibleFavoriteContactIds}
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
                className="mt-0 flex-1 min-h-0 data-[state=inactive]:hidden"
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
                className="mt-0 flex-1 min-h-0 data-[state=inactive]:hidden"
              >
                <ContactsPanel
                  contacts={contacts}
                  favoriteContactIds={visibleFavoriteContactIds}
                  loading={loadingContacts}
                  selectedUserId={selectedUserId}
                  isUserOnline={isUserOnline}
                  onSelectContact={openConversationDirect}
                />
              </TabsContent>
            </Tabs>
          </div>

          {hasActiveConversation && (
            <div className="flex min-h-0 flex-1 flex-col">
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
