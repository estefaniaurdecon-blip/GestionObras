import React, { useMemo, useState } from "react";
import { Box, Heading, Stack, Text, useColorModeValue, useToast } from "@chakra-ui/react";
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
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const { data: currentUser } = useCurrentUser();
  const effectiveTenantId = currentUser?.is_super_admin
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
            resetForm();
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
        resetForm();
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
        bgGradient="linear(120deg, #0f3d2e 0%, #0c6b3f 55%, #caa85b 110%)"
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

      <Box
        bg={cardBg}
        borderWidth="1px"
        borderRadius="xl"
        p={{ base: 4, md: 6 }}
        mb={6}
      >
        <ExternalCollaborationsForm
          values={formValues}
          typeOptions={typeOptions}
          mode={editingId ? "edit" : "create"}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
          onFieldChange={handleFieldChange}
          onSubmit={handleSubmit}
          onCancel={resetForm}
        />
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
    </AppShell>
  );
};
