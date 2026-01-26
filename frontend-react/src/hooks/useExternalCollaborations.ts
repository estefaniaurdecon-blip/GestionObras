import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createExternalCollaboration,
  deleteExternalCollaboration,
  fetchExternalCollaborations,
  updateExternalCollaboration,
  type ExternalCollaborationCreate,
  type ExternalCollaborationUpdate,
} from "../api/externalCollaborations";

const QUERY_KEY = ["external-collaborations"];

export const useExternalCollaborations = () => {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchExternalCollaborations,
  });

  const createMutation = useMutation({
    mutationFn: (payload: ExternalCollaborationCreate) =>
      createExternalCollaboration(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      collaborationId,
      payload,
    }: {
      collaborationId: number;
      payload: ExternalCollaborationUpdate;
    }) => updateExternalCollaboration(collaborationId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (collaborationId: number) =>
      deleteExternalCollaboration(collaborationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  return {
    listQuery,
    createMutation,
    updateMutation,
    deleteMutation,
  };
};
