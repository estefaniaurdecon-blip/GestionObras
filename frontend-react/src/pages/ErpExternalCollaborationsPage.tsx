import React, { useMemo, useState } from "react";
import {
  Box,
  Button,
  Heading,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { useTranslation } from "react-i18next";

import type {
  ExternalCollaboration,
  ExternalCollaborationCreate,
  ExternalCollaborationType,
} from "../api/externalCollaborations";
import { ExternalCollaborationsForm } from "../components/external-collaborations/ExternalCollaborationsForm";
import { ExternalCollaborationsTable } from "../components/external-collaborations/ExternalCollaborationsTable";
import { AppShell } from "../components/layout/AppShell";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useExternalCollaborations } from "../hooks/useExternalCollaborations";

export const ErpExternalCollaborationsPage: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const cardBg = useColorModeValue("white", "gray.700");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = Boolean(currentUser?.is_super_admin);
  const effectiveTenantId = isSuperAdmin
    ? undefined
    : currentUser?.tenant_id ?? undefined;
  const { listQuery, createMutation, updateMutation, deleteMutation } =
    useExternalCollaborations(effectiveTenantId);

  const typeOptions = useMemo<ExternalCollaborationType[]>(
    () => [
      "Universidades",
      "Auditoria",
      "Consultoras",
      "Centros tecnologicos",
    ],
    [],
  );

  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formValues, setFormValues] = useState<ExternalCollaborationCreate>({
    collaboration_type: typeOptions[0],
    name: "",
    legal_name: "",
    cif: "",
    contact_email: "",
  });

  const resetForm = () => {
    setFormValues({
      collaboration_type: typeOptions[0],
      name: "",
      legal_name: "",
      cif: "",
      contact_email: "",
    });
    setEditingId(null);
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const handleFieldChange = (
    field: keyof ExternalCollaborationCreate,
    value: string,
  ) => {
    setFormValues((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const validate = () => {
    const payload = {
      collaboration_type: formValues.collaboration_type,
      name: formValues.name.trim(),
      legal_name: formValues.legal_name.trim(),
      cif: formValues.cif.trim(),
      contact_email: formValues.contact_email.trim(),
    };
    if (
      !payload.name ||
      !payload.legal_name ||
      !payload.cif ||
      !payload.contact_email ||
      !payload.collaboration_type
    ) {
      toast({
        title: t("externalCollaborations.messages.missingTitle"),
        description: t("externalCollaborations.messages.missingDesc"),
        status: "warning",
      });
      return null;
    }
    return payload;
  };

  const handleSubmit = () => {
    const payload = validate();
    if (!payload) return;
    if (editingId) {
      updateMutation.mutate(
        { collaborationId: editingId, payload },
        {
          onSuccess: () => {
            toast({
              title: t("externalCollaborations.messages.updateTitle"),
              status: "success",
            });
            closeModal();
          },
        },
      );
      return;
    }
    createMutation.mutate(payload, {
      onSuccess: () => {
        toast({
          title: t("externalCollaborations.messages.createTitle"),
          status: "success",
        });
        closeModal();
      },
    });
  };

  const handleEdit = (entry: ExternalCollaboration) => {
    setEditingId(entry.id);
    setFormValues({
      collaboration_type: entry.collaboration_type,
      name: entry.name,
      legal_name: entry.legal_name,
      cif: entry.cif,
      contact_email: entry.contact_email,
    });
    setIsModalOpen(true);
  };

  const handleDelete = (entryId: number) => {
    setDeletingId(entryId);
    deleteMutation.mutate(entryId, {
      onSettled: () => setDeletingId(null),
    });
  };

  return (
    <AppShell>
      <Box
        borderRadius="2xl"
        p={{ base: 6, md: 8 }}
        bgGradient="linear(120deg, var(--chakra-colors-brand-700) 0%, var(--chakra-colors-brand-500) 55%, var(--chakra-colors-brand-300) 110%)"
        color="white"
        boxShadow="lg"
        position="relative"
        overflow="hidden"
        animation={`${fadeUp} 0.6s ease-out`}
        mb={8}
      >
        <Box
          position="absolute"
          inset="0"
          opacity={0.2}
          bgImage="radial-gradient(circle at 20% 20%, rgba(255,255,255,0.4), transparent 55%)"
        />
        <Stack position="relative" spacing={3}>
          <Text textTransform="uppercase" fontSize="xs" letterSpacing="0.2em">
            {t("externalCollaborations.header.eyebrow")}
          </Text>
          <Heading size="lg">{t("externalCollaborations.header.title")}</Heading>
          <Text fontSize="sm" opacity={0.9}>
            {t("externalCollaborations.header.subtitle")}
          </Text>
        </Stack>
      </Box>

      <Box mb={6} display="flex" justifyContent="flex-end">
        <Button colorScheme="green" onClick={openCreateModal}>
          {t("externalCollaborations.actions.addNew")}
        </Button>
      </Box>

      {listQuery.isError ? (
        <Text color="red.500" fontSize="sm">
          {t("externalCollaborations.messages.loadError")}
        </Text>
      ) : (
        <ExternalCollaborationsTable
          items={listQuery.data ?? []}
          onEdit={handleEdit}
          onDelete={(entry) => handleDelete(entry.id)}
          deletingId={deletingId}
        />
      )}

      <Modal isOpen={isModalOpen} onClose={closeModal} size="2xl">
        <ModalOverlay />
        <ModalContent maxW="960px">
          <ModalHeader>
            {editingId
              ? t("externalCollaborations.form.update")
              : t("externalCollaborations.form.add")}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <ExternalCollaborationsForm
              values={formValues}
              typeOptions={typeOptions}
              mode={editingId ? "edit" : "create"}
              isSubmitting={createMutation.isPending || updateMutation.isPending}
              onFieldChange={handleFieldChange}
              onSubmit={handleSubmit}
              showActions={false}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={closeModal}>
              {t("common.cancel")}
            </Button>
            <Button
              colorScheme="green"
              onClick={handleSubmit}
              isLoading={createMutation.isPending || updateMutation.isPending}
            >
              {editingId
                ? t("externalCollaborations.form.update")
                : t("externalCollaborations.form.add")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </AppShell>
  );
};
