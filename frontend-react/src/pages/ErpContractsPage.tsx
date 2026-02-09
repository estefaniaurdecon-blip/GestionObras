
import React, { useMemo, useState } from "react";
import {
  Box,
  Button,
  Divider,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  SimpleGrid,
  Stack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  Textarea,
  useColorModeValue,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "../components/layout/AppShell";
import {
  ContractsFiltersCard,
  ContractsHero,
  ContractsTableCard,
} from "../components/erp";
import {
  addContractOffer,
  approveContract,
  createContract,
  fetchContracts,
  generateContractDocs,
  rejectContract,
  selectContractOffer,
  submitContractGerencia,
  updateContract,
  lookupSupplierByTaxId,
  type Contract,
  type ContractOffer,
  type ContractType,
} from "../api/contracts";
import { fetchAllTenants, type TenantOption } from "../api/users";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { fetchErpProjects, type ErpProject } from "../api/erpReports";

export const ErpContractsPage: React.FC = () => {
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = currentUser?.is_super_admin === true;
  const tenantId = currentUser?.tenant_id ?? null;

  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [pendingOnly, setPendingOnly] = useState<boolean>(false);
  const filtersDisclosure = useDisclosure({ defaultIsOpen: true });
  const [createTenantId, setCreateTenantId] = useState<string>("");

  const [contractType, setContractType] = useState<ContractType>("SUMINISTRO");
  const [contractTitle, setContractTitle] = useState<string>("");
  const [contractDescription, setContractDescription] = useState<string>("");
  const [contractProjectId, setContractProjectId] = useState<string>("");
  const [supplierName, setSupplierName] = useState<string>("");
  const [supplierTaxId, setSupplierTaxId] = useState<string>("");
  const [supplierEmail, setSupplierEmail] = useState<string>("");
  const [supplierPhone, setSupplierPhone] = useState<string>("");
  const [supplierAddress, setSupplierAddress] = useState<string>("");
  const [supplierCity, setSupplierCity] = useState<string>("");
  const [supplierPostalCode, setSupplierPostalCode] = useState<string>("");
  const [supplierCountry, setSupplierCountry] = useState<string>("");
  const [supplierContact, setSupplierContact] = useState<string>("");
  const [supplierIban, setSupplierIban] = useState<string>("");
  const [supplierBic, setSupplierBic] = useState<string>("");
  const [supplierLookupStatus, setSupplierLookupStatus] = useState<
    "idle" | "found" | "not_found"
  >("idle");
  const [isSupplierLookupLoading, setIsSupplierLookupLoading] =
    useState<boolean>(false);
  const [contractAmount, setContractAmount] = useState<string>("");
  const [contractCurrency, setContractCurrency] = useState<string>("EUR");

  const [obraNumber, setObraNumber] = useState<string>("");
  const [obraName, setObraName] = useState<string>("");
  const [obraPhone, setObraPhone] = useState<string>("");
  const [obraEmail, setObraEmail] = useState<string>("");
  const [obraDuration, setObraDuration] = useState<string>("");
  const [obraStart, setObraStart] = useState<string>("");
  const [obraEnd, setObraEnd] = useState<string>("");
  const [obraMilestones, setObraMilestones] = useState<string>("");
  const [obraUnitsDescription, setObraUnitsDescription] = useState<string>("");
  const [obraPorts, setObraPorts] = useState<string>("");
  const [obraUnloading, setObraUnloading] = useState<string>("");
  const [obraPrice, setObraPrice] = useState<string>("");
  const [obraPaymentMethod, setObraPaymentMethod] = useState<string>("");
  const [obraPaymentTerms, setObraPaymentTerms] = useState<string>("");
  const [obraPaymentUtes, setObraPaymentUtes] = useState<string>("");
  const [obraPaymentAgreed, setObraPaymentAgreed] = useState<string>("");
  const [obraWarrantyRetention, setObraWarrantyRetention] = useState<string>("NO");
  const [obraClosedPrice, setObraClosedPrice] = useState<string>("");
  const [obraWorkers, setObraWorkers] = useState<string>("");
  const [obraNotes, setObraNotes] = useState<string>("");

  const [offerFile, setOfferFile] = useState<File | null>(null);
  const [offerSupplier, setOfferSupplier] = useState<string>("");
  const [offerTaxId, setOfferTaxId] = useState<string>("");
  const [offerEmail, setOfferEmail] = useState<string>("");
  const [offerPhone, setOfferPhone] = useState<string>("");
  const [offerAmount, setOfferAmount] = useState<string>("");
  const [offerCurrency, setOfferCurrency] = useState<string>("EUR");
  const [offerNotes, setOfferNotes] = useState<string>("");
  const [uploadedOffers, setUploadedOffers] = useState<ContractOffer[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<string>("");
  const [createdContract, setCreatedContract] = useState<Contract | null>(null);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const contractDetailsDisclosure = useDisclosure();

  const effectiveTenantId = isSuperAdmin
    ? selectedTenantId
      ? Number(selectedTenantId)
      : undefined
    : tenantId ?? undefined;

  const tenantReady = Boolean(currentUser && (!isSuperAdmin || effectiveTenantId));

  const effectiveCreateTenantId = isSuperAdmin
    ? createTenantId
      ? Number(createTenantId)
      : undefined
    : tenantId ?? undefined;

  const createTenantReady = Boolean(
    currentUser && (!isSuperAdmin || effectiveCreateTenantId),
  );

  const { data: tenants = [] } = useQuery<TenantOption[]>({
    queryKey: ["tenants-all"],
    queryFn: () => fetchAllTenants(),
    enabled: isSuperAdmin,
  });

  const activeTenants = useMemo(
    () => tenants.filter((tenant) => tenant.is_active !== false),
    [tenants],
  );

  const handleSupplierTaxIdBlur = async () => {
    const taxId = supplierTaxId.trim();
    if (!taxId || !effectiveCreateTenantId) {
      setSupplierLookupStatus("idle");
      return;
    }
    try {
      setIsSupplierLookupLoading(true);
      const supplier = await lookupSupplierByTaxId(taxId, effectiveCreateTenantId);
      if (supplier) {
        if (!supplierName && supplier.name) setSupplierName(supplier.name);
        if (!supplierEmail && supplier.email) setSupplierEmail(supplier.email);
        if (!supplierPhone && supplier.phone) setSupplierPhone(supplier.phone);
        if (!supplierAddress && supplier.address) setSupplierAddress(supplier.address);
        if (!supplierCity && supplier.city) setSupplierCity(supplier.city);
        if (!supplierPostalCode && supplier.postal_code) setSupplierPostalCode(supplier.postal_code);
        if (!supplierCountry && supplier.country) setSupplierCountry(supplier.country);
        if (!supplierContact && supplier.contact_name) setSupplierContact(supplier.contact_name);
        if (!supplierIban && supplier.bank_iban) setSupplierIban(supplier.bank_iban);
        if (!supplierBic && supplier.bank_bic) setSupplierBic(supplier.bank_bic);
        setSupplierTaxId(supplier.tax_id || taxId);
        setSupplierLookupStatus("found");
      } else {
        setSupplierLookupStatus("not_found");
      }
    } catch {
      setSupplierLookupStatus("not_found");
    } finally {
      setIsSupplierLookupLoading(false);
    }
  };

  const handleOfferTaxIdBlur = async () => {
    const taxId = offerTaxId.trim();
    if (!taxId || !effectiveCreateTenantId) return;
    try {
      const supplier = await lookupSupplierByTaxId(taxId, effectiveCreateTenantId);
      if (supplier) {
        if (!offerSupplier && supplier.name) setOfferSupplier(supplier.name);
        if (!offerEmail && supplier.email) setOfferEmail(supplier.email);
        if (!offerPhone && supplier.phone) setOfferPhone(supplier.phone);
        setOfferTaxId(supplier.tax_id || taxId);
      }
    } catch {
      // ignore lookup errors for offers
    }
  };

  const contractFilters = useMemo(
    () => ({
      status: statusFilter !== "all" ? (statusFilter as Contract["status"]) : undefined,
      pendingOnly,
    }),
    [statusFilter, pendingOnly],
  );

  const { data: contracts = [], isLoading } = useQuery<Contract[]>({
    queryKey: ["contracts", effectiveTenantId ?? "all", contractFilters],
    queryFn: () => fetchContracts(effectiveTenantId, contractFilters),
    enabled: tenantReady,
  });

  const { data: projects = [] } = useQuery<ErpProject[]>({
    queryKey: ["erp-projects", effectiveCreateTenantId ?? "all"],
    queryFn: () => fetchErpProjects(isSuperAdmin ? effectiveCreateTenantId : undefined),
    enabled: createTenantReady,
  });

  const filteredContracts = useMemo(() => {
    if (!searchTerm.trim()) return contracts;
    const term = searchTerm.toLowerCase();
    return contracts.filter((contract) => {
      return (
        String(contract.id).includes(term) ||
        (contract.supplier_name || "").toLowerCase().includes(term) ||
        (contract.title || "").toLowerCase().includes(term)
      );
    });
  }, [contracts, searchTerm]);

  const pendingCount = useMemo(
    () => filteredContracts.filter((contract) => contract.status.startsWith("PENDING")).length,
    [filteredContracts],
  );

  const signedCount = useMemo(
    () => filteredContracts.filter((contract) => contract.status === "SIGNED").length,
    [filteredContracts],
  );

  const [editTitle, setEditTitle] = useState<string>("");
  const [editDescription, setEditDescription] = useState<string>("");
  const [editSupplierName, setEditSupplierName] = useState<string>("");
  const [editSupplierTaxId, setEditSupplierTaxId] = useState<string>("");
  const [editSupplierEmail, setEditSupplierEmail] = useState<string>("");
  const [editSupplierPhone, setEditSupplierPhone] = useState<string>("");
  const [editSupplierAddress, setEditSupplierAddress] = useState<string>("");
  const [editSupplierCity, setEditSupplierCity] = useState<string>("");
  const [editSupplierPostalCode, setEditSupplierPostalCode] = useState<string>("");
  const [editSupplierCountry, setEditSupplierCountry] = useState<string>("");
  const [editSupplierContact, setEditSupplierContact] = useState<string>("");
  const [editSupplierIban, setEditSupplierIban] = useState<string>("");
  const [editSupplierBic, setEditSupplierBic] = useState<string>("");
  const [editTotalAmount, setEditTotalAmount] = useState<string>("");
  const [editCurrency, setEditCurrency] = useState<string>("EUR");
  const [approvalComment, setApprovalComment] = useState<string>("");
  const [rejectReason, setRejectReason] = useState<string>("");
  const [rejectBackTo, setRejectBackTo] = useState<string>("");

  const openContractDetails = (contract: Contract) => {
    setSelectedContract(contract);
    setEditTitle(contract.title ?? "");
    setEditDescription(contract.description ?? "");
    setEditSupplierName(contract.supplier_name ?? "");
    setEditSupplierTaxId(contract.supplier_tax_id ?? "");
    setEditSupplierEmail(contract.supplier_email ?? "");
    setEditSupplierPhone(contract.supplier_phone ?? "");
    setEditSupplierAddress(contract.supplier_address ?? "");
    setEditSupplierCity(contract.supplier_city ?? "");
    setEditSupplierPostalCode(contract.supplier_postal_code ?? "");
    setEditSupplierCountry(contract.supplier_country ?? "");
    setEditSupplierContact(contract.supplier_contact_name ?? "");
    setEditSupplierIban(contract.supplier_bank_iban ?? "");
    setEditSupplierBic(contract.supplier_bank_bic ?? "");
    setEditTotalAmount(
      contract.total_amount != null ? String(contract.total_amount) : ""
    );
    setEditCurrency(contract.currency ?? "EUR");
    setApprovalComment("");
    setRejectReason("");
    setRejectBackTo("");
    contractDetailsDisclosure.onOpen();
  };

  const createContractMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveCreateTenantId && isSuperAdmin) {
        throw new Error("Selecciona un tenant.");
      }
      if (!contractTitle.trim()) {
        throw new Error("Indica un titulo del contrato.");
      }

      const comparativeData = {
        obra_number: obraNumber,
        description: contractDescription,
        milestones: obraMilestones,
        units_description: obraUnitsDescription,
        notes: obraNotes,
      };

      const contractData = {
        obra_number: obraNumber,
        empresa_contratada: obraName,
        telefono: obraPhone,
        email: obraEmail,
        duracion: obraDuration,
        fecha_inicio: obraStart,
        fecha_fin: obraEnd,
        fechas_hitos: obraMilestones,
        uds_contratadas: obraUnitsDescription,
        portes: obraPorts,
        descarga: obraUnloading,
        precio_total: obraPrice,
        forma_pago: obraPaymentMethod,
        forma_pago_inferior_50k: obraPaymentTerms,
        forma_pago_superior_50k: obraPaymentTerms,
        forma_pago_utes: obraPaymentUtes,
        forma_pago_pactada: obraPaymentAgreed,
        retencion_garantia: obraWarrantyRetention,
        precio_cerrado: obraClosedPrice,
        trabajadores: obraWorkers,
        notas: obraNotes,
      };

      const created = await createContract(
        {
          type: contractType,
          title: contractTitle.trim(),
          description: contractDescription.trim() || null,
          project_id: contractProjectId ? Number(contractProjectId) : null,
          comparative_data: comparativeData,
          contract_data: contractData,
        },
        effectiveCreateTenantId,
      );

      const updated = await updateContract(
        created.id,
        {
          supplier_name: supplierName || null,
          supplier_tax_id: supplierTaxId || null,
          supplier_email: supplierEmail || null,
          supplier_phone: supplierPhone || null,
          supplier_address: supplierAddress || null,
          supplier_city: supplierCity || null,
          supplier_postal_code: supplierPostalCode || null,
          supplier_country: supplierCountry || null,
          supplier_contact_name: supplierContact || null,
          supplier_bank_iban: supplierIban || null,
          supplier_bank_bic: supplierBic || null,
          total_amount: contractAmount ? Number(contractAmount) : null,
          currency: contractCurrency || null,
        },
        effectiveCreateTenantId,
      );

      return updated;
    },
    onSuccess: async (contract) => {
      setCreatedContract(contract);
      await queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast({ title: "Contrato creado", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al crear",
        description: error?.message ?? "No se pudo crear el contrato.",
        status: "error",
      });
    },
  });

  const uploadOfferMutation = useMutation({
    mutationFn: async () => {
      if (!createdContract) throw new Error("Primero crea el contrato.");
      if (!offerFile) throw new Error("Selecciona un archivo.");
      const offer = await addContractOffer(
        createdContract.id,
        offerFile,
        {
          supplier_name: offerSupplier || null,
          supplier_tax_id: offerTaxId || null,
          supplier_email: offerEmail || null,
          supplier_phone: offerPhone || null,
          total_amount: offerAmount ? Number(offerAmount) : null,
          currency: offerCurrency || null,
          notes: offerNotes || null,
        },
        effectiveCreateTenantId,
      );
      return offer;
    },
    onSuccess: (offer) => {
      setUploadedOffers((prev) => [offer, ...prev]);
      setOfferFile(null);
      const hasOcrData =
        Boolean(offer.supplier_name) ||
        Boolean(offer.supplier_tax_id) ||
        Boolean(offer.supplier_email) ||
        Boolean(offer.supplier_phone) ||
        offer.total_amount != null ||
        Boolean(offer.currency);
      if (hasOcrData) {
        setOfferSupplier(offer.supplier_name ?? "");
        setOfferTaxId(offer.supplier_tax_id ?? "");
        setOfferEmail(offer.supplier_email ?? "");
        setOfferPhone(offer.supplier_phone ?? "");
        setOfferAmount(
          offer.total_amount != null ? String(offer.total_amount) : "",
        );
        setOfferCurrency(offer.currency ?? "EUR");
        toast({
          title: "Oferta subida",
          description: "Datos OCR detectados. Revisa la informacion.",
          status: "success",
        });
      } else {
        setOfferSupplier("");
        setOfferTaxId("");
        setOfferEmail("");
        setOfferPhone("");
        setOfferAmount("");
        setOfferCurrency("EUR");
        toast({ title: "Oferta subida", status: "success" });
      }
      setOfferNotes("");
    },
    onError: (error: any) => {
      toast({
        title: "Error al subir oferta",
        description: error?.message ?? "No se pudo subir la oferta.",
        status: "error",
      });
    },
  });

  const selectOfferMutation = useMutation({
    mutationFn: async () => {
      if (!createdContract) throw new Error("Primero crea el contrato.");
      if (!selectedOfferId) throw new Error("Selecciona una oferta.");
      return selectContractOffer(
        createdContract.id,
        Number(selectedOfferId),
        effectiveCreateTenantId,
      );
    },
    onSuccess: (contract) => {
      setCreatedContract(contract);
      toast({ title: "Oferta seleccionada", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al seleccionar",
        description: error?.message ?? "No se pudo seleccionar la oferta.",
        status: "error",
      });
    },
  });

  const generateDocsMutation = useMutation({
    mutationFn: async () => {
      if (!createdContract) throw new Error("Primero crea el contrato.");
      return generateContractDocs(createdContract.id, effectiveCreateTenantId);
    },
    onSuccess: (contract) => {
      setCreatedContract(contract);
      toast({ title: "Documentos generados", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al generar",
        description: error?.message ?? "No se pudo generar.",
        status: "error",
      });
    },
  });

  const submitGerenciaMutation = useMutation({
    mutationFn: async () => {
      if (!createdContract) throw new Error("Primero crea el contrato.");
      return submitContractGerencia(createdContract.id, effectiveCreateTenantId);
    },
    onSuccess: (contract) => {
      setCreatedContract(contract);
      toast({ title: "Enviado a Gerencia", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al enviar",
        description: error?.message ?? "No se pudo enviar.",
        status: "error",
      });
    },
  });

  const saveContractMutation = useMutation({
    mutationFn: async () => {
      if (!selectedContract) throw new Error("No hay contrato seleccionado.");
      return updateContract(
        selectedContract.id,
        {
          title: editTitle || null,
          description: editDescription || null,
          supplier_name: editSupplierName || null,
          supplier_tax_id: editSupplierTaxId || null,
          supplier_email: editSupplierEmail || null,
          supplier_phone: editSupplierPhone || null,
          supplier_address: editSupplierAddress || null,
          supplier_city: editSupplierCity || null,
          supplier_postal_code: editSupplierPostalCode || null,
          supplier_country: editSupplierCountry || null,
          supplier_contact_name: editSupplierContact || null,
          supplier_bank_iban: editSupplierIban || null,
          supplier_bank_bic: editSupplierBic || null,
          total_amount: editTotalAmount ? Number(editTotalAmount) : null,
          currency: editCurrency || null,
        },
        effectiveTenantId,
      );
    },
    onSuccess: async (contract) => {
      setSelectedContract(contract);
      await queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast({ title: "Contrato actualizado", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al guardar",
        description: error?.message ?? "No se pudo actualizar el contrato.",
        status: "error",
      });
    },
  });

  const generateDocsSelectedMutation = useMutation({
    mutationFn: async () => {
      if (!selectedContract) throw new Error("No hay contrato seleccionado.");
      return generateContractDocs(selectedContract.id, effectiveTenantId);
    },
    onSuccess: (contract) => {
      setSelectedContract(contract);
      toast({ title: "Documentos generados", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al generar",
        description: error?.message ?? "No se pudo generar.",
        status: "error",
      });
    },
  });

  const submitGerenciaSelectedMutation = useMutation({
    mutationFn: async () => {
      if (!selectedContract) throw new Error("No hay contrato seleccionado.");
      return submitContractGerencia(selectedContract.id, effectiveTenantId);
    },
    onSuccess: (contract) => {
      setSelectedContract(contract);
      toast({ title: "Enviado a Gerencia", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al enviar",
        description: error?.message ?? "No se pudo enviar.",
        status: "error",
      });
    },
  });

  const approveContractMutation = useMutation({
    mutationFn: async () => {
      if (!selectedContract) throw new Error("No hay contrato seleccionado.");
      return approveContract(
        selectedContract.id,
        {
          comment: approvalComment || null,
        },
        effectiveTenantId,
      );
    },
    onSuccess: async (contract) => {
      setSelectedContract(contract);
      setApprovalComment("");
      await queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast({ title: "Aprobado", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al aprobar",
        description:
          error?.response?.data?.detail ?? error?.message ?? "No se pudo aprobar.",
        status: "error",
      });
    },
  });

  const rejectContractMutation = useMutation({
    mutationFn: async () => {
      if (!selectedContract) throw new Error("No hay contrato seleccionado.");
      if (!rejectReason.trim()) throw new Error("Indica el motivo del rechazo.");
      return rejectContract(
        selectedContract.id,
        {
          reason: rejectReason.trim(),
          back_to_status: rejectBackTo
            ? (rejectBackTo as Contract["status"])
            : null,
        },
        effectiveTenantId,
      );
    },
    onSuccess: async (contract) => {
      setSelectedContract(contract);
      setRejectReason("");
      setRejectBackTo("");
      await queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast({ title: "Rechazado", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al rechazar",
        description:
          error?.response?.data?.detail ?? error?.message ?? "No se pudo rechazar.",
        status: "error",
      });
    },
  });

  return (
    <AppShell>
      <Stack spacing={6}>
        <ContractsHero
          totalCount={filteredContracts.length}
          pendingCount={pendingCount}
          signedCount={signedCount}
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
              Crear contrato
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
              Listado
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
              Resumen
            </Tab>
          </TabList>

          <TabPanels pt={6}>
            <TabPanel px={0}>
              <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
                <Box
                  bg={cardBg}
                  borderRadius="2xl"
                  borderWidth="1px"
                  borderColor={borderColor}
                  p={6}
                  boxShadow="sm"
                >
                  <Stack spacing={4}>
                    <Text fontSize="lg" fontWeight="bold">
                      Crear contrato
                    </Text>

                    {isSuperAdmin && (
                      <FormControl>
                        <FormLabel>Tenant</FormLabel>
                        <Select
                          value={createTenantId}
                          onChange={(e) => setCreateTenantId(e.target.value)}
                        >
                          <option value="">Selecciona un tenant</option>
                          {activeTenants.map((tenant) => (
                            <option key={tenant.id} value={tenant.id}>
                              {tenant.name}
                            </option>
                          ))}
                        </Select>
                      </FormControl>
                    )}

                    <FormControl>
                      <FormLabel>Tipo</FormLabel>
                      <Select
                        value={contractType}
                        onChange={(e) =>
                          setContractType(e.target.value as ContractType)
                        }
                      >
                        <option value="SUMINISTRO">Suministro</option>
                        <option value="SERVICIO">Servicio</option>
                        <option value="SUBCONTRATACION">Subcontratacion</option>
                      </Select>
                    </FormControl>

                    <FormControl>
                      <FormLabel>Titulo</FormLabel>
                      <Input
                        value={contractTitle}
                        onChange={(e) => setContractTitle(e.target.value)}
                      />
                    </FormControl>

                    <FormControl>
                      <FormLabel>Descripcion</FormLabel>
                      <Textarea
                        value={contractDescription}
                        onChange={(e) => setContractDescription(e.target.value)}
                      />
                    </FormControl>

                    <FormControl>
                      <FormLabel>Proyecto</FormLabel>
                      <Select
                        value={contractProjectId}
                        onChange={(e) => setContractProjectId(e.target.value)}
                      >
                        <option value="">Sin proyecto</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </Select>
                    </FormControl>

                    <Divider />

                    <Text fontSize="md" fontWeight="semibold">
                      Datos del proveedor
                    </Text>

                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                      <FormControl>
                        <FormLabel>Empresa contratada</FormLabel>
                        <Input
                          value={supplierName}
                          onChange={(e) => setSupplierName(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>CIF/NIF</FormLabel>
                        <Input
                          value={supplierTaxId}
                          onChange={(e) => {
                            setSupplierTaxId(e.target.value);
                            setSupplierLookupStatus("idle");
                          }}
                          onBlur={handleSupplierTaxIdBlur}
                        />
                        {isSupplierLookupLoading && (
                          <FormHelperText>Buscando proveedor...</FormHelperText>
                        )}
                        {!isSupplierLookupLoading && supplierLookupStatus === "found" && (
                          <FormHelperText>Proveedor encontrado y autocompletado.</FormHelperText>
                        )}
                        {!isSupplierLookupLoading && supplierLookupStatus === "not_found" && (
                          <FormHelperText>
                            Proveedor no encontrado. Se enviarÃ¡ invitaciÃ³n al generar documentos.
                          </FormHelperText>
                        )}
                      </FormControl>
                      <FormControl>
                        <FormLabel>Contacto</FormLabel>
                        <Input
                          value={supplierContact}
                          onChange={(e) => setSupplierContact(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>Telefono</FormLabel>
                        <Input
                          value={supplierPhone}
                          onChange={(e) => setSupplierPhone(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>Email</FormLabel>
                        <Input
                          value={supplierEmail}
                          onChange={(e) => setSupplierEmail(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>Direccion</FormLabel>
                        <Input
                          value={supplierAddress}
                          onChange={(e) => setSupplierAddress(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>Ciudad</FormLabel>
                        <Input
                          value={supplierCity}
                          onChange={(e) => setSupplierCity(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>Codigo postal</FormLabel>
                        <Input
                          value={supplierPostalCode}
                          onChange={(e) =>
                            setSupplierPostalCode(e.target.value)
                          }
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>Pais</FormLabel>
                        <Input
                          value={supplierCountry}
                          onChange={(e) => setSupplierCountry(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>IBAN</FormLabel>
                        <Input
                          value={supplierIban}
                          onChange={(e) => setSupplierIban(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>BIC</FormLabel>
                        <Input
                          value={supplierBic}
                          onChange={(e) => setSupplierBic(e.target.value)}
                        />
                      </FormControl>
                    </SimpleGrid>

                    <Divider />

                    <Text fontSize="md" fontWeight="semibold">
                      Datos del contrato
                    </Text>

                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                      <FormControl>
                        <FormLabel>Nº obra</FormLabel>
                        <Input
                          value={obraNumber}
                          onChange={(e) => setObraNumber(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>Empresa contratada</FormLabel>
                        <Input
                          value={obraName}
                          onChange={(e) => setObraName(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>Telefono</FormLabel>
                        <Input
                          value={obraPhone}
                          onChange={(e) => setObraPhone(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>Email</FormLabel>
                        <Input
                          value={obraEmail}
                          onChange={(e) => setObraEmail(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>Duracion</FormLabel>
                        <Input
                          value={obraDuration}
                          onChange={(e) => setObraDuration(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>Fecha inicio</FormLabel>
                        <Input
                          type="date"
                          value={obraStart}
                          onChange={(e) => setObraStart(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>Fecha fin</FormLabel>
                        <Input
                          type="date"
                          value={obraEnd}
                          onChange={(e) => setObraEnd(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>Precio total</FormLabel>
                        <Input
                          value={obraPrice}
                          onChange={(e) => setObraPrice(e.target.value)}
                        />
                      </FormControl>
                    </SimpleGrid>

                    <FormControl>
                      <FormLabel>Fechas por hitos / aspectos clave</FormLabel>
                      <Textarea
                        value={obraMilestones}
                        onChange={(e) => setObraMilestones(e.target.value)}
                      />
                    </FormControl>

                    <FormControl>
                      <FormLabel>Descripcion UDs contratadas</FormLabel>
                      <Textarea
                        value={obraUnitsDescription}
                        onChange={(e) =>
                          setObraUnitsDescription(e.target.value)
                        }
                      />
                    </FormControl>

                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                      <FormControl>
                        <FormLabel>Portes (a cargo de quien)</FormLabel>
                        <Input
                          value={obraPorts}
                          onChange={(e) => setObraPorts(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>Descarga (a cargo de quien)</FormLabel>
                        <Input
                          value={obraUnloading}
                          onChange={(e) => setObraUnloading(e.target.value)}
                        />
                      </FormControl>
                    </SimpleGrid>

                    <FormControl>
                      <FormLabel>Forma de pago</FormLabel>
                      <Input
                        value={obraPaymentMethod}
                        onChange={(e) =>
                          setObraPaymentMethod(e.target.value)
                        }
                      />
                    </FormControl>

                    <FormControl>
                      <FormLabel>Forma de pago pactada</FormLabel>
                      <Input
                        value={obraPaymentAgreed}
                        onChange={(e) => setObraPaymentAgreed(e.target.value)}
                      />
                    </FormControl>

                    <FormControl>
                      <FormLabel>Forma de pago UTEs</FormLabel>
                      <Input
                        value={obraPaymentUtes}
                        onChange={(e) => setObraPaymentUtes(e.target.value)}
                      />
                    </FormControl>

                    <FormControl>
                      <FormLabel>Forma de pago (inferior/superior 50k)</FormLabel>
                      <Input
                        value={obraPaymentTerms}
                        onChange={(e) => setObraPaymentTerms(e.target.value)}
                      />
                    </FormControl>

                    {contractType === "SUBCONTRATACION" && (
                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                        <FormControl>
                          <FormLabel>Precio cerrado o ejecutado</FormLabel>
                          <Input
                            value={obraClosedPrice}
                            onChange={(e) =>
                              setObraClosedPrice(e.target.value)
                            }
                          />
                        </FormControl>
                        <FormControl>
                          <FormLabel>Trabajadores en obra</FormLabel>
                          <Input
                            value={obraWorkers}
                            onChange={(e) => setObraWorkers(e.target.value)}
                          />
                        </FormControl>
                      </SimpleGrid>
                    )}

                    <FormControl>
                      <FormLabel>Retencion garantia (SI/NO)</FormLabel>
                      <Select
                        value={obraWarrantyRetention}
                        onChange={(e) =>
                          setObraWarrantyRetention(e.target.value)
                        }
                      >
                        <option value="SI">SI</option>
                        <option value="NO">NO</option>
                      </Select>
                    </FormControl>

                    <FormControl>
                      <FormLabel>Notas / aclaraciones</FormLabel>
                      <Textarea
                        value={obraNotes}
                        onChange={(e) => setObraNotes(e.target.value)}
                      />
                    </FormControl>

                    <Divider />

                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                      <FormControl>
                        <FormLabel>Importe total</FormLabel>
                        <Input
                          value={contractAmount}
                          onChange={(e) => setContractAmount(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>Moneda</FormLabel>
                        <Select
                          value={contractCurrency}
                          onChange={(e) => setContractCurrency(e.target.value)}
                        >
                          <option value="EUR">EUR</option>
                          <option value="USD">USD</option>
                        </Select>
                      </FormControl>
                    </SimpleGrid>

                    <Button
                      colorScheme="green"
                      onClick={() => createContractMutation.mutate()}
                      isLoading={createContractMutation.isPending}
                    >
                      Crear contrato
                    </Button>
                  </Stack>
                </Box>

                <Box
                  bg={cardBg}
                  borderRadius="2xl"
                  borderWidth="1px"
                  borderColor={borderColor}
                  p={6}
                  boxShadow="sm"
                >
                  <Stack spacing={4}>
                    <Text fontSize="lg" fontWeight="bold">
                      Ofertas y documentos
                    </Text>
                    <Text fontSize="sm" color={subtleText}>
                      Usa este bloque para subir ofertas y seleccionar la oferta final.
                    </Text>

                    <FormControl>
                      <FormLabel>Oferta (archivo)</FormLabel>
                      <Input
                        type="file"
                        onChange={(e) => setOfferFile(e.target.files?.[0] ?? null)}
                      />
                    </FormControl>

                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                      <FormControl>
                        <FormLabel>Proveedor</FormLabel>
                        <Input
                          value={offerSupplier}
                          onChange={(e) => setOfferSupplier(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>CIF/NIF</FormLabel>
                        <Input
                          value={offerTaxId}
                          onChange={(e) => setOfferTaxId(e.target.value)}
                          onBlur={handleOfferTaxIdBlur}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>Email</FormLabel>
                        <Input
                          value={offerEmail}
                          onChange={(e) => setOfferEmail(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>Telefono</FormLabel>
                        <Input
                          value={offerPhone}
                          onChange={(e) => setOfferPhone(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>Importe</FormLabel>
                        <Input
                          value={offerAmount}
                          onChange={(e) => setOfferAmount(e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>Moneda</FormLabel>
                        <Select
                          value={offerCurrency}
                          onChange={(e) => setOfferCurrency(e.target.value)}
                        >
                          <option value="EUR">EUR</option>
                          <option value="USD">USD</option>
                        </Select>
                      </FormControl>
                    </SimpleGrid>

                    <FormControl>
                      <FormLabel>Notas</FormLabel>
                      <Textarea
                        value={offerNotes}
                        onChange={(e) => setOfferNotes(e.target.value)}
                      />
                    </FormControl>

                    <Button
                      colorScheme="green"
                      onClick={() => uploadOfferMutation.mutate()}
                      isLoading={uploadOfferMutation.isPending}
                    >
                      Subir oferta
                    </Button>

                    <Divider />

                    <FormControl>
                      <FormLabel>Oferta final</FormLabel>
                      <Select
                        value={selectedOfferId}
                        onChange={(e) => setSelectedOfferId(e.target.value)}
                      >
                        <option value="">Selecciona una oferta</option>
                        {uploadedOffers.map((offer) => (
                          <option key={offer.id} value={offer.id}>
                            {offer.supplier_name || "Proveedor"} (#{offer.id})
                          </option>
                        ))}
                      </Select>
                    </FormControl>

                    <HStack spacing={3} flexWrap="wrap">
                      <Button
                        variant="outline"
                        onClick={() => selectOfferMutation.mutate()}
                        isLoading={selectOfferMutation.isPending}
                      >
                        Seleccionar oferta
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => generateDocsMutation.mutate()}
                        isLoading={generateDocsMutation.isPending}
                      >
                        Generar documentos
                      </Button>
                      <Button
                        colorScheme="purple"
                        onClick={() => submitGerenciaMutation.mutate()}
                        isLoading={submitGerenciaMutation.isPending}
                      >
                        Enviar a Gerencia
                      </Button>
                    </HStack>

                    {createdContract && (
                      <Box
                        bg={useColorModeValue("gray.50", "gray.800")}
                        borderRadius="lg"
                        borderWidth="1px"
                        borderColor={borderColor}
                        p={4}
                      >
                        <Text fontSize="sm" color={subtleText}>
                          Contrato actual
                        </Text>
                        <Text fontWeight="bold">#{createdContract.id}</Text>
                        <Text fontSize="sm">Estado: {createdContract.status}</Text>
                      </Box>
                    )}
                  </Stack>
                </Box>
              </SimpleGrid>
            </TabPanel>

            <TabPanel px={0}>
              <Stack spacing={6}>
                <ContractsFiltersCard
                  isOpen={filtersDisclosure.isOpen}
                  onToggle={filtersDisclosure.onToggle}
                  searchTerm={searchTerm}
                  onSearchTermChange={setSearchTerm}
                  statusFilter={statusFilter}
                  onStatusFilterChange={setStatusFilter}
                  pendingOnly={pendingOnly}
                  onPendingOnlyChange={setPendingOnly}
                  isSuperAdmin={isSuperAdmin}
                  selectedTenantId={selectedTenantId}
                  onTenantChange={setSelectedTenantId}
                  activeTenants={activeTenants}
                />

                <ContractsTableCard
                  contracts={filteredContracts}
                  isLoading={isLoading}
                  onOpenDetails={openContractDetails}
                />
              </Stack>
            </TabPanel>

            <TabPanel px={0}>
              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={5}>
                <Box
                  bg={cardBg}
                  borderRadius="2xl"
                  borderWidth="1px"
                  borderColor={borderColor}
                  px={6}
                  py={5}
                  boxShadow="sm"
                >
                  <Text fontSize="sm" color={subtleText}>
                    Total expedientes
                  </Text>
                  <Text fontSize="2xl" fontWeight="bold">
                    {filteredContracts.length}
                  </Text>
                </Box>
                <Box
                  bg={cardBg}
                  borderRadius="2xl"
                  borderWidth="1px"
                  borderColor={borderColor}
                  px={6}
                  py={5}
                  boxShadow="sm"
                >
                  <Text fontSize="sm" color={subtleText}>
                    Pendientes
                  </Text>
                  <Text fontSize="2xl" fontWeight="bold" color="orange.500">
                    {pendingCount}
                  </Text>
                </Box>
                <Box
                  bg={cardBg}
                  borderRadius="2xl"
                  borderWidth="1px"
                  borderColor={borderColor}
                  px={6}
                  py={5}
                  boxShadow="sm"
                >
                  <Text fontSize="sm" color={subtleText}>
                    Firmados
                  </Text>
                  <Text fontSize="2xl" fontWeight="bold" color="green.600">
                    {signedCount}
                  </Text>
                </Box>
              </SimpleGrid>
            </TabPanel>
          </TabPanels>
        </Tabs>
        <Modal
          isOpen={contractDetailsDisclosure.isOpen}
          onClose={contractDetailsDisclosure.onClose}
          size="xl"
        >
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>Contrato #{selectedContract?.id}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Stack spacing={4}>
                <FormControl>
                  <FormLabel>Titulo</FormLabel>
                  <Input
                    isDisabled={selectedContract?.status !== "DRAFT"}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Descripcion</FormLabel>
                  <Textarea
                    isDisabled={selectedContract?.status !== "DRAFT"}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                  />
                </FormControl>
                <Divider />
                <Text fontWeight="semibold">Proveedor</Text>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  <FormControl>
                    <FormLabel>Empresa</FormLabel>
                    <Input
                      isDisabled={selectedContract?.status !== "DRAFT"}
                      value={editSupplierName}
                      onChange={(e) => setEditSupplierName(e.target.value)}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>CIF/NIF</FormLabel>
                    <Input
                      isDisabled={selectedContract?.status !== "DRAFT"}
                      value={editSupplierTaxId}
                      onChange={(e) => setEditSupplierTaxId(e.target.value)}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Contacto</FormLabel>
                    <Input
                      isDisabled={selectedContract?.status !== "DRAFT"}
                      value={editSupplierContact}
                      onChange={(e) => setEditSupplierContact(e.target.value)}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Telefono</FormLabel>
                    <Input
                      isDisabled={selectedContract?.status !== "DRAFT"}
                      value={editSupplierPhone}
                      onChange={(e) => setEditSupplierPhone(e.target.value)}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Email</FormLabel>
                    <Input
                      isDisabled={selectedContract?.status !== "DRAFT"}
                      value={editSupplierEmail}
                      onChange={(e) => setEditSupplierEmail(e.target.value)}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Direccion</FormLabel>
                    <Input
                      isDisabled={selectedContract?.status !== "DRAFT"}
                      value={editSupplierAddress}
                      onChange={(e) => setEditSupplierAddress(e.target.value)}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Ciudad</FormLabel>
                    <Input
                      isDisabled={selectedContract?.status !== "DRAFT"}
                      value={editSupplierCity}
                      onChange={(e) => setEditSupplierCity(e.target.value)}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Codigo postal</FormLabel>
                    <Input
                      isDisabled={selectedContract?.status !== "DRAFT"}
                      value={editSupplierPostalCode}
                      onChange={(e) => setEditSupplierPostalCode(e.target.value)}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Pais</FormLabel>
                    <Input
                      isDisabled={selectedContract?.status !== "DRAFT"}
                      value={editSupplierCountry}
                      onChange={(e) => setEditSupplierCountry(e.target.value)}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>IBAN</FormLabel>
                    <Input
                      isDisabled={selectedContract?.status !== "DRAFT"}
                      value={editSupplierIban}
                      onChange={(e) => setEditSupplierIban(e.target.value)}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>BIC</FormLabel>
                    <Input
                      isDisabled={selectedContract?.status !== "DRAFT"}
                      value={editSupplierBic}
                      onChange={(e) => setEditSupplierBic(e.target.value)}
                    />
                  </FormControl>
                </SimpleGrid>
                <Divider />
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  <FormControl>
                    <FormLabel>Importe total</FormLabel>
                    <Input
                      isDisabled={selectedContract?.status !== "DRAFT"}
                      value={editTotalAmount}
                      onChange={(e) => setEditTotalAmount(e.target.value)}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Moneda</FormLabel>
                    <Select
                      isDisabled={selectedContract?.status !== "DRAFT"}
                      value={editCurrency}
                      onChange={(e) => setEditCurrency(e.target.value)}
                    >
                      <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
                    </Select>
                  </FormControl>
                </SimpleGrid>
                <Text fontSize="sm" color={subtleText}>
                  Estado actual: {selectedContract?.status ?? "-"}
                </Text>

                {selectedContract?.status?.startsWith("PENDING") &&
                  selectedContract?.status !== "PENDING_SUPPLIER" && (
                  <>
                    <Divider />
                    <Text fontWeight="semibold">Revision y aprobacion</Text>
                    <FormControl>
                      <FormLabel>Comentario</FormLabel>
                      <Textarea
                        value={approvalComment}
                        onChange={(e) => setApprovalComment(e.target.value)}
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Motivo de rechazo</FormLabel>
                      <Textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Volver a estado</FormLabel>
                      <Select
                        placeholder="Selecciona estado"
                        value={rejectBackTo}
                        onChange={(e) => setRejectBackTo(e.target.value)}
                      >
                        <option value="DRAFT">DRAFT</option>
                        <option value="PENDING_SUPPLIER">PENDING_SUPPLIER</option>
                        <option value="PENDING_JEFE_OBRA">PENDING_JEFE_OBRA</option>
                        <option value="PENDING_GERENCIA">PENDING_GERENCIA</option>
                      </Select>
                    </FormControl>
                  </>
                )}
              </Stack>
            </ModalBody>
            <ModalFooter>
              <HStack spacing={3} flexWrap="wrap">
                {selectedContract?.status === "DRAFT" && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => generateDocsSelectedMutation.mutate()}
                      isLoading={generateDocsSelectedMutation.isPending}
                    >
                      Generar documentos
                    </Button>
                    <Button
                      colorScheme="green"
                      onClick={() => saveContractMutation.mutate()}
                      isLoading={saveContractMutation.isPending}
                    >
                      Guardar cambios
                    </Button>
                  </>
                )}
                {selectedContract?.status === "PENDING_JEFE_OBRA" && (
                  <Button
                    variant="outline"
                    onClick={() => submitGerenciaSelectedMutation.mutate()}
                    isLoading={submitGerenciaSelectedMutation.isPending}
                  >
                    Enviar a Gerencia
                  </Button>
                )}
                {selectedContract?.status?.startsWith("PENDING") &&
                  selectedContract?.status !== "PENDING_SUPPLIER" && (
                  <>
                    <Button
                      colorScheme="green"
                      onClick={() => approveContractMutation.mutate()}
                      isLoading={approveContractMutation.isPending}
                    >
                      Aprobar
                    </Button>
                    <Button
                      colorScheme="red"
                      variant="outline"
                      onClick={() => rejectContractMutation.mutate()}
                      isLoading={rejectContractMutation.isPending}
                    >
                      Rechazar
                    </Button>
                  </>
                )}
              </HStack>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </Stack>
    </AppShell>
  );
};

export default ErpContractsPage;
