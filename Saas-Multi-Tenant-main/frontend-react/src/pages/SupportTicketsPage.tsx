import React, { useMemo, useState } from "react";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "../components/layout/AppShell";
import type { CurrentUser } from "../api/users";
import {
  fetchAllTenants,
  fetchUsersByTenant,
  type TenantOption,
  type TenantUserSummary,
} from "../api/users";
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

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "open", label: "Abierto" },
  { value: "in_progress", label: "En progreso" },
  { value: "resolved", label: "Resuelto" },
  { value: "closed", label: "Cerrado" },
];

const PRIORITY_OPTIONS: { value: TicketPriority; label: string }[] = [
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Crítica" },
];

const formatDateTime = (iso?: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString();
};

export const SupportTicketsPage: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue("white", "gray.700");
  const tableHeadBg = useColorModeValue("gray.50", "gray.800");
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const rowHoverBg = useColorModeValue("gray.50", "gray.600");
  const rowActiveBg = useColorModeValue("gray.100", "gray.600");

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

  // Datos del usuario actual
  let isSuperAdmin = false;
  let currentTenantId: number | null = null;
  try {
    const raw = localStorage.getItem("current_user");
    if (raw) {
      const me = JSON.parse(raw) as CurrentUser;
      isSuperAdmin =
        Boolean(me.is_super_admin) || me.email === "dios@cortecelestial.god";
      currentTenantId = me.tenant_id;
    }
  } catch {
    isSuperAdmin = false;
    currentTenantId = null;
  }

  // Filtro de tenant solo para Super Admin
  const [tenantFilterId, setTenantFilterId] = useState<number | null>(
    isSuperAdmin ? currentTenantId : null,
  );

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
        title: "Ticket creado",
        description: "El ticket se ha creado correctamente.",
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
        "No se ha podido crear el ticket (revisa permisos y datos).";
      toast({
        title: "Error al crear ticket",
        description: detail,
        status: "error",
      });
    },
  });

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
        "No se ha podido enviar el mensaje (revisa permisos y datos).";
      toast({
        title: "Error al enviar mensaje",
        description: detail,
        status: "error",
      });
    },
  });

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
        title: "Ticket cerrado",
        status: "success",
      });
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ??
        "No se ha podido cerrar el ticket (comprueba permisos).";
      toast({
        title: "Error al cerrar ticket",
        description: detail,
        status: "error",
      });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: () => reopenTicket(selectedTicketId as number),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast({
        title: "Ticket reabierto",
        status: "success",
      });
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ??
        "No se ha podido reabrir el ticket (comprueba permisos).";
      toast({
        title: "Error al reabrir ticket",
        description: detail,
        status: "error",
      });
    },
  });

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
        title: "Ticket asignado",
        status: "success",
      });
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ??
        "No se ha podido asignar el ticket (comprueba permisos y datos).";
      toast({
        title: "Error al asignar ticket",
        description: detail,
        status: "error",
      });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newDescription.trim()) {
      toast({
        title: "Datos incompletos",
        description: "Asunto y descripción son obligatorios.",
        status: "warning",
      });
      return;
    }
    createMutation.mutate();
  };

  const handleSendReply = () => {
    if (!selectedTicketId) return;
    if (!replyBody.trim()) {
      toast({
        title: "Mensaje vacío",
        description: "Escribe un mensaje antes de enviarlo.",
        status: "warning",
      });
      return;
    }
    replyMutation.mutate();
  };

  const handleSelectTicket = (ticket: Ticket) => {
    setSelectedTicketId(ticket.id);
    setAssigneeId("");
  };

  const tickets = ticketsQuery.data ?? [];

  return (
    <AppShell>
      <Heading mb={2}>Soporte y tickets</Heading>
      <Text mb={6} color={subtleText}>
        Gestiona las incidencias de la plataforma por tenant. Los tickets se ordenan por
        la última actividad registrada.
      </Text>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={8} alignItems="flex-start">
        {/* Columna izquierda: filtros + listado */}
        <Box>
          {isSuperAdmin && (
            <Box mb={4}>
              <FormControl maxW="280px">
                <FormLabel>Tenant</FormLabel>
                <Select
                  placeholder={
                    tenantsQuery.isLoading ? "Cargando tenants..." : "Todos los tenants"
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
            <Heading as="h3" size="sm" mb={3}>
              Filtros
            </Heading>
            <HStack spacing={4} align="flex-end" flexWrap="wrap">
              <FormControl maxW="200px">
                <FormLabel>Estado</FormLabel>
                <Select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as "" | TicketStatus)
                  }
                >
                  <option value="">Todos</option>
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl maxW="200px">
                <FormLabel>Prioridad</FormLabel>
                <Select
                  value={priorityFilter}
                  onChange={(e) =>
                    setPriorityFilter(e.target.value as "" | TicketPriority)
                  }
                >
                  <option value="">Todas</option>
                  {PRIORITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl maxW="220px">
                <FormLabel>Solo mis tickets</FormLabel>
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
                  {isSuperAdmin && <Th>Tenant</Th>}
                  <Th>Asunto</Th>
                  <Th>Estado</Th>
                  <Th>Prioridad</Th>
                  <Th>Última actividad</Th>
                </Tr>
              </Thead>
              <Tbody>
                {ticketsQuery.isLoading && (
                  <Tr>
                    <Td colSpan={5}>
                      <Text fontSize="sm">Cargando tickets...</Text>
                    </Td>
                  </Tr>
                )}
                {ticketsQuery.isError && !ticketsQuery.isLoading && (
                  <Tr>
                    <Td colSpan={5}>
                      <Text fontSize="sm" color="red.400">
                        No se han podido cargar los tickets (comprueba permisos y
                        conexión).
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
                          Todavía no hay tickets para los filtros seleccionados.
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
                        {STATUS_OPTIONS.find((s) => s.value === ticket.status)?.label ??
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
                        {PRIORITY_OPTIONS.find((p) => p.value === ticket.priority)
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

        {/* Columna derecha: creación (para no super admin) + detalle */}
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
                Crear nuevo ticket
              </Heading>
              <Stack spacing={3}>
                <FormControl isRequired>
                  <FormLabel>Asunto</FormLabel>
                  <Input
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    placeholder="Resumen breve del problema"
                  />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel>Descripción</FormLabel>
                  <Textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    rows={4}
                    placeholder="Describe qué ocurre, pasos para reproducir, etc."
                  />
                </FormControl>
                <HStack spacing={3}>
                  <FormControl>
                    <FormLabel>Prioridad</FormLabel>
                    <Select
                      value={newPriority}
                      onChange={(e) =>
                        setNewPriority(e.target.value as TicketPriority)
                      }
                    >
                      {PRIORITY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl>
                    <FormLabel>Herramienta (opcional)</FormLabel>
                    <Input
                      value={newToolSlug}
                      onChange={(e) => setNewToolSlug(e.target.value)}
                      placeholder="moodle, erp, plataforma..."
                    />
                  </FormControl>
                </HStack>
                <Button
                  type="submit"
                  colorScheme="green"
                  alignSelf="flex-start"
                  isLoading={createMutation.isPending}
                >
                  Crear ticket
                </Button>
              </Stack>
            </Box>
          )}

          <Box p={4} borderWidth="1px" borderRadius="md" bg={cardBg}>
            <Heading as="h3" size="sm" mb={3}>
              Detalle y conversación
            </Heading>
            {!selectedTicket && (
              <Text fontSize="sm" color={subtleText}>
                Selecciona un ticket del listado para ver su detalle.
              </Text>
            )}
            {selectedTicket && (
              <Stack spacing={4}>
                <Box>
                  <Text fontWeight="bold" mb={1}>
                    {selectedTicket.subject}
                  </Text>
                  <Text fontSize="sm" mb={2}>
                    Estado:{" "}
                    <Badge mr={2}>
                      {
                        STATUS_OPTIONS.find(
                          (s) => s.value === selectedTicket.status,
                        )?.label
                      }
                    </Badge>
                    Prioridad:{" "}
                    <Badge>
                      {
                        PRIORITY_OPTIONS.find(
                          (p) => p.value === selectedTicket.priority,
                        )?.label
                      }
                    </Badge>
                  </Text>
                  <Text fontSize="sm" color={subtleText}>
                    Creado por {selectedTicket.created_by_email}. Asignado a{" "}
                    {selectedTicket.assigned_to_email ?? "sin asignar"}.
                  </Text>
                  <Text fontSize="xs" color={subtleText} mt={1}>
                    Creado: {formatDateTime(selectedTicket.created_at)} · Última
                    actividad: {formatDateTime(selectedTicket.last_activity_at)}
                  </Text>
                  <Text fontSize="xs" color={subtleText}>
                    Primera respuesta:{" "}
                    {formatDateTime(selectedTicket.first_response_at)}
                    {" · "}Resuelto: {formatDateTime(selectedTicket.resolved_at)}
                    {" · "}Cerrado: {formatDateTime(selectedTicket.closed_at)}
                  </Text>
                </Box>

                {assigneesQuery.data && assigneesQuery.data.length > 0 && (
                  <HStack spacing={3} align="flex-end">
                    <FormControl maxW="260px">
                      <FormLabel fontSize="sm">Asignar a</FormLabel>
                      <Select
                        value={assigneeId}
                        onChange={(e) => {
                          const value = e.target.value;
                          setAssigneeId(value ? Number(value) : "");
                        }}
                      >
                        <option value="">Selecciona un usuario</option>
                        {assigneesQuery.data.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name ?? u.email}
                            {!u.is_active ? " (inactivo)" : ""}
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
                    >
                      Asignar
                    </Button>
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
                  >
                    Reabrir
                  </Button>
                  <Button
                    size="sm"
                    colorScheme="red"
                    onClick={() => closeMutation.mutate()}
                    isDisabled={selectedTicket.status === "closed"}
                    isLoading={closeMutation.isPending}
                  >
                    Cerrar
                  </Button>
                </HStack>

                <Box
                  maxH="260px"
                  overflowY="auto"
                  borderWidth="1px"
                  borderRadius="md"
                  p={3}
                >
                  {messagesQuery.isLoading && (
                    <Text fontSize="sm">Cargando conversación...</Text>
                  )}
                  {messagesQuery.isError && !messagesQuery.isLoading && (
                    <Text fontSize="sm" color="red.400">
                      No se han podido cargar los mensajes (comprueba permisos y
                      conexión).
                    </Text>
                  )}
                  {!messagesQuery.isLoading &&
                    !messagesQuery.isError &&
                    (messagesQuery.data ?? []).length === 0 && (
                      <Text fontSize="sm" color={subtleText}>
                        Todavía no hay mensajes en este ticket.
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
                              Nota interna
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
                  <FormLabel fontSize="sm">Nuevo mensaje</FormLabel>
                  <Textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    rows={3}
                    placeholder="Escribe tu respuesta o nota interna..."
                  />
                  <HStack justify="space-between" mt={2}>
                    <HStack>
                      <Switch
                        size="sm"
                        isChecked={replyInternal}
                        onChange={(e) => setReplyInternal(e.target.checked)}
                      />
                      <Text fontSize="xs" color={subtleText}>
                        Marcar como nota interna (solo equipo)
                      </Text>
                    </HStack>
                    <Button
                      size="sm"
                      colorScheme="green"
                      onClick={handleSendReply}
                      isLoading={replyMutation.isPending}
                      isDisabled={!selectedTicketId}
                    >
                      Enviar
                    </Button>
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
