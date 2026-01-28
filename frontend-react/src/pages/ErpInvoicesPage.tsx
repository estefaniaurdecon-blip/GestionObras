import React, { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Collapse,
  Divider,
  Flex,
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
  Th,
  Thead,
  Tr,
  useColorModeValue,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "../components/layout/AppShell";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { fetchErpProjects, type ErpProject } from "../api/erpReports";
import { fetchDepartments, type Department } from "../api/hr";
import { fetchAllTenants, type TenantOption } from "../api/users";
import {
  fetchInvoices,
  deleteInvoice,
  markInvoicePaid,
  reprocessInvoice,
  updateInvoice,
  downloadInvoiceFile,
  uploadInvoice,
  type Invoice,
  type InvoiceUpdatePayload,
  type InvoiceFilters,
} from "../api/invoices";
import { formatCurrency, formatEuroValue } from "../utils/erp/formatters";

const statusColors: Record<string, string> = {
  uploaded: "gray",
  extracting: "purple",
  extracted: "blue",
  suggested: "cyan",
  validated: "green",
  pending: "orange",
  paid: "green",
  failed: "red",
};

const paidLabel = (status: Invoice["status"]) =>
  status === "paid" ? "SI" : "NO";

const observationLabel = (invoice: Invoice) => {
  if (invoice.status === "failed") return "Revisar error";
  if (invoice.extraction_error) return "Revisar error";
  if (invoice.status === "pending") return "Revisar pago";
  if (invoice.status === "paid") return "PAGADA";
  return "";
};

const observationColor = (invoice: Invoice) => {
  if (invoice.status === "failed" || invoice.extraction_error) return "red.500";
  if (invoice.status === "pending") return "red.500";
  if (invoice.status === "paid") return "green.500";
  return "transparent";
};

const statusBadge = (status: Invoice["status"]) =>
  statusColors[status] ?? "gray";

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-ES");
};

const formatAmount = (
  value?: string | number | null,
  currency?: string | null,
) => {
  if (value == null || value === "") return "-";
  const numberValue = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(numberValue)) return String(value);
  if (currency && currency.toUpperCase() !== "EUR") {
    return `${formatEuroValue(numberValue)} ${currency.toUpperCase()}`;
  }
  return formatCurrency(numberValue);
};

