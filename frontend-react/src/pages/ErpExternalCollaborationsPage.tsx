import React, { useMemo, useState } from "react";
import { Box, Heading, Text, useColorModeValue, useToast } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import type {
  ExternalCollaboration,
  ExternalCollaborationCreate,
  ExternalCollaborationType,
} from "../api/externalCollaborations";
import { ExternalCollaborationsForm } from "../components/external-collaborations/ExternalCollaborationsForm";
import { ExternalCollaborationsTable } from "../components/external-collaborations/ExternalCollaborationsTable";
import { AppShell } from "../components/layout/AppShell";
import { useExternalCollaborations } from "../hooks/useExternalCollaborations";

export const ErpExternalCollaborationsPage: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.600", "gray.300");

  const { listQuery, createMutation, updateMutation, deleteMutation } =
    useExternalCollaborations();

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
      <Box mb={6}>
        <Heading size="lg">{t("externalCollaborations.header.title")}</Heading>
        <Text color={subtleText} fontSize="sm">
          {t("externalCollaborations.header.subtitle")}
        </Text>
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
