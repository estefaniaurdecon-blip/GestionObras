import React, { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Textarea,
  Th,
  Thead,
  Tr,
  useColorModeValue,
  useToast,
  Switch,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { AppShell } from "../components/layout/AppShell";
import { PageHero } from "../components/layout/PageHero";
import {
  fetchAllTenants,
  fetchUsersByTenant,
  type TenantOption,
  type TenantUserSummary,
} from "../api/users";
import { useCurrentUser } from "../hooks/useCurrentUser";
import {
  Ticket,
  TicketPriority,
  TicketStatus,
  TicketMessage,
  addTicketMessage,
  closeTicket,
  createTicket,
  fetchTicketMessages,
  fetchTickets,
  reopenTicket,
} from "../api/tickets";

const formatDateTime = (iso?: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString();
};

// Pantalla de soporte: listado de tickets y conversacion.
export const SupportTicketsPage: React.FC = () => {
  // Utilidades y estilos base.
  const toast = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue("white", "gray.700");
  const tableHeadBg = useColorModeValue("gray.50", "gray.800");
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const rowHoverBg = useColorModeValue("gray.50", "gray.600");
  const rowActiveBg = useColorModeValue("gray.100", "gray.600");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const [statusFilter, setStatusFilter] = useState<"" | TicketStatus>("");
  const [priorityFilter, setPriorityFilter] = useState<"" | TicketPriority>("");
  const [mineOnly, setMineOnly] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);

  const [newSubject, setNewSubject] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriority, setNewPriority] = useState<TicketPriority>("medium");
  const [newToolSlug, setNewToolSlug] = useState("");

  const [replyBody, setReplyBody] = useState("");
  const [replyInternal, setReplyInternal] = useState(false);
  const [assigneeId, setAssigneeId] = useState<number | "">("");

  const statusOptions = useMemo(
    () => [
      { value: "open", label: t("support.status.open") },
      { value: "in_progress", label: t("support.status.inProgress") },
      { value: "resolved", label: t("support.status.resolved") },
      { value: "closed", label: t("support.status.closed") },
    ],
    [t]
  );

  const priorityOptions = useMemo(
    () => [
      { value: "low", label: t("support.priority.low") },
      { value: "medium", label: t("support.priority.medium") },
      { value: "high", label: t("support.priority.high") },
      { value: "critical", label: t("support.priority.critical") },
    ],
    [t]
  );

  // Datos del usuario actual
  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin =
    currentUser?.is_super_admin === true ||
    currentUser?.email === "dios@cortecelestial.god";
  const currentTenantId = currentUser?.tenant_id ?? null;

  // Filtro de tenant solo para Super Admin
  const [tenantFilterId, setTenantFilterId] = useState<number | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) return;
    if (tenantFilterId !== null) return;
    if (currentTenantId) {
      setTenantFilterId(currentTenantId);
    }
  }, [currentTenantId, isSuperAdmin, tenantFilterId]);

  // Carga de tickets segun filtros.
  const ticketsQuery = useQuery<Ticket[]>({
    queryKey: [
      "tickets",
      { statusFilter, priorityFilter, mineOnly, tenantFilterId },
    ],
    queryFn: () =>
      fetchTickets({
        tenant_id: isSuperAdmin ? tenantFilterId ?? undefined : undefined,
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        mine_only: mineOnly || undefined,
        limit: 50,
        offset: 0,
      }),
  });

  const selectedTicket = useMemo(
    () => ticketsQuery.data?.find((t) => t.id === selectedTicketId) ?? null,
    [ticketsQuery.data, selectedTicketId],
  );

  // Carga de mensajes para el ticket seleccionado.
  const messagesQuery = useQuery<TicketMessage[]>({
    queryKey: ["ticket-messages", selectedTicketId],
    queryFn: () => fetchTicketMessages(selectedTicketId as number),
    enabled: selectedTicketId !== null,
  });

  const assigneesQuery = useQuery<TenantUserSummary[]>({
    queryKey: ["ticket-assignees", selectedTicket?.tenant_id],
    queryFn: () => fetchUsersByTenant(selectedTicket!.tenant_id),
    enabled: Boolean(selectedTicket?.tenant_id),
  });

  const tenantsQuery = useQuery<TenantOption[]>({
    queryKey: ["all-tenants"],
    queryFn: fetchAllTenants,
    enabled: isSuperAdmin,
  });

  // Mutacion de creacion de ticket.
  const createMutation = useMutation({
    mutationFn: () =>
      createTicket({
        subject: newSubject,
        description: newDescription,
        priority: newPriority,
        tool_slug: newToolSlug || undefined,
      }),
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast({
        title: t("support.messages.createSuccessTitle"),
        description: t("support.messages.createSuccessDesc"),
        status: "success",
      });
      setNewSubject("");
      setNewDescription("");
      setNewToolSlug("");
      setSelectedTicketId(ticket.id);
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ??
        error?.message ??
        t("support.messages.createErrorFallback");
      toast({
        title: t("support.messages.createErrorTitle"),
        description: detail,
        status: "error",
      });
    },
  });

  // Mutacion de envio de mensajes.
  const replyMutation = useMutation({
    mutationFn: () =>
      addTicketMessage({
        ticketId: selectedTicketId as number,
        body: replyBody,
        is_internal: replyInternal,
      }),
    onSuccess: () => {
      if (selectedTicketId) {
        queryClient.invalidateQueries({
          queryKey: ["ticket-messages", selectedTicketId],
        });
        queryClient.invalidateQueries({ queryKey: ["tickets"] });
      }
      setReplyBody("");
      setReplyInternal(false);
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ??
        error?.message ??
        t("support.messages.replyErrorFallback");
      toast({
        title: t("support.messages.replyErrorTitle"),
        description: detail,
        status: "error",
      });
    },
  });

  // Mutacion para cerrar ticket.
  const closeMutation = useMutation({
    mutationFn: () => closeTicket(selectedTicketId as number),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      if (selectedTicketId) {
        queryClient.invalidateQueries({
          queryKey: ["ticket-messages", selectedTicketId],
        });
      }
      toast({
        title: t("support.messages.closeSuccessTitle"),
        status: "success",
      });
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ??
        t("support.messages.closeErrorFallback");
      toast({
        title: t("support.messages.closeErrorTitle"),
        description: detail,
        status: "error",
      });
    },
  });

  // Mutacion para reabrir ticket.
  const reopenMutation = useMutation({
    mutationFn: () => reopenTicket(selectedTicketId as number),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast({
        title: t("support.messages.reopenSuccessTitle"),
        status: "success",
      });
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ??
        t("support.messages.reopenErrorFallback");
      toast({
        title: t("support.messages.reopenErrorTitle"),
        description: detail,
        status: "error",
      });
    },
  });

  // Mutacion para asignar ticket a un usuario.
  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTicketId || !assigneeId) return;
      const { assignTicket } = await import("../api/tickets");
      return assignTicket({
        ticketId: selectedTicketId,
        assigneeId: assigneeId as number,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast({
        title: t("support.messages.assignSuccessTitle"),
        status: "success",
      });
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ??
        t("support.messages.assignErrorFallback");
      toast({
        title: t("support.messages.assignErrorTitle"),
        description: detail,
        status: "error",
      });
    },
  });

  // Envia formulario de nuevo ticket.
  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newDescription.trim()) {
      toast({
        title: t("support.messages.missingDataTitle"),
        description: t("support.messages.missingDataDesc"),
        status: "warning",
      });
      return;
    }
    createMutation.mutate();
  };

  // Envia un mensaje al ticket.
  const handleSendReply = () => {
    if (!selectedTicketId) return;
    if (!replyBody.trim()) {
      toast({
        title: t("support.messages.emptyMessageTitle"),
        description: t("support.messages.emptyMessageDesc"),
        status: "warning",
      });
      return;
    }
    replyMutation.mutate();
  };

  // Selecciona ticket para ver detalle.
  const handleSelectTicket = (ticket: Ticket) => {
    setSelectedTicketId(ticket.id);
    setAssigneeId("");
  };

  const tickets = ticketsQuery.data ?? [];

  // Render principal de la pagina.
  return (
    <AppShell>
      <Box animation={`${fadeUp} 0.6s ease-out`} mb={8}>
        <PageHero
          eyebrow={t("support.header.eyebrow")}
          title={t("support.header.title")}
          subtitle={t("support.header.subtitle")}
        />
      </Box>
      <Text mb={6} color={subtleText}>
        {t("support.description")}
      </Text>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={8} alignItems="flex-start">
        {/* Columna izquierda: filtros + listado */}
        <Box>
          {isSuperAdmin && (
            <Box mb={4}>
              <FormControl maxW="280px">
                <FormLabel>{t("support.filters.tenant")}</FormLabel>
                <Select
                  placeholder={
                    tenantsQuery.isLoading ? t("support.filters.loadingTenants") : t("support.filters.allTenants")
                  }
                  value={tenantFilterId ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    const parsed = value ? Number(value) : null;
                    setTenantFilterId(parsed);
                    setSelectedTicketId(null);
                  }}
                  isDisabled={tenantsQuery.isLoading || tenantsQuery.isError}
                >
                  {tenantsQuery.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.subdomain})
                    </option>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}

          <Box mb={4} p={4} borderWidth="1px" borderRadius="md" bg={cardBg}>
            <Heading as="h3" size="sm" mb={3}>{t("support.filters.title")}</Heading>
            <HStack spacing={4} align="flex-end" flexWrap="wrap">
              <FormControl maxW="200px">
                <FormLabel>{t("support.filters.status")}</FormLabel>
                <Select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as "" | TicketStatus)
                  }
                >
                  <option value="">{t("support.filters.all")}</option>
                  {statusOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl maxW="200px">
                <FormLabel>{t("support.filters.priority")}</FormLabel>
                <Select
                  value={priorityFilter}
                  onChange={(e) =>
                    setPriorityFilter(e.target.value as "" | TicketPriority)
                  }
                >
                  <option value="">{t("support.filters.all")}</option>
                  {priorityOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl maxW="220px">
                <FormLabel>{t("support.filters.mineOnly")}</FormLabel>
                <Switch
                  isChecked={mineOnly}
                  onChange={(e) => setMineOnly(e.target.checked)}
                />
              </FormControl>
            </HStack>
          </Box>

          <Box borderWidth="1px" borderRadius="md" overflow="hidden" bg={cardBg}>
            <Table size="sm">
              <Thead bg={tableHeadBg}>
                <Tr>
                  {isSuperAdmin && <Th>{t("support.table.tenant")}</Th>}
                  <Th>{t("support.table.subject")}</Th>
                  <Th>{t("support.table.status")}</Th>
                  <Th>{t("support.table.priority")}</Th>
                  <Th>{t("support.table.lastActivity")}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {ticketsQuery.isLoading && (
                  <Tr>
                    <Td colSpan={5}>
                      <Text fontSize="sm">{t("support.table.loading")}</Text>
                    </Td>
                  </Tr>
                )}
                {ticketsQuery.isError && !ticketsQuery.isLoading && (
                  <Tr>
                    <Td colSpan={5}>
                      <Text fontSize="sm" color="red.400">
                        {t("support.table.loadError")}
                      </Text>
                    </Td>
                  </Tr>
                )}
                {!ticketsQuery.isLoading &&
                  !ticketsQuery.isError &&
                  tickets.length === 0 && (
                    <Tr>
                      <Td colSpan={5}>
                        <Text fontSize="sm" color={subtleText}>
                          {t("support.table.empty")}
                        </Text>
                      </Td>
                    </Tr>
                  )}
                {tickets.map((ticket) => (
                  <Tr
                    key={ticket.id}
                    onClick={() => handleSelectTicket(ticket)}
                    _hover={{
                      bg: rowHoverBg,
                      cursor: "pointer",
                    }}
                    bg={
                      ticket.id === selectedTicketId
                        ? rowActiveBg
                        : undefined
                    }
                  >
                    {isSuperAdmin && (
                      <Td>
                        {tenantsQuery.data?.find((t) => t.id === ticket.tenant_id)
                          ?.name ?? ticket.tenant_id}
                      </Td>
                    )}
                    <Td>{ticket.subject}</Td>
                    <Td>
                      <Badge
                        colorScheme={
                          ticket.status === "closed"
                            ? "gray"
                            : ticket.status === "resolved"
                            ? "green"
                            : ticket.status === "in_progress"
                            ? "blue"
                            : "yellow"
                        }
                      >
                        {statusOptions.find((s) => s.value === ticket.status)?.label ??
                          ticket.status}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge
                        colorScheme={
                          ticket.priority === "critical"
                            ? "red"
                            : ticket.priority === "high"
                            ? "orange"
                            : ticket.priority === "medium"
                            ? "yellow"
                            : "gray"
                        }
                      >
                        {priorityOptions.find((p) => p.value === ticket.priority)
                          ?.label ?? ticket.priority}
                      </Badge>
                    </Td>
                    <Td>{formatDateTime(ticket.last_activity_at)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        </Box>

        {/* Right column: creation (non super admin) + detail */}
        <Stack spacing={6}>
          {!isSuperAdmin && (
            <Box
              p={4}
              borderWidth="1px"
              borderRadius="md"
              bg={cardBg}
              as="form"
              onSubmit={handleCreate}
            >
              <Heading as="h3" size="sm" mb={3}>
                {t("support.create.title")}
              </Heading>
              <Stack spacing={3}>
                <FormControl isRequired>
                  <FormLabel>{t("support.create.subject")}</FormLabel>
                  <Input
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    placeholder={t("support.create.subjectPlaceholder")}
                  />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel>{t("support.create.descriptionLabel")}</FormLabel>
                  <Textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    rows={4}
                    placeholder={t("support.create.descriptionPlaceholder")}
                  />
                </FormControl>
                <HStack spacing={3}>
                  <FormControl>
                    <FormLabel>{t("support.filters.priority")}</FormLabel>
                    <Select
                      value={newPriority}
                      onChange={(e) =>
                        setNewPriority(e.target.value as TicketPriority)
                      }
                    >
                      {priorityOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("support.create.toolOptional")}</FormLabel>
                    <Input
                      value={newToolSlug}
                      onChange={(e) => setNewToolSlug(e.target.value)}
                      placeholder={t("support.create.toolPlaceholder")}
                    />
                  </FormControl>
                </HStack>
                <Button
                  type="submit"
                  colorScheme="green"
                  alignSelf="flex-start"
                  isLoading={createMutation.isPending}
                >{t("support.create.submit")}</Button>
              </Stack>
            </Box>
          )}

          <Box p={4} borderWidth="1px" borderRadius="md" bg={cardBg}>
            <Heading as="h3" size="sm" mb={3}>
              {t("support.detail.title")}
            </Heading>
            {!selectedTicket && (
              <Text fontSize="sm" color={subtleText}>
                {t("support.detail.selectPrompt")}
              </Text>
            )}
            {selectedTicket && (
              <Stack spacing={4}>
                <Box>
                  <Text fontWeight="bold" mb={1}>
                    {selectedTicket.subject}
                  </Text>
                  <Text fontSize="sm" mb={2}>
                    {t("support.detail.statusLabel")}{" "}
                    <Badge mr={2}>
                      {
                        statusOptions.find(
                          (s) => s.value === selectedTicket.status,
                        )?.label
                      }
                    </Badge>
                    {t("support.detail.priorityLabel")}{" "}
                    <Badge>
                      {
                        priorityOptions.find(
                          (p) => p.value === selectedTicket.priority,
                        )?.label
                      }
                    </Badge>
                  </Text>
                  <Text fontSize="sm" color={subtleText}>
                    {t("support.detail.createdBy", {
                      email: selectedTicket.created_by_email,
                    })}{" "}
                    {t("support.detail.assignedTo")}{" "}
                    {selectedTicket.assigned_to_email ??
                      t("support.detail.unassigned")}
                  </Text>
                  <Text fontSize="xs" color={subtleText} mt={1}>
                    {t("support.detail.createdAt", {
                      date: formatDateTime(selectedTicket.created_at),
                    })}
                  </Text>
                  <Text fontSize="xs" color={subtleText}>
                    {t("support.detail.firstResponse", {
                      date: formatDateTime(selectedTicket.first_response_at),
                    })}
                  </Text>
                  <Text fontSize="xs" color={subtleText}>
                    {t("support.detail.lastActivity", {
                      date: formatDateTime(selectedTicket.last_activity_at),
                    })}
                  </Text>
                  <Text fontSize="xs" color={subtleText}>
                    {t("support.detail.resolvedAt", {
                      date: formatDateTime(selectedTicket.resolved_at),
                    })}
                  </Text>
                  <Text fontSize="xs" color={subtleText}>
                    {t("support.detail.closedAt", {
                      date: formatDateTime(selectedTicket.closed_at),
                    })}
                  </Text>
                </Box>

                {assigneesQuery.data && assigneesQuery.data.length > 0 && (
                  <HStack spacing={3} align="flex-end">
                    <FormControl maxW="260px">
                      <FormLabel fontSize="sm">{t("support.assign.label")}</FormLabel>
                      <Select
                        value={assigneeId}
                        onChange={(e) => {
                          const value = e.target.value;
                          setAssigneeId(value ? Number(value) : "");
                        }}
                      >
                        <option value="">{t("support.assign.placeholder")}</option>
                        {assigneesQuery.data.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name ?? u.email}
                            {!u.is_active ? ` (${t("support.assign.inactive")})` : ""}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                    <Button
                      size="sm"
                      variant="outline"
                      colorScheme="blue"
                      onClick={() => assignMutation.mutate()}
                      isLoading={assignMutation.isPending}
                      isDisabled={!assigneeId || !selectedTicketId}
                    >{t("support.assign.submit")}</Button>
                  </HStack>
                )}

                <HStack spacing={3}>
                  <Button
                    size="sm"
                    variant="outline"
                    colorScheme="green"
                    onClick={() => reopenMutation.mutate()}
                    isDisabled={
                      !(
                        selectedTicket.status === "resolved" ||
                        selectedTicket.status === "closed"
                      )
                    }
                    isLoading={reopenMutation.isPending}
                  >{t("support.actions.reopen")}</Button>
                  <Button
                    size="sm"
                    colorScheme="red"
                    onClick={() => closeMutation.mutate()}
                    isDisabled={selectedTicket.status === "closed"}
                    isLoading={closeMutation.isPending}
                  >{t("support.actions.close")}</Button>
                </HStack>

                <Box
                  maxH="260px"
                  overflowY="auto"
                  borderWidth="1px"
                  borderRadius="md"
                  p={3}
                >
                  {messagesQuery.isLoading && (
                    <Text fontSize="sm">{t("support.messages.loadingConversation")}</Text>
                  )}
                  {messagesQuery.isError && !messagesQuery.isLoading && (
                    <Text fontSize="sm" color="red.400">
                      {t("support.messages.loadMessagesError")}
                    </Text>
                  )}
                  {!messagesQuery.isLoading &&
                    !messagesQuery.isError &&
                    (messagesQuery.data ?? []).length === 0 && (
                      <Text fontSize="sm" color={subtleText}>
                        {t("support.messages.emptyMessages")}
                      </Text>
                    )}
                  <Stack spacing={3}>
                    {(messagesQuery.data ?? []).map((msg) => (
                      <Box key={msg.id}>
                        <HStack spacing={2} mb={1}>
                          <Text fontSize="xs" fontWeight="bold">
                            {msg.author_email}
                          </Text>
                          <Text fontSize="xs" color={subtleText}>
                            {formatDateTime(msg.created_at)}
                          </Text>
                          {msg.is_internal && (
                            <Badge colorScheme="purple" variant="outline">
                              {t("support.messages.internalNote")}
                            </Badge>
                          )}
                        </HStack>
                        <Text fontSize="sm" whiteSpace="pre-wrap">
                          {msg.body}
                        </Text>
                      </Box>
                    ))}
                  </Stack>
                </Box>

                <Box>
                  <FormLabel fontSize="sm">{t("support.reply.title")}</FormLabel>
                  <Textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    rows={3}
                    placeholder={t("support.reply.placeholder")}
                  />
                  <HStack justify="space-between" mt={2}>
                    <HStack>
                      <Switch
                        size="sm"
                        isChecked={replyInternal}
                        onChange={(e) => setReplyInternal(e.target.checked)}
                      />
                      <Text fontSize="xs" color={subtleText}>
                        {t("support.reply.internalLabel")}
                      </Text>
                    </HStack>
                    <Button
                      size="sm"
                      colorScheme="green"
                      onClick={handleSendReply}
                      isLoading={replyMutation.isPending}
                      isDisabled={!selectedTicketId}
                    >{t("support.reply.send")}</Button>
                  </HStack>
                </Box>
              </Stack>
            )}
          </Box>
        </Stack>
      </SimpleGrid>
    </AppShell>
  );
};
