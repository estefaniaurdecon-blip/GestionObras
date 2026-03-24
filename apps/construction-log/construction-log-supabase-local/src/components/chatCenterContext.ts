export interface ActiveWorkConversationContext {
  workId: number;
  workName: string;
}

export interface ConversationSelectionState {
  selectedUserId: string;
  activeWorkContext: ActiveWorkConversationContext | null;
  selectedWorkConversation: ActiveWorkConversationContext | null;
}

export function selectConversationFromWork(
  userId: string,
  work: ActiveWorkConversationContext,
): ConversationSelectionState {
  return {
    selectedUserId: userId,
    activeWorkContext: work,
    selectedWorkConversation: null,
  };
}

export function selectConversationDirect(
  userId: string,
): ConversationSelectionState {
  return {
    selectedUserId: userId,
    activeWorkContext: null,
    selectedWorkConversation: null,
  };
}

export function selectWorkConversation(
  work: ActiveWorkConversationContext,
): ConversationSelectionState {
  return {
    selectedUserId: "",
    activeWorkContext: null,
    selectedWorkConversation: work,
  };
}

export function clearConversationSelection(): ConversationSelectionState {
  return {
    selectedUserId: "",
    activeWorkContext: null,
    selectedWorkConversation: null,
  };
}