export const ErpInvoicesPage: React.FC = () => {
  const cardBg = useColorModeValue("white", "gray.700");
  const panelBg = useColorModeValue("gray.50", "gray.800");
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = Boolean(currentUser?.is_super_admin);
  const tenantId = currentUser?.tenant_id ?? null;

  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadProjectId, setUploadProjectId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const filtersDisclosure = useDisclosure({ defaultIsOpen: false });

  const effectiveTenantId = isSuperAdmin
    ? selectedTenantId
      ? Number(selectedTenantId)
      : undefined
    : (tenantId ?? undefined);

  const tenantReady = Boolean(
    currentUser && (!isSuperAdmin || effectiveTenantId),
  );

  const formatDateInput = (value: Date) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const dateRangeValues = useMemo(() => {
    if (dateRange === "all") return { from: undefined, to: undefined };
    const today = new Date();
    const endToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    switch (dateRange) {
      case "today":
        return { from: formatDateInput(endToday), to: formatDateInput(endToday) };
      case "last7": {
        const from = new Date(endToday);
        from.setDate(from.getDate() - 7);
        return { from: formatDateInput(from), to: formatDateInput(endToday) };
      }
      case "last30": {
        const from = new Date(endToday);
        from.setDate(from.getDate() - 30);
        return { from: formatDateInput(from), to: formatDateInput(endToday) };
      }
      case "thisMonth": {
        const from = new Date(endToday.getFullYear(), endToday.getMonth(), 1);
        const to = new Date(endToday.getFullYear(), endToday.getMonth() + 1, 0);
        return { from: formatDateInput(from), to: formatDateInput(to) };
      }
      case "lastMonth": {
        const from = new Date(endToday.getFullYear(), endToday.getMonth() - 1, 1);
        const to = new Date(endToday.getFullYear(), endToday.getMonth(), 0);
        return { from: formatDateInput(from), to: formatDateInput(to) };
      }
      default:
        return { from: undefined, to: undefined };
    }
  }, [dateRange]);

  const invoiceFilters: InvoiceFilters = {
    projectId: projectFilter !== "all" ? Number(projectFilter) : undefined,
    departmentId:
      departmentFilter !== "all" ? Number(departmentFilter) : undefined,
    status:
      statusFilter !== "all" ? (statusFilter as Invoice["status"]) : undefined,
    dateFrom: dateRangeValues.from,
    dateTo: dateRangeValues.to,
  };

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ["erp-invoices", effectiveTenantId ?? "all", invoiceFilters],
    queryFn: () => fetchInvoices(effectiveTenantId, invoiceFilters),
    enabled: tenantReady,
  });

  const { data: projects = [] } = useQuery<ErpProject[]>({
    queryKey: ["erp-projects", effectiveTenantId ?? "all"],
    queryFn: () => fetchErpProjects(effectiveTenantId),
    enabled: tenantReady,
  });

  const { data: tenants = [] } = useQuery<TenantOption[]>({
    queryKey: ["tenants-all"],
    queryFn: () => fetchAllTenants(),
    enabled: isSuperAdmin,
  });

  const activeProjects = useMemo(
    () => projects.filter((project) => project.is_active !== false),
    [projects],
  );

  const activeTenants = useMemo(
    () => tenants.filter((tenant) => tenant.is_active !== false),
    [tenants],
  );

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["hr-departments", effectiveTenantId ?? "all"],
    queryFn: () => fetchDepartments(effectiveTenantId),
    enabled: tenantReady,
  });

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        String(invoice.id).includes(term) ||
        (invoice.supplier_name || "").toLowerCase().includes(term) ||
        (invoice.invoice_number || "").toLowerCase().includes(term)
      );
    });
  }, [invoices, searchTerm]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecciona un archivo.");
      if (!uploadProjectId) {
        throw new Error("Selecciona un proyecto activo.");
      }
      return uploadInvoice(
        file,
        effectiveTenantId,
        Number(uploadProjectId),
      );
    },
    onSuccess: async () => {
      setFile(null);
      setUploadProjectId("");
      await queryClient.invalidateQueries({
        queryKey: ["erp-invoices", effectiveTenantId ?? "all"],
      });
      toast({ title: "Factura subida", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al subir",
        description:
          error?.response?.data?.detail ?? "No se pudo subir la factura.",
        status: "error",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: InvoiceUpdatePayload) => {
      if (!selectedInvoice) throw new Error("No hay factura seleccionada.");
      return updateInvoice(selectedInvoice.id, payload, effectiveTenantId);
    },
    onSuccess: async (updated) => {
      setSelectedInvoice(updated);
      await queryClient.invalidateQueries({
        queryKey: ["erp-invoices", effectiveTenantId ?? "all"],
      });
      toast({ title: "Factura actualizada", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al actualizar",
        description:
          error?.response?.data?.detail ?? "No se pudo actualizar la factura.",
        status: "error",
      });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (invoiceId: number) =>
      markInvoicePaid(invoiceId, effectiveTenantId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["erp-invoices", effectiveTenantId ?? "all"],
      });
      toast({ title: "Factura marcada como pagada", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al marcar como pagada",
        description:
          error?.response?.data?.detail ?? "No se pudo marcar la factura.",
        status: "error",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (invoiceId: number) =>
      deleteInvoice(invoiceId, effectiveTenantId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["erp-invoices", effectiveTenantId ?? "all"],
      });
      toast({ title: "Factura eliminada", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al eliminar",
        description:
          error?.response?.data?.detail ?? "No se pudo eliminar la factura.",
        status: "error",
      });
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: async (invoiceId: number) =>
      reprocessInvoice(invoiceId, effectiveTenantId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["erp-invoices", effectiveTenantId ?? "all"],
      });
      toast({ title: "Reprocesando factura", status: "info" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al reprocesar",
        description:
          error?.response?.data?.detail ?? "No se pudo reprocesar la factura.",
        status: "error",
      });
    },
  });

  const handleOpenDetails = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    onOpen();
  };

  const handleDownload = async (invoice: Invoice) => {
    try {
      const blob = await downloadInvoiceFile(invoice.id, effectiveTenantId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = invoice.original_filename || `invoice-${invoice.id}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: "Error al descargar",
        description:
          error?.response?.data?.detail ?? "No se pudo descargar el archivo.",
        status: "error",
      });
    }
  };

  const handleSaveDetails = () => {
    if (!selectedInvoice) return;
    updateMutation.mutate({
      supplier_name: selectedInvoice.supplier_name ?? null,
      supplier_tax_id: selectedInvoice.supplier_tax_id ?? null,
      invoice_number: selectedInvoice.invoice_number ?? null,
      issue_date: selectedInvoice.issue_date ?? null,
      due_date: selectedInvoice.due_date ?? null,
      total_amount:
        selectedInvoice.total_amount != null
          ? Number(selectedInvoice.total_amount)
          : null,
      currency: selectedInvoice.currency ?? null,
      concept: selectedInvoice.concept ?? null,
      project_id: selectedInvoice.project_id ?? null,
      department_id: selectedInvoice.department_id ?? null,
      status: selectedInvoice.status,
    });
  };

  return (
    <AppShell>
      <Stack spacing={6}>
        <Box>
          <Heading size="lg">Facturas</Heading>
          <Text color={subtleText}>
            Sube facturas, revisa extracciones y gestiona el estado de pago.
          </Text>
        </Box>

        <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
          <Box bg={cardBg} borderRadius="xl" p={5} borderWidth="1px">
            <Stack spacing={4}>
              <Heading size="sm">Subir factura</Heading>
              {isSuperAdmin && (
                <FormControl>
                  <FormLabel>Tenant</FormLabel>
                  <Select
                    value={selectedTenantId}
                    onChange={(e) => {
                      setSelectedTenantId(e.target.value);
                      setUploadProjectId("");
                      setProjectFilter("all");
                    }}
                    placeholder="Selecciona un tenant"
                  >
                    {activeTenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </option>
                    ))}
                  </Select>
                </FormControl>
              )}
              <FormControl>
                <FormLabel>Archivo PDF / Imagen</FormLabel>
                <Input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.tiff,.bmp"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Proyecto</FormLabel>
                <Select
                  value={uploadProjectId}
                  onChange={(e) => setUploadProjectId(e.target.value)}
                  placeholder={
                    activeProjects.length > 0
                      ? "Selecciona proyecto activo"
                      : "No hay proyectos activos"
                  }
                  isDisabled={activeProjects.length === 0 || !tenantReady}
                >
                  {activeProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <Button
                colorScheme="green"
                onClick={() => uploadMutation.mutate()}
                isLoading={uploadMutation.isPending}
                isDisabled={!file || !tenantReady || !uploadProjectId}
              >
                Subir y procesar
              </Button>
            </Stack>
          </Box>

          <Box bg={panelBg} borderRadius="xl" p={5} borderWidth="1px">
            <Flex align="center" justify="space-between" mb={2}>
              <Heading size="sm">Filtros</Heading>
              <Button
                size="sm"
                variant="ghost"
                rightIcon={<ChevronDownIcon />}
                onClick={filtersDisclosure.onToggle}
              >
                {filtersDisclosure.isOpen ? "Ocultar" : "Mostrar"}
              </Button>
            </Flex>
            <Collapse in={filtersDisclosure.isOpen} animateOpacity>
              <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={4}>
              <FormControl>
                <FormLabel>Buscar</FormLabel>
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="ID, proveedor o numero"
                />
              </FormControl>
              <FormControl>
                <FormLabel>Estado</FormLabel>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">Todos</option>
                  <option value="uploaded">Subida</option>
                  <option value="extracting">Extrayendo</option>
                  <option value="extracted">Extraida</option>
                  <option value="validated">Validada</option>
                  <option value="pending">Pendiente</option>
                  <option value="paid">Pagada</option>
                  <option value="failed">Fallida</option>
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Proyecto</FormLabel>
                <Select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                >
                  <option value="all">Todos</option>
                  {activeProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Departamento</FormLabel>
                <Select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                >
                  <option value="all">Todos</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Fecha</FormLabel>
                <Select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                >
                  <option value="all">Todas</option>
                  <option value="today">Hoy</option>
                  <option value="last7">Ultimos 7 dias</option>
                  <option value="last30">Ultimos 30 dias</option>
                  <option value="thisMonth">Este mes</option>
                  <option value="lastMonth">Mes anterior</option>
                </Select>
              </FormControl>
            </SimpleGrid>
            </Collapse>
          </Box>
        </SimpleGrid>

        <Box bg={cardBg} borderRadius="xl" p={5} borderWidth="1px">
          <Flex align="center" justify="space-between" mb={4}>
            <Heading size="sm">Listado</Heading>
            <Text color={subtleText}>
              {isLoading
                ? "Cargando..."
                : `${filteredInvoices.length} facturas`}
            </Text>
          </Flex>
          <Box overflowX="auto">
            <Table size="sm" variant="simple" minW="1200px">
              <Thead>
                <Tr>
                  <Th>Nº Factura</Th>
                  <Th>Importe</Th>
                  <Th>Emision</Th>
                  <Th>Pago</Th>
                  <Th>Vencimiento</Th>
                  <Th>Cliente</Th>
                  <Th>Hito</Th>
                  <Th>Pagada</Th>
                  <Th>Observaciones</Th>
                  <Th>Archivo</Th>
                  <Th>Acciones</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredInvoices.map((invoice) => (
                  <Tr key={invoice.id}>
                    <Td>
                      <Text fontWeight="semibold">
                        {invoice.invoice_number || "-"}
                      </Text>
                    </Td>
                    <Td>
                      {formatAmount(invoice.total_amount, invoice.currency)}
                    </Td>
                    <Td>{formatDate(invoice.issue_date)}</Td>
                    <Td>{formatDate(invoice.paid_at)}</Td>
                    <Td>{formatDate(invoice.due_date)}</Td>
                    <Td>{invoice.supplier_name || "-"}</Td>
                    <Td>{invoice.project_id ?? "-"}</Td>
                    <Td>
                      <Badge colorScheme={statusBadge(invoice.status)}>
                        {paidLabel(invoice.status)}
                      </Badge>
                    </Td>
                    <Td
                      bg={observationColor(invoice)}
                      color="white"
                      fontWeight="semibold"
                    >
                      {observationLabel(invoice) || "-"}
                    </Td>
                    <Td>
                      <Text fontSize="xs" noOfLines={1}>
                        {invoice.original_filename || invoice.file_path || "-"}
                      </Text>
                    </Td>
                    <Td>
                      <HStack spacing={2}>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => handleOpenDetails(invoice)}
                        >
                          Ver
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => handleDownload(invoice)}
                        >
                          Descargar
                        </Button>
                        <Button
                          size="xs"
                          colorScheme="green"
                          variant="solid"
                          onClick={() => markPaidMutation.mutate(invoice.id)}
                          isDisabled={invoice.status === "paid"}
                          isLoading={markPaidMutation.isPending}
                        >
                          Pagar
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => reprocessMutation.mutate(invoice.id)}
                          isLoading={reprocessMutation.isPending}
                        >
                          Reprocesar
                        </Button>
                        <Button
                          size="xs"
                          colorScheme="red"
                          variant="outline"
                          onClick={() => {
                            if (
                              window.confirm(
                                "¿Seguro que quieres eliminar esta factura?",
                              )
                            ) {
                              deleteMutation.mutate(invoice.id);
                            }
                          }}
                          isLoading={deleteMutation.isPending}
                        >
                          Eliminar
                        </Button>
                        <Button
                          size="xs"
                          colorScheme="red"
                          variant="ghost"
                          onClick={() => {
                            if (
                              window.confirm(
                                "?Rechazar esta factura? Se eliminar? definitivamente.",
                              )
                            ) {
                              deleteMutation.mutate(invoice.id);
                            }
                          }}
                          isLoading={deleteMutation.isPending}
                        >
                          Rechazar
                        </Button>
                      </HStack>
                    </Td>
                  </Tr>
                ))}
                {filteredInvoices.length === 0 && !isLoading && (
                  <Tr>
                    <Td
                      colSpan={11}
                      textAlign="center"
                      py={8}
                      color={subtleText}
                    >
                      No hay facturas para mostrar.
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </Box>
        </Box>

        {selectedInvoice && isOpen && (
          <Box bg={cardBg} borderRadius="xl" p={5} borderWidth="1px">
            <Flex align="center" justify="space-between" mb={4}>
              <Heading size="sm">
                Detalle de factura #{selectedInvoice.id}
              </Heading>
              <Button size="sm" variant="ghost" onClick={onClose}>
                Cerrar
              </Button>
            </Flex>
            <Divider mb={4} />
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <FormControl>
                <FormLabel>Proveedor</FormLabel>
                <Input
                  value={selectedInvoice.supplier_name ?? ""}
                  onChange={(e) =>
                    setSelectedInvoice({
                      ...selectedInvoice,
                      supplier_name: e.target.value,
                    })
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>NIF/CIF</FormLabel>
                <Input
                  value={selectedInvoice.supplier_tax_id ?? ""}
                  onChange={(e) =>
                    setSelectedInvoice({
                      ...selectedInvoice,
                      supplier_tax_id: e.target.value,
                    })
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>NÃºmero</FormLabel>
                <Input
                  value={selectedInvoice.invoice_number ?? ""}
                  onChange={(e) =>
                    setSelectedInvoice({
                      ...selectedInvoice,
                      invoice_number: e.target.value,
                    })
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>Fecha emision</FormLabel>
                <Input
                  type="date"
                  value={selectedInvoice.issue_date ?? ""}
                  onChange={(e) =>
                    setSelectedInvoice({
                      ...selectedInvoice,
                      issue_date: e.target.value,
                    })
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>Fecha vencimiento</FormLabel>
                <Input
                  type="date"
                  value={selectedInvoice.due_date ?? ""}
                  onChange={(e) =>
                    setSelectedInvoice({
                      ...selectedInvoice,
                      due_date: e.target.value,
                    })
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>Total</FormLabel>
                <Input
                  type="number"
                  value={selectedInvoice.total_amount ?? ""}
                  onChange={(e) =>
                    setSelectedInvoice({
                      ...selectedInvoice,
                      total_amount: e.target.value,
                    })
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>Moneda</FormLabel>
                <Input
                  value={selectedInvoice.currency ?? ""}
                  onChange={(e) =>
                    setSelectedInvoice({
                      ...selectedInvoice,
                      currency: e.target.value,
                    })
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>Concepto</FormLabel>
                <Input
                  value={selectedInvoice.concept ?? ""}
                  onChange={(e) =>
                    setSelectedInvoice({
                      ...selectedInvoice,
                      concept: e.target.value,
                    })
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>Proyecto</FormLabel>
                <Select
                  value={selectedInvoice.project_id ?? ""}
                  onChange={(e) =>
                    setSelectedInvoice({
                      ...selectedInvoice,
                      project_id: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                >
                  <option value="">Sin proyecto</option>
                  {activeProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Departamento</FormLabel>
                <Select
                  value={selectedInvoice.department_id ?? ""}
                  onChange={(e) =>
                    setSelectedInvoice({
                      ...selectedInvoice,
                      department_id: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                >
                  <option value="">Sin departamento</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Estado</FormLabel>
                <Select
                  value={selectedInvoice.status}
                  onChange={(e) =>
                    setSelectedInvoice({
                      ...selectedInvoice,
                      status: e.target.value as Invoice["status"],
                    })
                  }
                >
                  <option value="uploaded">Subida</option>
                  <option value="extracting">Extrayendo</option>
                  <option value="extracted">Extraida</option>
                  <option value="suggested">Sugerida</option>
                  <option value="validated">Validada</option>
                  <option value="pending">Pendiente</option>
                  <option value="paid">Pagada</option>
                  <option value="failed">Fallida</option>
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Error extraccion</FormLabel>
                <Input
                  value={selectedInvoice.extraction_error ?? ""}
                  isReadOnly
                />
              </FormControl>
            </SimpleGrid>
            <HStack mt={6}>
              <Button
                colorScheme="green"
                onClick={handleSaveDetails}
                isLoading={updateMutation.isPending}
              >
                Guardar cambios
              </Button>
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
            </HStack>
          </Box>
        )}
      </Stack>
    </AppShell>
  );
};

export default ErpInvoicesPage;
