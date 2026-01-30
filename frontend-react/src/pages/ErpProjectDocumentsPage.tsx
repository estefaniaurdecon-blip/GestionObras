import React, { useMemo } from "react";
import {
  Box,
  Button,
  Heading,
  HStack,
  Input,
  Stack,
  Text,
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";
import { useParams, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "../components/layout/AppShell";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { fetchErpProject, type ErpProject } from "../api/erpReports";
import {
  fetchProjectDocuments,
  uploadProjectDocument,
  type ProjectDocument,
} from "../api/projectDocuments";
import { apiClient } from "../api/client";

export const ErpProjectDocumentsPage: React.FC = () => {
  const { projectId } = useParams({ strict: false }) as { projectId?: string };
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.600", "gray.300");

  const numericProjectId = projectId ? Number(projectId) : NaN;
  const isValidProject = Number.isFinite(numericProjectId);

  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = Boolean(currentUser?.is_super_admin);
  const tenantId = currentUser?.tenant_id ?? null;
  const effectiveTenantId = isSuperAdmin ? undefined : tenantId ?? undefined;

  const projectQuery = useQuery<ErpProject>({
    queryKey: ["erp-project", numericProjectId, effectiveTenantId ?? "all"],
    queryFn: () => fetchErpProject(numericProjectId, effectiveTenantId),
    enabled: isValidProject,
  });

  const documentsQuery = useQuery<ProjectDocument[]>({
    queryKey: ["project-documents", numericProjectId, effectiveTenantId ?? "all"],
    queryFn: () => fetchProjectDocuments(numericProjectId, effectiveTenantId),
    enabled: isValidProject,
  });

  const uploadMutation = useMutation({
    mutationFn: (payload: { file: File; docType: string }) =>
      uploadProjectDocument(
        numericProjectId,
        payload.file,
        payload.docType,
        effectiveTenantId,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["project-documents", numericProjectId, effectiveTenantId ?? "all"],
      });
      toast({ title: "Documento subido", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al subir",
        description:
          error?.response?.data?.detail ?? "No se pudo subir el documento.",
        status: "error",
      });
    },
  });

  const selectedProject: ErpProject | null = useMemo(() => {
    if (!projectQuery.data) return null;
    return projectQuery.data;
  }, [projectQuery.data]);
  const baseUrl = apiClient.defaults.baseURL || window.location.origin;

  const docTypeOptions = [
    { value: "solicitud", label: "Solicitud" },
    { value: "resolucion", label: "Resolucion" },
    { value: "justificacion", label: "Justificacion" },
    { value: "contratos", label: "Contratos" },
    { value: "presupuestos", label: "Presupuestos" },
  ];
  const documentsByType = useMemo(() => {
    const grouped: Record<string, ProjectDocument[]> = {};
    docTypeOptions.forEach((opt) => {
      grouped[opt.value] = [];
    });
    (documentsQuery.data ?? []).forEach((doc) => {
      const key = doc.doc_type || "otros";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(doc);
    });
    return grouped;
  }, [documentsQuery.data, docTypeOptions]);

  return (
    <AppShell>
      <HStack justify="space-between" align="flex-start" mb={6}>
        <Box>
          <Heading size="lg">Documentacion del proyecto</Heading>
          <Text color={subtleText} fontSize="sm">
            {selectedProject?.name ?? "Proyecto"}
          </Text>
        </Box>
        <Button variant="outline" onClick={() => router.history.back()}>
          Volver
        </Button>
      </HStack>

      {!isValidProject && (
        <Text color="red.500">Proyecto no valido.</Text>
      )}

      {isValidProject && (
        <Stack spacing={6}>
          {docTypeOptions.map((section) => (
            <Box
              key={section.value}
              borderWidth="1px"
              borderRadius="lg"
              p={4}
              bg={cardBg}
            >
              <Heading size="sm" mb={3}>
                {section.label}
              </Heading>
              <HStack spacing={3} align="center" mb={4}>
                <Input
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      uploadMutation.mutate({
                        file,
                        docType: section.value,
                      });
                      event.target.value = "";
                    }
                  }}
                  isDisabled={uploadMutation.isPending}
                />
              </HStack>

              {documentsQuery.isLoading && (
                <Text color={subtleText}>Cargando documentos...</Text>
              )}
              {documentsQuery.isError && (
                <Text color="red.500">No se pudieron cargar los documentos.</Text>
              )}
              {!documentsQuery.isLoading &&
                documentsByType[section.value]?.length === 0 && (
                  <Text color={subtleText}>Sin documentacion subida.</Text>
                )}
              <Stack spacing={2}>
                {(documentsByType[section.value] ?? []).map((doc) => (
                  <HStack
                    key={doc.id}
                    justify="space-between"
                    borderWidth="1px"
                    borderRadius="md"
                    p={3}
                  >
                    <Box>
                      <Text fontSize="sm" fontWeight="semibold">
                        {doc.original_name}
                      </Text>
                      <Text fontSize="xs" color={subtleText}>
                        {(doc.size_bytes / 1024).toFixed(1)} KB
                      </Text>
                    </Box>
                    <Button
                      as="a"
                      href={
                        doc.url.startsWith("http")
                          ? doc.url
                          : `${baseUrl}${doc.url}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      size="sm"
                      variant="outline"
                    >
                      Ver
                    </Button>
                  </HStack>
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </AppShell>
  );
};

export default ErpProjectDocumentsPage;
