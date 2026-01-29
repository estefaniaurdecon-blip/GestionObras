import React, { useMemo, useState } from "react";
import {
  Box,
  SimpleGrid,
  Stack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "../components/layout/AppShell";
import {
  InvoiceDetailsPanel,
  InvoicesFiltersCard,
  InvoicesHero,
  InvoicesExpenseSummaryCard,
  InvoicesSummaryPanel,
  InvoicesTableCard,
  InvoicesUploadCard,
} from "../components/erp/invoices";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { fetchErpProjects, type ErpProject } from "../api/erpReports";
import { fetchMilestones, type ErpMilestone } from "../api/erpStructure";
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

export const ErpInvoicesPage: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = Boolean(currentUser?.is_super_admin);
  const tenantId = currentUser?.tenant_id ?? null;

  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadProjectId, setUploadProjectId] = useState<string>("");
  const [subsidizable, setSubsidizable] = useState<string>("");
  const [expenseType, setExpenseType] = useState<string>("");
  const [milestoneId, setMilestoneId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const filtersDisclosure = useDisclosure({ defaultIsOpen: true });

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
    const endToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );

    switch (dateRange) {
      case "today":
        return {
          from: formatDateInput(endToday),
          to: formatDateInput(endToday),
        };
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
        const from = new Date(
          endToday.getFullYear(),
          endToday.getMonth() - 1,
          1,
        );
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

  const projectTenantKey = isSuperAdmin
    ? "all"
    : (effectiveTenantId ?? "all");

  const { data: projects = [] } = useQuery<ErpProject[]>({
    queryKey: ["erp-projects", projectTenantKey],
    queryFn: () => fetchErpProjects(isSuperAdmin ? undefined : effectiveTenantId),
    enabled: isSuperAdmin ? Boolean(currentUser) : tenantReady,
  });

  const { data: tenants = [] } = useQuery<TenantOption[]>({
    queryKey: ["tenants-all"],
    queryFn: () => fetchAllTenants(),
    enabled: isSuperAdmin,
  });

  const activeProjects = useMemo(() => {
    const filtered = projects.filter((project) => project.is_active !== false);
    if (!isSuperAdmin || !selectedTenantId) return filtered;
    const tenantIdNum = Number(selectedTenantId);
    return filtered.filter((project) => project.tenant_id === tenantIdNum);
  }, [isSuperAdmin, projects, selectedTenantId]);

  const activeTenants = useMemo(
    () => tenants.filter((tenant) => tenant.is_active !== false),
    [tenants],
  );

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["hr-departments", effectiveTenantId ?? "all"],
    queryFn: () => fetchDepartments(effectiveTenantId),
    enabled: tenantReady,
  });

  const { data: milestones = [] } = useQuery<ErpMilestone[]>({
    queryKey: ["erp-milestones", effectiveTenantId ?? "all"],
    queryFn: () => fetchMilestones({}, effectiveTenantId),
    enabled: tenantReady,
  });

  const milestonesForUpload = useMemo(() => {
    if (!uploadProjectId) return [];
    const projectIdNum = Number(uploadProjectId);
    return milestones.filter((milestone) => milestone.project_id === projectIdNum);
  }, [milestones, uploadProjectId]);

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

  const totalAmount = filteredInvoices.reduce(
    (acc, invoice) => acc + Number(invoice.total_amount || 0),
    0,
  );
  const pendingAmount = filteredInvoices.reduce(
    (acc, invoice) =>
      acc + (invoice.status === "paid" ? 0 : Number(invoice.total_amount || 0)),
    0,
  );
  const paidAmount = filteredInvoices.reduce(
    (acc, invoice) =>
      acc + (invoice.status === "paid" ? Number(invoice.total_amount || 0) : 0),
    0,
  );
  const pendingCount = filteredInvoices.filter(
    (invoice) => invoice.status !== "paid",
  ).length;
  const paidCount = filteredInvoices.filter(
    (invoice) => invoice.status === "paid",
  ).length;

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
        subsidizable === "subsidizable",
        expenseType || null,
        milestoneId ? Number(milestoneId) : null,
      );
    },
    onSuccess: async () => {
      setFile(null);
      setUploadProjectId("");
      setSubsidizable("");
      setExpenseType("");
      setMilestoneId("");
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
      subsidizable:
        selectedInvoice.subsidizable !== undefined
          ? selectedInvoice.subsidizable
          : null,
      expense_type: selectedInvoice.expense_type ?? null,
      milestone_id: selectedInvoice.milestone_id ?? null,
      project_id: selectedInvoice.project_id ?? null,
      department_id: selectedInvoice.department_id ?? null,
      status: selectedInvoice.status,
    });
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setProjectFilter("all");
    setDepartmentFilter("all");
    setDateRange("all");
  };

  const handleTenantChange = (value: string) => {
    setSelectedTenantId(value);
    setUploadProjectId("");
    setMilestoneId("");
    setSubsidizable("");
    setExpenseType("");
    setProjectFilter("all");
  };

  const handleUploadProjectChange = (value: string) => {
    setUploadProjectId(value);
    setMilestoneId("");
    setExpenseType("");
    if (!isSuperAdmin || selectedTenantId || !value) return;
    const selectedProject = activeProjects.find(
      (project) => project.id === Number(value),
    );
    if (selectedProject?.tenant_id != null) {
      setSelectedTenantId(String(selectedProject.tenant_id));
    }
  };

  const subsidizableDestinations = [
    "Materiales",
    "Colaboraciones externas",
    "Otros gastos subvencionables",
  ];
  const nonSubsidizableDestinations = ["Otros gastos (no subvencionables)"];

  const handleSubsidizableChange = (value: string) => {
    setSubsidizable(value);
    setExpenseType("");
  };

  return (
    <AppShell>
      <Stack spacing={6}>
        <InvoicesHero
          totalCount={filteredInvoices.length}
          totalAmount={totalAmount}
          pendingCount={pendingCount}
          paidCount={paidCount}
        />

        <Tabs variant="unstyled">
          <TabList
            gap={3}
            flexWrap="wrap"
            borderBottomWidth="1px"
            borderColor="gray.200"
            pb={3}
          >
            <Tab
              px={5}
              py={2}
              borderRadius="lg"
              fontWeight="semibold"
              bg="white"
              borderWidth="1px"
              borderColor="gray.200"
              _selected={{
                bg: "green.600",
                color: "white",
                borderColor: "green.600",
              }}
            >
              Subir factura
            </Tab>
            <Tab
              px={5}
              py={2}
              borderRadius="lg"
              fontWeight="semibold"
              bg="white"
              borderWidth="1px"
              borderColor="gray.200"
              _selected={{
                bg: "green.600",
                color: "white",
                borderColor: "green.600",
              }}
            >
              Listado de facturas
            </Tab>
            <Tab
              px={5}
              py={2}
              borderRadius="lg"
              fontWeight="semibold"
              bg="white"
              borderWidth="1px"
              borderColor="gray.200"
              _selected={{
                bg: "green.600",
                color: "white",
                borderColor: "green.600",
              }}
            >
              Resumen de gastos
            </Tab>
          </TabList>

          <TabPanels pt={6}>
            <TabPanel px={0}>
              <SimpleGrid
                columns={{ base: 1, lg: 2 }}
                spacing={6}
                alignItems="start"
              >
                <InvoicesUploadCard
                  isSuperAdmin={isSuperAdmin}
                  tenantReady={tenantReady}
                  selectedTenantId={selectedTenantId}
                  activeTenants={activeTenants}
                  onTenantChange={handleTenantChange}
                  file={file}
                  onFileChange={setFile}
                  uploadProjectId={uploadProjectId}
                  onUploadProjectChange={handleUploadProjectChange}
                  activeProjects={activeProjects}
                  subsidizable={subsidizable}
                  onSubsidizableChange={handleSubsidizableChange}
                  expenseType={expenseType}
                  onExpenseTypeChange={setExpenseType}
                  subsidizableDestinations={subsidizableDestinations}
                  nonSubsidizableDestinations={nonSubsidizableDestinations}
                  milestoneId={milestoneId}
                  onMilestoneChange={setMilestoneId}
                  milestones={milestonesForUpload}
                  onUpload={() => uploadMutation.mutate()}
                  isUploading={uploadMutation.isPending}
                />
                <InvoicesExpenseSummaryCard
                  invoices={filteredInvoices}
                  projects={activeProjects}
                  milestones={milestones}
                />
              </SimpleGrid>
            </TabPanel>

            <TabPanel px={0}>
              <Stack spacing={6}>
                <InvoicesFiltersCard
                  isOpen={filtersDisclosure.isOpen}
                  onToggle={filtersDisclosure.onToggle}
                  searchTerm={searchTerm}
                  onSearchTermChange={setSearchTerm}
                  statusFilter={statusFilter}
                  onStatusFilterChange={setStatusFilter}
                  projectFilter={projectFilter}
                  onProjectFilterChange={setProjectFilter}
                  departmentFilter={departmentFilter}
                  onDepartmentFilterChange={setDepartmentFilter}
                  dateRange={dateRange}
                  onDateRangeChange={setDateRange}
                  activeProjects={activeProjects}
                  departments={departments}
                  onClearFilters={handleClearFilters}
                />

                <InvoicesTableCard
                  invoices={filteredInvoices}
                  isLoading={isLoading}
                  onOpenDetails={handleOpenDetails}
                  onDownload={handleDownload}
                  onMarkPaid={(invoiceId) => markPaidMutation.mutate(invoiceId)}
                  onReprocess={(invoiceId) => reprocessMutation.mutate(invoiceId)}
                  onDelete={(invoiceId) => deleteMutation.mutate(invoiceId)}
                  isMarkingPaid={markPaidMutation.isPending}
                  isReprocessing={reprocessMutation.isPending}
                  isDeleting={deleteMutation.isPending}
                  totalAmount={totalAmount}
                  pendingAmount={pendingAmount}
                  paidAmount={paidAmount}
                />
              </Stack>
            </TabPanel>

            <TabPanel px={0}>
              <Box>
                <InvoicesSummaryPanel
                  invoices={filteredInvoices}
                  projects={activeProjects}
                  milestones={milestones}
                />
              </Box>
            </TabPanel>
          </TabPanels>
        </Tabs>

        {selectedInvoice && isOpen && (
          <InvoiceDetailsPanel
            invoice={selectedInvoice}
            activeProjects={activeProjects}
            milestones={milestones}
            departments={departments}
            onInvoiceChange={(invoice) => setSelectedInvoice(invoice)}
            onSave={handleSaveDetails}
            onClose={onClose}
            isSaving={updateMutation.isPending}
          />
        )}
      </Stack>
    </AppShell>
  );
};

export default ErpInvoicesPage;
