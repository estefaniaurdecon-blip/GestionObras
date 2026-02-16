import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  IconButton,
  Input,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  SimpleGrid,
  Stack,
  Select,
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
  Spinner,
  Radio,
  RadioGroup,
} from "@chakra-ui/react";
import {
  AlertCircle,
  Bell,
  Check,
  Clock,
  Download,
  Eye,
  FileText,
  Plus,
  Send,
  Trash2,
  Upload,
  Users,
  Truck,
  Wrench,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { fetchAllTenants, type TenantOption } from "../../../api/users";
import {
  addContractOffer,
  createContract,
  fetchContracts,
  selectContractOffer,
  submitComparative,
  submitContractGerencia,
  updateContract,
  type Contract,
  type ContractType,
  type ContractUpdatePayload,
} from "../../../api/contracts";


// ============================================================================
// COMPONENTE PRINCIPAL - MÓDULO DE CONTRATOS
// ============================================================================

type ViewState =
  | "dashboard"
  | "comparativo-upload"
  | "comparativo-manual"
  | "comparativo-review"
  | "contrato-form"
  | "approval-panel";

interface NotificationItem {
  id: number;
  type: "comparativo" | "contrato" | "reminder";
  message: string;
  from?: string;
  reference?: string;
  time: string;
  unread: boolean;
}

interface ComparativoData {
  type: "ocr" | "manual";
  files?: FileUploadState[];
  ofertas?: OfertaItem[];
}

interface FileUploadState {
  id: number;
  name: string;
  size?: number;
  file?: File;
  status: "processing" | "completed" | "warning";
  progress: number;
}

interface OfertaItem {
  id: number;
  proveedor: string;
  importe: string;
  plazo: string;
  observaciones: string;
}

export const ContractsModule: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = currentUser?.is_super_admin === true;
  const [selectedTenantId, setSelectedTenantId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("contracts_selected_tenant") ?? "";
  });

  const effectiveTenantId = isSuperAdmin
    ? selectedTenantId
      ? Number(selectedTenantId)
      : undefined
    : currentUser?.tenant_id ?? undefined;

  const [currentView, setCurrentView] = useState<ViewState>("dashboard");
  const [comparativoData, setComparativoData] = useState<ComparativoData | null>(null);
  const [currentContract, setCurrentContract] = useState<Contract | null>(null);
  const [notifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedTenantId) {
      window.localStorage.setItem("contracts_selected_tenant", selectedTenantId);
    } else {
      window.localStorage.removeItem("contracts_selected_tenant");
    }
  }, [selectedTenantId]);

  const tenantsQuery = useQuery({
    queryKey: ["tenants"],
    queryFn: fetchAllTenants,
    enabled: isSuperAdmin,
  });

  const activeTenants = useMemo<TenantOption[]>(
    () => (tenantsQuery.data ?? []).filter((tenant) => tenant.is_active),
    [tenantsQuery.data],
  );

  const contractsQuery = useQuery({
    queryKey: ["contracts", effectiveTenantId],
    queryFn: () => fetchContracts(effectiveTenantId),
    enabled: !isSuperAdmin || Boolean(effectiveTenantId),
  });

  const createContractMutation = useMutation({
    mutationFn: (payload: { type: ContractType; comparative_data?: Record<string, unknown> }) =>
      createContract(
        {
          type: payload.type,
          title: "Comparativo generado",
          comparative_data: payload.comparative_data ?? null,
        },
        effectiveTenantId,
      ),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({ queryKey: ["contracts", effectiveTenantId] });
    },
    onError: () => {
      toast({
        status: "error",
        title: "No se pudo crear el comparativo",
      });
    },
  });

  const submitComparativeMutation = useMutation({
    mutationFn: (contractId: number) => submitComparative(contractId, effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({ queryKey: ["contracts", effectiveTenantId] });
      toast({ status: "success", title: "Comparativo enviado a revisión" });
    },
  });

  const submitGerenciaMutation = useMutation({
    mutationFn: (contractId: number) => submitContractGerencia(contractId, effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({ queryKey: ["contracts", effectiveTenantId] });
      toast({ status: "success", title: "Contrato enviado a Gerencia" });
    },
  });

  const updateContractMutation = useMutation({
    mutationFn: ({ contractId, payload }: { contractId: number; payload: ContractUpdatePayload }) =>
      updateContract(contractId, payload, effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({ queryKey: ["contracts", effectiveTenantId] });
      toast({ status: "success", title: "Contrato actualizado" });
    },
  });

  const selectOfferMutation = useMutation({
    mutationFn: ({ contractId, offerId }: { contractId: number; offerId: number }) =>
      selectContractOffer(contractId, offerId, effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({ queryKey: ["contracts", effectiveTenantId] });
    },
  });

  const addOfferMutation = useMutation({
    mutationFn: ({ contractId, file }: { contractId: number; file: File }) =>
      addContractOffer(contractId, file, {}, effectiveTenantId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contracts", effectiveTenantId] });
    },
  });

  const contracts = contractsQuery.data ?? [];
  const latestContracts = useMemo(() => contracts.slice(0, 3), [contracts]);
  const pendingContract = useMemo(
    () =>
      contracts.find(
        (contract) =>
          contract.status.startsWith("PENDING") ||
          contract.comparative_status === "PENDING_REVIEW",
      ) ?? null,
    [contracts],
  );

  const handleSelectContract = (contract: Contract, view: ViewState) => {
    setCurrentContract(contract);
    setCurrentView(view);
  };

  if (contractsQuery.isLoading) {
    return (
      <Flex justify="center" py={10}>
        <Spinner />
      </Flex>
    );
  }

  return (
    <Box>
      <Header notifications={notifications} />
      {isSuperAdmin && (
        <TenantSelector
          activeTenants={activeTenants}
          selectedTenantId={selectedTenantId}
          onChange={setSelectedTenantId}
          isLoading={tenantsQuery.isLoading}
        />
      )}
      {isSuperAdmin && !effectiveTenantId ? (
        <Alert status="warning" borderRadius="md" mt={6}>
          <AlertIcon />
          Selecciona un tenant para visualizar y gestionar contratos.
        </Alert>
      ) : (
      <Box mt={6}>
        {currentView === "dashboard" && (
          <Dashboard
            onNavigate={setCurrentView}
            contracts={contracts}
            latestContracts={latestContracts}
            onSelectContract={handleSelectContract}
          />
        )}
        {currentView === "comparativo-upload" && (
          <ComparativoUpload
            onNavigate={setCurrentView}
            onComplete={setComparativoData}
            onCreateContract={async (payload, files) => {
              const contract = await createContractMutation.mutateAsync(payload);
              if (files.length > 0) {
                await Promise.all(
                  files.map((file) =>
                    addOfferMutation.mutateAsync({ contractId: contract.id, file }),
                  ),
                );
              }
              const refreshed = await fetchContracts(effectiveTenantId);
              const updated = refreshed.find((item) => item.id === contract.id) ?? contract;
              setCurrentContract(updated);
              setCurrentView("comparativo-review");
            }}
          />
        )}
        {currentView === "comparativo-manual" && (
          <ComparativoManual
            onNavigate={setCurrentView}
            onComplete={setComparativoData}
            onCreateContract={async (payload) => {
              const contract = await createContractMutation.mutateAsync(payload);
              setCurrentContract(contract);
              setCurrentView("comparativo-review");
            }}
          />
        )}
        {currentView === "comparativo-review" && (
          <ComparativoReview
            data={comparativoData}
            contract={currentContract}
            onNavigate={setCurrentView}
            onSelectOffer={(offerId) => {
              if (!currentContract) return;
              selectOfferMutation.mutate({ contractId: currentContract.id, offerId });
            }}
            onSubmitComparative={() => {
              if (!currentContract) return;
              submitComparativeMutation.mutate(currentContract.id);
            }}
          />
        )}
        {currentView === "contrato-form" && (
          <ContratoForm
            comparativoData={comparativoData}
            contract={currentContract}
            onNavigate={setCurrentView}
            onSave={(payload) => {
              if (!currentContract) return;
              updateContractMutation.mutate({ contractId: currentContract.id, payload });
            }}
            onSubmit={() => {
              if (!currentContract) return;
              submitGerenciaMutation.mutate(currentContract.id);
            }}
          />
        )}
        {currentView === "approval-panel" && (
          <ApprovalPanel onNavigate={setCurrentView} contract={pendingContract} />
        )}
      </Box>
      )}
    </Box>
  );
};

// ============================================================================
// SELECTOR DE TENANT (SUPERADMIN)
// ============================================================================

interface TenantSelectorProps {
  activeTenants: TenantOption[];
  selectedTenantId: string;
  onChange: (value: string) => void;
  isLoading: boolean;
}

const TenantSelector: React.FC<TenantSelectorProps> = ({
  activeTenants,
  selectedTenantId,
  onChange,
  isLoading,
}) => {
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");

  return (
    <Box mt={6} bg={cardBg} border="1px solid" borderColor={borderColor} rounded="xl" px={6} py={4}>
      <FormControl maxW="360px">
        <FormLabel fontSize="sm" fontWeight="semibold">
          Tenant (Superadmin)
        </FormLabel>
        <Select
          placeholder={isLoading ? "Cargando tenants..." : "Selecciona un tenant"}
          value={selectedTenantId}
          onChange={(event) => onChange(event.target.value)}
          isDisabled={isLoading}
        >
          {activeTenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.name}
            </option>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
};

// ============================================================================
// HEADER CON NOTIFICACIONES
// ============================================================================

interface HeaderProps {
  notifications: NotificationItem[];
}

const Header: React.FC<HeaderProps> = ({ notifications }) => {
  const unreadCount = notifications.filter((n) => n.unread).length;
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");

  return (
    <Box bg={cardBg} border="1px solid" borderColor={borderColor} rounded="xl" px={6} py={4}>
      <Flex align="center" justify="space-between">
        <HStack spacing={3}>
          <Box color="blue.600">
            <FileText size={28} />
          </Box>
          <Heading size="md">Gestión de Contratos</Heading>
        </HStack>
        <Menu>
          <MenuButton as={IconButton} aria-label="Notificaciones" variant="ghost">
            <Box position="relative">
              <Bell size={20} />
              {unreadCount > 0 && (
                <Badge
                  position="absolute"
                  top="-6px"
                  right="-8px"
                  colorScheme="red"
                  rounded="full"
                  fontSize="xs"
                  px={2}
                >
                  {unreadCount}
                </Badge>
              )}
            </Box>
          </MenuButton>
          <MenuList maxW="360px">
            <Box px={3} py={2} borderBottom="1px solid" borderColor={borderColor}>
              <Text fontWeight="semibold">Notificaciones</Text>
            </Box>
            {notifications.length === 0 && (
              <Box px={3} py={3}>
                <Text fontSize="sm" color="gray.500">
                  Sin notificaciones
                </Text>
              </Box>
            )}
            {notifications.map((notif) => (
              <MenuItem key={notif.id} alignItems="flex-start">
                <HStack align="start" spacing={3} w="full">
                  <Box
                    w={2}
                    h={2}
                    mt={2}
                    rounded="full"
                    bg={notif.unread ? "blue.500" : "gray.300"}
                  />
                  <Box flex="1">
                    <Text fontSize="sm" color="gray.800">
                      {notif.message}
                    </Text>
                    {notif.from && (
                      <Text fontSize="xs" color="gray.500" mt={1}>
                        De: {notif.from}
                      </Text>
                    )}
                    {notif.reference && (
                      <Text fontSize="xs" color="gray.500" mt={1}>
                        {notif.reference}
                      </Text>
                    )}
                    <Text fontSize="xs" color="gray.400" mt={1}>
                      hace {notif.time}
                    </Text>
                  </Box>
                </HStack>
              </MenuItem>
            ))}
          </MenuList>
        </Menu>
      </Flex>
    </Box>
  );
};

// ============================================================================
// DASHBOARD
// ============================================================================

interface DashboardProps {
  onNavigate: (view: ViewState) => void;
  contracts: Contract[];
  latestContracts: Contract[];
  onSelectContract: (contract: Contract, view: ViewState) => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  onNavigate,
  contracts,
  latestContracts,
  onSelectContract,
}) => {
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");

  const pendingCount = contracts.filter((contract) =>
    ["DRAFT", "PENDING_SUPPLIER", "PENDING_JEFE_OBRA", "PENDING_GERENCIA", "PENDING_ADMIN", "PENDING_COMPRAS", "PENDING_JURIDICO"].includes(contract.status),
  ).length;
  const activeCount = contracts.filter((contract) => contract.status !== "REJECTED").length;
  const subCount = contracts.filter((contract) => contract.type === "SUBCONTRATACION").length;
  const sumCount = contracts.filter((contract) => contract.type === "SUMINISTRO").length;

  return (
    <Stack spacing={6}>
      <Flex align="center" justify="space-between">
        <Heading size="lg">Dashboard de Contratos</Heading>
        <HStack spacing={3}>
          <Button colorScheme="blue" leftIcon={<Upload size={16} />} onClick={() => onNavigate("comparativo-upload")}>
            Importar Ofertas (OCR)
          </Button>
          <Button colorScheme="green" leftIcon={<Plus size={16} />} onClick={() => onNavigate("comparativo-manual")}>
            Nuevo Comparativo Manual
          </Button>
        </HStack>
      </Flex>

      <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={5}>
        <StatCard title="Pendientes de acción" value={`${pendingCount}`} color="yellow" icon={<AlertCircle size={20} />} />
        <StatCard title="Contratos activos" value={`${activeCount}`} color="blue" icon={<FileText size={20} />} />
        <StatCard title="Subcontratación" value={`${subCount}`} color="green" icon={<Users size={20} />} />
        <StatCard title="Suministro" value={`${sumCount}`} color="purple" icon={<Truck size={20} />} />
      </SimpleGrid>

      <Box bg={cardBg} border="1px solid" borderColor={borderColor} rounded="xl">
        <Box px={6} py={4} borderBottom="1px solid" borderColor={borderColor}>
          <Text fontWeight="semibold">Últimos Movimientos</Text>
        </Box>
        <Stack spacing={0}>
          {latestContracts.length === 0 && (
            <Box px={6} py={4}>
              <Text fontSize="sm" color="gray.500">
                No hay contratos todavía.
              </Text>
            </Box>
          )}
          {latestContracts.map((contract) => (
            <ActivityItem
              key={contract.id}
              status={mapActivityStatus(contract.status)}
              title={`CT-${contract.id}`}
              description={formatContractStatus(contract.status)}
              time={formatDate(contract.updated_at)}
              onClick={() => onSelectContract(contract, "comparativo-review")}
            />
          ))}
        </Stack>
      </Box>
    </Stack>
  );
};

interface StatCardProps {
  title: string;
  value: string;
  color: "yellow" | "blue" | "green" | "purple";
  icon: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, color, icon }) => {
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");
  const colors = {
    yellow: { bg: "yellow.100", text: "yellow.700" },
    blue: { bg: "blue.100", text: "blue.700" },
    green: { bg: "green.100", text: "green.700" },
    purple: { bg: "purple.100", text: "purple.700" },
  };

  return (
    <Box bg={cardBg} border="1px solid" borderColor={borderColor} rounded="xl" p={5}>
      <Flex align="center" justify="space-between">
        <Box>
          <Text fontSize="sm" color="gray.500">
            {title}
          </Text>
          <Text fontSize="2xl" fontWeight="bold" mt={2}>
            {value}
          </Text>
        </Box>
        <Box bg={colors[color].bg} color={colors[color].text} p={3} rounded="lg">
          {icon}
        </Box>
      </Flex>
    </Box>
  );
};

interface ActivityItemProps {
  status: "approved" | "created" | "pending";
  title: string;
  description: string;
  time: string;
  onClick?: () => void;
}

const ActivityItem: React.FC<ActivityItemProps> = ({ status, title, description, time, onClick }) => {
  const iconMap = {
    approved: <Check size={18} color="#16a34a" />,
    created: <FileText size={18} color="#2563eb" />,
    pending: <AlertCircle size={18} color="#d97706" />,
  };

  return (
    <Flex px={6} py={4} align="center" gap={4} cursor={onClick ? "pointer" : "default"} _hover={{ bg: "gray.50" }} onClick={onClick}>
      {iconMap[status]}
      <Box flex="1">
        <Text fontWeight="semibold">{title}</Text>
        <Text fontSize="sm" color="gray.500">
          {description}
        </Text>
      </Box>
      <Text fontSize="xs" color="gray.400">
        {time}
      </Text>
    </Flex>
  );
};

// ============================================================================
// COMPARATIVO UPLOAD (OCR)
// ============================================================================

interface ComparativoUploadProps {
  onNavigate: (view: ViewState) => void;
  onComplete: (data: ComparativoData) => void;
  onCreateContract: (
    payload: { type: ContractType; comparative_data?: Record<string, unknown> },
    files: File[],
  ) => Promise<void>;
}

const ComparativoUpload: React.FC<ComparativoUploadProps> = ({
  onNavigate,
  onComplete,
  onCreateContract,
}) => {
  const [contractType, setContractType] = useState<ContractType>("SUBCONTRATACION");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [files, setFiles] = useState<FileUploadState[]>([]);
  const toast = useToast();
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = Array.from(event.target.files ?? []);
    if (inputFiles.length === 0) return;

    const existingKeys = new Set(
      selectedFiles.map((file) => `${file.name}-${file.size}-${file.lastModified}`),
    );
    const newFiles = inputFiles.filter(
      (file) => !existingKeys.has(`${file.name}-${file.size}-${file.lastModified}`),
    );
    if (newFiles.length === 0) return;

    const nextSelected = [...selectedFiles, ...newFiles];
    const nextStates: FileUploadState[] = newFiles.map((file, index) => ({
      id: Date.now() + index,
      name: file.name,
      size: file.size,
      file,
      status: "processing",
      progress: 0,
    }));
    setSelectedFiles(nextSelected);
    setFiles((prev) => [...prev, ...nextStates]);
  };

  const handleRemoveFile = (fileId: number) => {
    setFiles((prev) => prev.filter((item) => item.id !== fileId));
    setSelectedFiles((prev) =>
      prev.filter(
        (file) =>
          !files.some(
            (state) =>
              state.id === fileId &&
              state.name === file.name &&
              state.size === file.size,
          ),
      ),
    );
  };

  const handleProcess = async () => {
    if (selectedFiles.length === 0) {
      toast({ status: "warning", title: "Sube al menos una oferta" });
      return;
    }
    setFiles((prev) =>
      prev.map((item) => ({
        ...item,
        status: "processing",
        progress: 0,
      })),
    );
    const comparativeData = {
      source: "ocr",
      offers: selectedFiles.map((file) => ({ file: file.name })),
    };
    try {
      await onCreateContract({ type: contractType, comparative_data: comparativeData }, selectedFiles);
      setFiles((prev) =>
        prev.map((item) => ({
          ...item,
          status: "completed",
          progress: 100,
        })),
      );
      onComplete({ type: "ocr", files });
    } catch (error) {
      setFiles((prev) =>
        prev.map((item) => ({
          ...item,
          status: "warning",
          progress: 100,
        })),
      );
      toast({ status: "error", title: "Error subiendo las ofertas" });
    }
  };

  return (
    <Box bg={cardBg} border="1px solid" borderColor={borderColor} rounded="xl" overflow="hidden">
      <Box px={6} py={5} borderBottom="1px solid" borderColor={borderColor}>
        <Heading size="md">Nuevo Comparativo - Upload Automático</Heading>
      </Box>
      <Stack spacing={6} p={6}>
        <Box>
          <Text fontSize="sm" fontWeight="semibold" mb={2}>
            Obra
          </Text>
          <Input placeholder="1234 - Proyecto Automate" />
        </Box>
        <Box>
          <Text fontSize="sm" fontWeight="semibold" mb={2}>
            Tipo de contrato
          </Text>
          <Box
            as="select"
            value={contractType}
            onChange={(event) => setContractType(event.target.value as ContractType)}
            border="1px solid"
            borderColor={borderColor}
            rounded="md"
            px={3}
            py={2}
          >
            <Box as="option" value="SUBCONTRATACION">
              SUBCONTRATACIÓN
            </Box>
            <Box as="option" value="SUMINISTRO">
              SUMINISTRO
            </Box>
            <Box as="option" value="SERVICIO">
              SERVICIO
            </Box>
          </Box>
        </Box>

        <Box border="2px dashed" borderColor={borderColor} rounded="lg" p={10} textAlign="center">
          <Stack spacing={3} align="center">
            <Upload size={32} color="#94a3b8" />
            <Text fontWeight="semibold">Arrastra archivos o haz clic para subir</Text>
            <Text fontSize="sm" color="gray.500">
              Formatos: PDF, JPG, PNG · Máximo: 10 archivos, 5MB c/u
            </Text>
            <Text fontSize="sm" color="gray.500">
              Puedes subir varios archivos del mismo comparativo.
            </Text>
            <Input type="file" multiple accept=".pdf,.png,.jpg,.jpeg" onChange={handleFileSelect} />
          </Stack>
        </Box>

        <Box>
          <Text fontSize="sm" fontWeight="semibold" mb={3}>
            Archivos subidos
          </Text>
          <Stack spacing={3}>
            {files.map((file) => (
              <FileUploadItem key={file.id} file={file} onRemove={() => handleRemoveFile(file.id)} />
            ))}
          </Stack>
        </Box>
      </Stack>

      <Flex px={6} py={4} borderTop="1px solid" borderColor={borderColor} justify="space-between" bg={useColorModeValue("gray.50", "gray.900")}>
        <Button variant="ghost" onClick={() => onNavigate("dashboard")}>
          Cancelar
        </Button>
        <HStack spacing={3}>
          <Button colorScheme="blue" variant="outline" onClick={handleProcess}>
            Procesar Todo
          </Button>
          <Button colorScheme="green" onClick={handleProcess}>
            Siguiente
          </Button>
        </HStack>
      </Flex>
    </Box>
  );
};

interface FileUploadItemProps {
  file: FileUploadState;
  onRemove?: () => void;
}

const FileUploadItem: React.FC<FileUploadItemProps> = ({ file, onRemove }) => {
  const statusConfig = {
    processing: { color: "blue", label: "Procesando OCR...", icon: <Clock size={14} /> },
    completed: { color: "green", label: "Extraído", icon: <Check size={14} /> },
    warning: { color: "yellow", label: "Revisar", icon: <AlertCircle size={14} /> },
  };
  const config = statusConfig[file.status];
  const cardBg = useColorModeValue("gray.50", "gray.900");
  const borderColor = useColorModeValue("gray.200", "gray.700");

  return (
    <Flex align="center" gap={4} p={4} bg={cardBg} border="1px solid" borderColor={borderColor} rounded="lg">
      <FileText size={20} color="#94a3b8" />
      <Box flex="1">
        <Text fontWeight="medium">{file.name}</Text>
        {file.status === "processing" && (
          <Box mt={2} h="6px" bg="gray.200" rounded="full" overflow="hidden">
            <Box h="6px" bg="blue.500" width={`${file.progress}%`} />
          </Box>
        )}
        {file.size && (
          <Text fontSize="xs" color="gray.500" mt={1}>
            {(file.size / (1024 * 1024)).toFixed(2)} MB
          </Text>
        )}
      </Box>
      <Badge colorScheme={config.color} display="inline-flex" alignItems="center" gap={2} px={3} py={1} rounded="full">
        {config.icon}
        {config.label}
      </Badge>
      {file.status !== "processing" && (
        <Button variant="link" colorScheme="blue" size="sm">
          {file.status === "completed" ? "Ver datos" : "Editar"}
        </Button>
      )}
      {onRemove && (
        <IconButton
          aria-label="Eliminar archivo"
          icon={<Trash2 size={16} />}
          size="sm"
          variant="ghost"
          onClick={onRemove}
        />
      )}
    </Flex>
  );
};

// ============================================================================
// COMPARATIVO MANUAL
// ============================================================================

interface ComparativoManualProps {
  onNavigate: (view: ViewState) => void;
  onComplete: (data: ComparativoData) => void;
  onCreateContract: (payload: {
    type: ContractType;
    comparative_data?: Record<string, unknown>;
  }) => Promise<void>;
}

const ComparativoManual: React.FC<ComparativoManualProps> = ({
  onNavigate,
  onComplete,
  onCreateContract,
}) => {
  const [contractType, setContractType] = useState<ContractType>("SUBCONTRATACION");
  const [obra, setObra] = useState("1234 - Proyecto Automate");
  const [jefeObra, setJefeObra] = useState("perico perez");
  const [fechaSolicitud, setFechaSolicitud] = useState("2026-02-09");
  const [ofertas, setOfertas] = useState<OfertaItem[]>([
    { id: 1, proveedor: "ACYF", importe: "12365.87", plazo: "90", observaciones: "" },
    { id: 2, proveedor: "DAYSA", importe: "11850.00", plazo: "60", observaciones: "" },
  ]);
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");

  const addOferta = () => {
    setOfertas([
      ...ofertas,
      { id: Date.now(), proveedor: "", importe: "", plazo: "", observaciones: "" },
    ]);
  };

  const removeOferta = (id: number) => {
    setOfertas(ofertas.filter((o) => o.id !== id));
  };
  const updateOferta = (id: number, field: keyof OfertaItem, value: string) => {
    setOfertas((prev) =>
      prev.map((oferta) => (oferta.id === id ? { ...oferta, [field]: value } : oferta)),
    );
  };

  const handleGenerate = () => {
    const comparativeData = {
      source: "manual",
      obra,
      jefe_obra: jefeObra,
      fecha_solicitud: fechaSolicitud,
      offers: ofertas.map((oferta) => ({
        supplier_name: oferta.proveedor,
        total_amount: oferta.importe,
        plazo: oferta.plazo,
        notes: oferta.observaciones,
      })),
    };
    onComplete({ type: "manual", ofertas });
    onCreateContract({ type: contractType, comparative_data: comparativeData }).catch(() => undefined);
  };

  return (
    <Box bg={cardBg} border="1px solid" borderColor={borderColor} rounded="xl" overflow="hidden">
      <Box px={6} py={5} borderBottom="1px solid" borderColor={borderColor}>
        <Heading size="md">Nuevo Comparativo - Entrada Manual</Heading>
      </Box>
      <Stack spacing={6} p={6}>
        <Box>
          <Text fontWeight="semibold" mb={3}>
            Información General
          </Text>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <Box>
              <Text fontSize="sm" fontWeight="medium" mb={2}>
                Obra
              </Text>
              <Input value={obra} onChange={(event) => setObra(event.target.value)} />
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="medium" mb={2}>
                Jefe de Obra
              </Text>
              <Input value={jefeObra} onChange={(event) => setJefeObra(event.target.value)} />
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="medium" mb={2}>
                Fecha Solicitud
              </Text>
              <Input type="date" value={fechaSolicitud} onChange={(event) => setFechaSolicitud(event.target.value)} />
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="medium" mb={2}>
                Categoría
              </Text>
              <Box
                as="select"
                value={contractType}
                onChange={(event) => setContractType(event.target.value as ContractType)}
                border="1px solid"
                borderColor={borderColor}
                rounded="md"
                px={3}
                py={2}
              >
                <Box as="option" value="SUBCONTRATACION">
                  SUBCONTRATACIÓN
                </Box>
                <Box as="option" value="SUMINISTRO">
                  SUMINISTRO
                </Box>
                <Box as="option" value="SERVICIO">
                  SERVICIO
                </Box>
              </Box>
            </Box>
          </SimpleGrid>
        </Box>

        <Box>
          <Text fontWeight="semibold" mb={3}>
            Ofertas a Comparar
          </Text>
          <Stack spacing={4}>
            {ofertas.map((oferta, index) => (
              <OfertaFormItem
                key={oferta.id}
                oferta={oferta}
                index={index}
                onRemove={() => removeOferta(oferta.id)}
                onChange={(field, value) => updateOferta(oferta.id, field, value)}
              />
            ))}
            <Button variant="ghost" colorScheme="blue" leftIcon={<Plus size={16} />} onClick={addOferta}>
              Añadir Oferta
            </Button>
          </Stack>
        </Box>
      </Stack>
      <Flex px={6} py={4} borderTop="1px solid" borderColor={borderColor} justify="space-between" bg={useColorModeValue("gray.50", "gray.900")}>
        <Button variant="ghost" onClick={() => onNavigate("dashboard")}>
          Cancelar
        </Button>
        <HStack spacing={3}>
          <Button colorScheme="gray" variant="outline">
            Guardar Borrador
          </Button>
          <Button colorScheme="green" onClick={handleGenerate}>
            Generar Comparativo
          </Button>
        </HStack>
      </Flex>
    </Box>
  );
};

interface OfertaFormItemProps {
  oferta: OfertaItem;
  index: number;
  onRemove: () => void;
  onChange: (field: keyof OfertaItem, value: string) => void;
}

const OfertaFormItem: React.FC<OfertaFormItemProps> = ({
  oferta,
  index,
  onRemove,
  onChange,
}) => {
  const cardBg = useColorModeValue("gray.50", "gray.900");
  const borderColor = useColorModeValue("gray.200", "gray.700");

  return (
    <Box p={4} bg={cardBg} border="1px solid" borderColor={borderColor} rounded="lg">
      <Flex align="center" justify="space-between" mb={3}>
        <Text fontWeight="semibold">Oferta #{index + 1}</Text>
        <IconButton aria-label="Eliminar" size="sm" variant="ghost" icon={<Trash2 size={16} />} onClick={onRemove} />
      </Flex>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
        <Box>
          <Text fontSize="sm" mb={1}>
            Proveedor
          </Text>
          <Input
            value={oferta.proveedor}
            onChange={(event) => onChange("proveedor", event.target.value)}
            placeholder="Buscar proveedor..."
          />
        </Box>
        <Box>
          <Text fontSize="sm" mb={1}>
            Importe (€)
          </Text>
          <Input
            value={oferta.importe}
            onChange={(event) => onChange("importe", event.target.value)}
          />
        </Box>
        <Box>
          <Text fontSize="sm" mb={1}>
            Plazo (días)
          </Text>
          <Input
            type="number"
            value={oferta.plazo}
            onChange={(event) => onChange("plazo", event.target.value)}
          />
        </Box>
        <Box>
          <Text fontSize="sm" mb={1}>
            Adjuntar PDF
          </Text>
          <Button variant="outline" width="full" leftIcon={<Upload size={16} />}>
            Seleccionar archivo
          </Button>
        </Box>
      </SimpleGrid>
      <Box mt={3}>
        <Text fontSize="sm" mb={1}>
          Observaciones
        </Text>
        <Textarea
          value={oferta.observaciones}
          onChange={(event) => onChange("observaciones", event.target.value)}
          rows={2}
        />
      </Box>
    </Box>
  );
};

// ============================================================================
// COMPARATIVO REVIEW
// ============================================================================

interface ComparativoReviewProps {
  data: ComparativoData | null;
  contract: Contract | null;
  onNavigate: (view: ViewState) => void;
  onSelectOffer: (offerId: number) => void;
  onSubmitComparative: () => void;
}

const ComparativoReview: React.FC<ComparativoReviewProps> = ({
  contract,
  onNavigate,
  onSelectOffer,
  onSubmitComparative,
}) => {
  const offers = (contract?.comparative_data as any)?.offers ?? [];
  const selectedOfferId = (contract?.comparative_data as any)?.selected_offer_id ?? contract?.selected_offer_id ?? null;
  const [selectedProvider, setSelectedProvider] = useState(
    selectedOfferId ? String(selectedOfferId) : "",
  );
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");

  const providers = offers.map((offer: any) => ({
    id: offer.id,
    name: offer.supplier_name || offer.supplier_tax_id || offer.file || "Oferta",
    importe: offer.total_amount ? formatCurrency(offer.total_amount) : "Pendiente",
    plazo: offer.plazo || "Pendiente",
    garantia: offer.garantia || "Pendiente",
    pago: offer.pago || "Pendiente",
    rating: offer.rating ?? null,
    warning: Array.isArray(offer.pending_fields) && offer.pending_fields.length > 0,
  }));
  const bestPriceProvider = providers
    .filter((provider) => provider.importe !== "Pendiente")
    .sort((a, b) => parseAmount(a.importe) - parseAmount(b.importe))[0];

  useEffect(() => {
    if (selectedOfferId) {
      setSelectedProvider(String(selectedOfferId));
    }
  }, [selectedOfferId]);

  if (!contract) {
    return (
      <Alert status="info" borderRadius="md">
        <AlertIcon />
        Selecciona un contrato para ver el comparativo.
      </Alert>
    );
  }

  return (
    <Box bg={cardBg} border="1px solid" borderColor={borderColor} rounded="xl" overflow="hidden">
      <Box px={6} py={5} borderBottom="1px solid" borderColor={borderColor}>
        <Flex align="center" justify="space-between">
          <Box>
            <Heading size="md">Comparativo de Ofertas</Heading>
            <Text fontSize="sm" color="gray.500" mt={1}>
              {contract ? `Contrato #CT-${contract.id}` : "Comparativo sin contrato"}
            </Text>
          </Box>
          <Badge colorScheme="yellow" rounded="full" px={3} py={1}>
            {contract ? formatComparativeStatus(contract.comparative_status) : "Borrador"}
          </Badge>
        </Flex>
      </Box>

      <Stack spacing={6} p={6}>
        <Flex align="center" gap={3} p={4} bg="yellow.50" border="1px solid" borderColor="yellow.200" rounded="lg">
          <AlertCircle size={18} color="#d97706" />
          <Text fontSize="sm" color="yellow.800">
            Campos pendientes de revisión: 3
          </Text>
        </Flex>

        <Box overflowX="auto">
          <Table size="sm">
            <Thead>
              <Tr bg="gray.50">
                <Th>Concepto</Th>
                {providers.map((provider) => (
                  <Th key={provider.id} textAlign="center">
                    {provider.name}
                  </Th>
                ))}
                <Th>Observaciones</Th>
              </Tr>
            </Thead>
            <Tbody>
              <Tr>
                <Td fontWeight="semibold">Importe</Td>
                {providers.map((provider) => (
                  <Td key={provider.id} textAlign="center">
                    <Stack spacing={1} align="center">
                      <Text fontWeight="semibold" color={provider.warning ? "yellow.600" : "gray.800"}>
                        {provider.importe}
                      </Text>
                      {provider.warning && (
                        <Button variant="link" size="xs" colorScheme="yellow">
                          revisar
                        </Button>
                      )}
                    </Stack>
                  </Td>
                ))}
                <Td fontSize="sm" color="gray.500">
                  Mejor precio: {bestPriceProvider?.name ?? "Pendiente"}
                </Td>
              </Tr>
              <Tr>
                <Td fontWeight="semibold">Plazo</Td>
                {providers.map((provider) => (
                  <Td key={provider.id} textAlign="center" color={provider.warning ? "yellow.600" : "gray.800"}>
                    {provider.plazo === "Pendiente" ? "Pendiente" : `${provider.plazo} días`}
                  </Td>
                ))}
                <Td fontSize="sm" color="gray.500">
                  Más rápido: Pendiente
                </Td>
              </Tr>
              <Tr>
                <Td fontWeight="semibold">Garantía</Td>
                {providers.map((provider) => (
                  <Td key={provider.id} textAlign="center" color={provider.warning ? "yellow.600" : "gray.800"}>
                    {provider.garantia === "Pendiente" ? "[pendiente]" : `${provider.garantia} €`}
                  </Td>
                ))}
                <Td fontSize="sm" color="gray.500">
                  Todas igual
                </Td>
              </Tr>
              <Tr>
                <Td fontWeight="semibold">Forma Pago</Td>
                {providers.map((provider) => (
                  <Td key={provider.id} textAlign="center">
                    {provider.pago}
                  </Td>
                ))}
                <Td fontSize="sm" color="gray.500">
                  Todas igual
                </Td>
              </Tr>
              <Tr>
                <Td fontWeight="semibold">Valoración</Td>
                {providers.map((provider) => (
                  <Td key={provider.id} textAlign="center">
                    <Text fontWeight="semibold" color={provider.rating === 9 ? "green.600" : "gray.800"}>
                      {provider.rating ? `${provider.rating}/10` : "—"}
                    </Text>
                  </Td>
                ))}
                <Td />
              </Tr>
            </Tbody>
          </Table>
        </Box>
        {providers.length === 0 && (
          <Text fontSize="sm" color="gray.500">
            No hay ofertas cargadas todavía.
          </Text>
        )}

        <Box p={4} bg="green.50" border="1px solid" borderColor="green.200" rounded="lg">
          <Text fontSize="sm" fontWeight="semibold" color="green.800">
            Recomendación del Sistema: {bestPriceProvider?.name ?? "Pendiente"}
          </Text>
        </Box>

        <Box>
          <Text fontSize="sm" fontWeight="semibold" mb={2}>
            Oferta Seleccionada
          </Text>
          <RadioGroup
            value={selectedProvider}
            onChange={(value) => {
              setSelectedProvider(value);
              const numeric = Number(value);
              if (!Number.isNaN(numeric)) onSelectOffer(numeric);
            }}
          >
            <HStack spacing={6}>
              {providers.map((provider) => (
                <Radio key={provider.id} value={String(provider.id)}>
                  {provider.name}
                </Radio>
              ))}
            </HStack>
          </RadioGroup>
        </Box>

        <Box>
          <Text fontSize="sm" fontWeight="semibold" mb={2}>
            Justificación
          </Text>
          <Textarea defaultValue="Mayor puntuación en relación calidad-precio y plazo más ajustado a las necesidades del proyecto." rows={3} />
        </Box>

        <Box>
          <Text fontSize="sm" fontWeight="semibold" mb={2}>
            Observaciones adicionales
          </Text>
          <Textarea placeholder="Comentarios del Jefe de Obra..." rows={4} />
        </Box>

        <Box p={4} bg="blue.50" border="1px solid" borderColor="blue.200" rounded="lg">
          <Text fontSize="sm" color="blue.800">
            <strong>Estado:</strong> {contract ? formatComparativeStatus(contract.comparative_status) : "Borrador"}
            <br />
            <strong>Próximo paso:</strong> Enviar a Gerencia para aprobación
          </Text>
        </Box>
      </Stack>

      <Flex px={6} py={4} borderTop="1px solid" borderColor={borderColor} justify="space-between" bg={useColorModeValue("gray.50", "gray.900")}>
        <Button variant="ghost" onClick={() => onNavigate("dashboard")}>
          Cancelar
        </Button>
        <HStack spacing={3}>
          <Button leftIcon={<Download size={16} />} variant="outline" colorScheme="blue">
            Exportar PDF
          </Button>
          <Button
            leftIcon={<Send size={16} />}
            colorScheme="green"
            onClick={() => {
              onSubmitComparative();
              onNavigate("contrato-form");
            }}
          >
            Enviar a Aprobación
          </Button>
        </HStack>
      </Flex>
    </Box>
  );
};

// ============================================================================
// FORMULARIO DE CONTRATO
// ============================================================================

interface ContratoFormProps {
  comparativoData: ComparativoData | null;
  contract: Contract | null;
  onNavigate: (view: ViewState) => void;
  onSave: (payload: ContractUpdatePayload) => void;
  onSubmit: () => void;
}

const ContratoForm: React.FC<ContratoFormProps> = ({
  contract,
  onNavigate,
  onSave,
  onSubmit,
}) => {
  const [tipoContrato, setTipoContrato] = useState(contract?.type ?? "SUBCONTRATACION");
  const [title, setTitle] = useState(contract?.title ?? "");
  const [description, setDescription] = useState(contract?.description ?? "");
  const [supplierName, setSupplierName] = useState(contract?.supplier_name ?? "");
  const [supplierTaxId, setSupplierTaxId] = useState(contract?.supplier_tax_id ?? "");
  const [supplierEmail, setSupplierEmail] = useState(contract?.supplier_email ?? "");
  const [supplierPhone, setSupplierPhone] = useState(contract?.supplier_phone ?? "");
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");

  return (
    <Box bg={cardBg} border="1px solid" borderColor={borderColor} rounded="xl" overflow="hidden">
      <Box px={6} py={5} borderBottom="1px solid" borderColor={borderColor}>
        <Heading size="md">Contrato - {formatContractType(tipoContrato)}</Heading>
        <Text fontSize="sm" color="gray.500" mt={1}>
          {contract ? `Contrato #CT-${contract.id}` : "Contrato sin comparativo"}
        </Text>
      </Box>

      <Stack spacing={8} p={6}>
        <Section icon={<FileText size={18} />} title="SECCIÓN 1: Información General">
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <InputField
              label="ID Contrato"
              defaultValue={contract ? `CT-${contract.id}` : "Auto-generado"}
              disabled
              helper="Generado automáticamente"
            />
            <SelectField label="Tipo Documento" options={["CONTRATO"]} />
            <SelectField
              label="Tipo Contrato"
              options={["SUBCONTRATACIÓN", "SUMINISTRO", "SERVICIO"]}
              value={formatContractType(tipoContrato)}
              onChange={(e) =>
                setTipoContrato(
                  (e.target.value as string).replace("SUBCONTRATACIÓN", "SUBCONTRATACION") as ContractType,
                )
              }
            />
            <InputField label="Título" defaultValue={title} onChange={setTitle} />
            <InputField label="Descripción" defaultValue={description} onChange={setDescription} />
          </SimpleGrid>
        </Section>

        <Section icon={<Users size={18} />} title="SECCIÓN 2: Datos del Proveedor">
          <Box p={4} bg="blue.50" border="1px solid" borderColor="blue.200" rounded="lg" mb={4}>
            <Text fontSize="sm" color="blue.800">
              Datos precargados desde BD de Proveedores
            </Text>
          </Box>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <InputField label="Empresa" defaultValue={supplierName} onChange={setSupplierName} />
            <InputField label="CIF" defaultValue={supplierTaxId} onChange={setSupplierTaxId} />
            <InputField label="Razón Social" defaultValue={supplierName} onChange={setSupplierName} fullWidth />
            <Box gridColumn={{ base: "span 1", md: "span 2" }}>
              <Divider />
            </Box>
            <InputField label="Nombre Contacto" defaultValue={contract?.supplier_contact_name ?? ""} disabled />
            <InputField label="Teléfono" defaultValue={supplierPhone} onChange={setSupplierPhone} />
            <InputField label="Email" defaultValue={supplierEmail} onChange={setSupplierEmail} fullWidth />
          </SimpleGrid>
          <Button variant="link" colorScheme="blue" mt={3}>
            Editar datos del proveedor
          </Button>
        </Section>

        <Section icon={<span>💰</span>} title="SECCIÓN 3: Condiciones Económicas">
          <Stack spacing={4}>
            <Box>
              <Text fontSize="sm" fontWeight="semibold" mb={2}>
                Tipo Precio
              </Text>
              <RadioGroup defaultValue="CERRADO">
                <HStack spacing={6}>
                  <Radio value="CERRADO">CERRADO</Radio>
                  <Radio value="UNITARIO">UNITARIO</Radio>
                  <Radio value="PORCENTAJE">PORCENTAJE</Radio>
                </HStack>
              </RadioGroup>
            </Box>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <InputField label="Precio (numérico)" defaultValue="11.850,00" suffix="€" />
              <InputField label="Precio (letras)" defaultValue="ONCE MIL OCHOCIENTOS CINCUENTA EUROS..." />
              <SelectField label="Forma de Pago" options={["CONFIRMING 60", "TRANSFERENCIA", "PAGARÉ"]} defaultValue="CONFIRMING 60" />
              <InputField label="Seguro" defaultValue="100.000,00" suffix="€" />
            </SimpleGrid>
            <Box>
              <Text fontSize="sm" fontWeight="semibold" mb={2}>
                Retención
              </Text>
              <RadioGroup defaultValue="NO">
                <HStack spacing={6}>
                  <Radio value="SI">SÍ</Radio>
                  <Radio value="NO">NO</Radio>
                </HStack>
              </RadioGroup>
            </Box>
          </Stack>
        </Section>

        <Section icon={<span>📅</span>} title="SECCIÓN 4: Plazos">
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
            <InputField label="Fecha Petición" type="date" defaultValue="2026-02-09" />
            <InputField label="Fecha Inicio" type="date" defaultValue="2026-02-20" />
            <InputField label="Fecha Fin" type="date" defaultValue="2026-04-20" helper="Auto-calc: +60 días" />
          </SimpleGrid>
          <Text fontSize="sm" color="gray.600" mt={2}>
            Duración calculada: <strong>60 días</strong>
          </Text>
        </Section>

        {tipoContrato === "SUBCONTRATACIÓN" && (
          <Section icon={<Users size={18} />} title="SECCIÓN 5: Recursos">
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <InputField label="Número de Trabajadores" type="number" defaultValue="4" />
              <InputField label="En letras" defaultValue="CUATRO" />
            </SimpleGrid>
          </Section>
        )}

        {tipoContrato === "SUMINISTRO" && (
          <Section icon={<Truck size={18} />} title="SECCIÓN 6: Logística">
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <SelectField label="Portes" options={["A cargo proveedor", "A cargo cliente", "Compartidos"]} />
              <SelectField label="Descargas" options={["Incluidas", "No incluidas"]} />
            </SimpleGrid>
          </Section>
        )}

        {tipoContrato === "SERVICIO" && (
          <Section icon={<Wrench size={18} />} title="SECCIÓN 7: Detalles del Servicio">
            <SelectField label="Categoría de Servicio" options={["Patrimonio", "Consultoría", "Mantenimiento", "Otro"]} />
          </Section>
        )}

        <Section icon={<span>📌</span>} title="SECCIÓN 8: Información Adicional">
          <Stack spacing={4}>
            <Box>
              <Text fontSize="sm" fontWeight="semibold" mb={2}>
                Hitos/Fases
              </Text>
              <Textarea rows={3} placeholder="Definir hitos del contrato..." />
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="semibold" mb={2}>
                Observaciones
              </Text>
              <Textarea rows={4} placeholder="Observaciones generales..." />
            </Box>
          </Stack>
        </Section>

        <Box p={4} bg="blue.50" border="1px solid" borderColor="blue.200" rounded="lg">
          <Text fontSize="sm" color="blue.800">
            <strong>Estado actual:</strong>{" "}
            {contract ? formatContractStatus(contract.status) : "Borrador"}
          </Text>
        </Box>
      </Stack>

      <Flex px={6} py={4} borderTop="1px solid" borderColor={borderColor} justify="space-between" bg={useColorModeValue("gray.50", "gray.900")}>
        <Button variant="ghost" onClick={() => onNavigate("comparativo-review")}>
          Volver
        </Button>
        <HStack spacing={3}>
          <Button
            leftIcon={<Eye size={16} />}
            variant="outline"
            colorScheme="blue"
            onClick={() =>
              onSave({
                title,
                description,
                type: tipoContrato,
                supplier_name: supplierName,
                supplier_tax_id: supplierTaxId,
                supplier_email: supplierEmail,
                supplier_phone: supplierPhone,
              })
            }
          >
            Guardar borrador
          </Button>
          <Button leftIcon={<Send size={16} />} colorScheme="green" onClick={onSubmit}>
            Enviar a Gerencia
          </Button>
        </HStack>
      </Flex>
    </Box>
  );
};

// ============================================================================
// PANEL DE APROBACIONES
// ============================================================================

interface ApprovalPanelProps {
  onNavigate: (view: ViewState) => void;
  contract: Contract | null;
}

const ApprovalPanel: React.FC<ApprovalPanelProps> = ({ contract }) => {
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");

  if (!contract) {
    return (
      <Alert status="info" borderRadius="md">
        <AlertIcon />
        Selecciona un comparativo antes de crear el contrato.
      </Alert>
    );
  }

  return (
    <Stack spacing={6}>
      <Heading size="lg">Pendiente de tu Aprobación</Heading>

      {!contract && (
        <Alert status="info" borderRadius="md">
          <AlertIcon />
          No hay aprobaciones pendientes.
        </Alert>
      )}

      {contract && (
        <Box bg={cardBg} border="1px solid" borderColor={borderColor} rounded="xl" overflow="hidden">
          <Box px={6} py={4} bg="yellow.50" borderBottom="1px solid" borderColor={borderColor}>
            <HStack spacing={3}>
              <AlertCircle size={20} color="#d97706" />
              <Text fontWeight="bold">COMPARATIVO CT-{contract.id}</Text>
            </HStack>
          </Box>
          <Stack spacing={4} p={6}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} fontSize="sm">
              <Text>
                <strong>Estado:</strong> {formatComparativeStatus(contract.comparative_status)}
              </Text>
              <Text>
                <strong>Tipo:</strong> {formatContractType(contract.type)}
              </Text>
              <Text>
                <strong>Contrato:</strong> CT-{contract.id}
              </Text>
              <Text>
                <strong>Última actualización:</strong> {formatDate(contract.updated_at)}
              </Text>
            </SimpleGrid>

            <Divider />

            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} fontSize="sm">
              <Text>
                <strong>Proveedor:</strong> {contract.supplier_name ?? "Pendiente"}
              </Text>
              <Text>
                <strong>Importe:</strong>{" "}
                {contract.total_amount ? formatCurrency(contract.total_amount) : "Pendiente"}
              </Text>
              <Text>
                <strong>Plazo:</strong> Pendiente
              </Text>
            </SimpleGrid>

            <Divider />

            <Box>
              <Text fontSize="sm" color="gray.500" mb={2}>
                Observaciones
              </Text>
              <Text fontStyle="italic">
                {contract.description ?? "Sin observaciones registradas."}
              </Text>
            </Box>

            <HStack spacing={3}>
              <Button leftIcon={<Eye size={16} />} colorScheme="blue" variant="outline">
                Ver Comparativo Completo
              </Button>
              <Button leftIcon={<Download size={16} />} colorScheme="gray" variant="outline">
                Documentos Adjuntos
              </Button>
            </HStack>

            <Divider />

            <Box>
              <Text fontSize="sm" fontWeight="semibold" mb={2}>
                Tu decisión
              </Text>
              <Textarea rows={3} placeholder="Comentarios (opcional)..." />
            </Box>

            <HStack spacing={3}>
              <Button leftIcon={<X size={16} />} colorScheme="red">
                Rechazar
              </Button>
              <Button leftIcon={<AlertCircle size={16} />} colorScheme="yellow">
                Solicitar Cambios
              </Button>
              <Button leftIcon={<Check size={16} />} colorScheme="green">
                Aprobar
              </Button>
            </HStack>
          </Stack>
        </Box>
      )}

      <Box bg={cardBg} border="1px solid" borderColor={borderColor} rounded="xl" overflow="hidden">
        <Box px={6} py={4} borderBottom="1px solid" borderColor={borderColor}>
          <Text fontWeight="bold">Historial del Contrato CT-1234-DAYSA</Text>
        </Box>
        <Box p={6}>
          <Timeline />
        </Box>
      </Box>
    </Stack>
  );
};

const Timeline: React.FC = () => {
  const events = [
    {
      status: "completed",
      title: "CREADO",
      user: "perico perez",
      role: "Jefe de Obra",
      date: "09/02/2026 10:30",
      comment: "Comparativo base: CM-2026-001",
    },
    {
      status: "completed",
      title: "ENVIADO A APROBACIÓN",
      user: "perico perez",
      role: "Jefe de Obra",
      date: "09/02/2026 11:45",
      comment: "Notificados: Gerencia, Admin, Compras, Jurídico (4)",
    },
    {
      status: "completed",
      title: "APROBADO POR GERENCIA",
      user: "fernando fernandez",
      role: "Gerencia",
      date: "09/02/2026 14:20",
      comment: 'Comentario: "Ok, proceder"',
    },
    {
      status: "completed",
      title: "APROBADO POR ADMINISTRACIÓN",
      user: "ana martinez",
      role: "Admin",
      date: "09/02/2026 15:10",
      comment: "",
    },
    {
      status: "pending",
      title: "PENDIENTE APROBACIÓN COMPRAS",
      user: "juan lopez",
      role: "Compras",
      date: "",
      comment: "Plazo: 48h desde notificación",
    },
    {
      status: "pending",
      title: "PENDIENTE APROBACIÓN JURÍDICO",
      user: "lucia garcia",
      role: "Jurídico",
      date: "",
      comment: "Plazo: 72h desde notificación",
    },
  ];

  return (
    <Box position="relative">
      <Box position="absolute" left="20px" top="0" bottom="0" width="2px" bg="gray.200" />
      <Stack spacing={6}>
        {events.map((event, index) => (
          <HStack key={index} align="start" spacing={4}>
            <Box
              w="40px"
              h="40px"
              rounded="full"
              border="2px solid"
              borderColor={event.status === "completed" ? "green.500" : "yellow.500"}
              bg={event.status === "completed" ? "green.50" : "yellow.50"}
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              {event.status === "completed" ? (
                <Check size={18} color="#16a34a" />
              ) : (
                <Clock size={18} color="#d97706" />
              )}
            </Box>
            <Box flex="1" pb={4}>
              <Text fontWeight="semibold">{event.title}</Text>
              {event.date ? (
                <Text fontSize="sm" color="gray.500">
                  {event.date} | {event.user} ({event.role})
                </Text>
              ) : (
                <Text fontSize="sm" color="gray.500">
                  Notificado: {event.user} ({event.role})
                </Text>
              )}
              {event.comment && (
                <Text fontSize="sm" color="gray.500" fontStyle="italic">
                  {event.comment}
                </Text>
              )}
            </Box>
          </HStack>
        ))}
      </Stack>
    </Box>
  );
};

// ============================================================================
// COMPONENTES AUXILIARES
// ============================================================================

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ icon, title, children }) => {
  return (
    <Box borderTop="4px solid" borderColor="gray.200" pt={6}>
      <HStack spacing={3} mb={4}>
        <Box color="blue.600">{icon}</Box>
        <Text fontWeight="bold">{title}</Text>
      </HStack>
      {children}
    </Box>
  );
};

interface InputFieldProps {
  label: string;
  defaultValue?: string;
  disabled?: boolean;
  helper?: string;
  suffix?: string;
  type?: string;
  fullWidth?: boolean;
  onChange?: (value: string) => void;
}

const InputField: React.FC<InputFieldProps> = ({
  label,
  defaultValue,
  disabled,
  helper,
  suffix,
  type = "text",
  fullWidth,
  onChange,
}) => {
  return (
    <Box gridColumn={fullWidth ? { base: "span 1", md: "span 2" } : undefined}>
      <Text fontSize="sm" fontWeight="medium" mb={2}>
        {label}
      </Text>
      <Box position="relative">
        <Input
          type={type}
          defaultValue={defaultValue}
          isReadOnly={disabled}
          bg={disabled ? "gray.50" : undefined}
          pr={suffix ? 10 : undefined}
          onChange={(event) => onChange?.(event.target.value)}
        />
        {suffix && (
          <Text position="absolute" right={3} top="50%" transform="translateY(-50%)" fontSize="sm" color="gray.500">
            {suffix}
          </Text>
        )}
      </Box>
      {helper && (
        <Text fontSize="xs" color="gray.500" mt={1}>
          {helper}
        </Text>
      )}
    </Box>
  );
};

interface SelectFieldProps {
  label: string;
  options: string[];
  value?: string;
  defaultValue?: string;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}

const SelectField: React.FC<SelectFieldProps> = ({ label, options, value, defaultValue, onChange }) => {
  return (
    <Box>
      <Text fontSize="sm" fontWeight="medium" mb={2}>
        {label}
      </Text>
      <Box as="select" value={value} defaultValue={defaultValue} onChange={onChange} border="1px solid" borderColor="gray.200" rounded="md" px={3} py={2}>
        {options.map((option) => (
          <Box as="option" key={option} value={option}>
            {option}
          </Box>
        ))}
      </Box>
    </Box>
  );
};

// ============================================================================
// HELPERS
// ============================================================================

const formatContractStatus = (status?: string | null) => {
  switch (status) {
    case "DRAFT":
      return "Borrador";
    case "PENDING_SUPPLIER":
      return "Pendiente proveedor";
    case "PENDING_JEFE_OBRA":
      return "Pendiente Jefe de Obra";
    case "PENDING_GERENCIA":
      return "Pendiente Gerencia";
    case "PENDING_ADMIN":
      return "Pendiente Administración";
    case "PENDING_COMPRAS":
      return "Pendiente Compras";
    case "PENDING_JURIDICO":
      return "Pendiente Jurídico";
    case "IN_SIGNATURE":
      return "En firma";
    case "SIGNED":
      return "Firmado";
    case "REJECTED":
      return "Rechazado";
    default:
      return "Pendiente";
  }
};

const formatComparativeStatus = (status?: string | null) => {
  switch (status) {
    case "DRAFT":
      return "Borrador";
    case "PENDING_REVIEW":
      return "En revisión";
    case "APPROVED":
      return "Aprobado";
    case "REJECTED":
      return "Rechazado";
    default:
      return "Borrador";
  }
};

const formatContractType = (type?: string | null) => {
  switch (type) {
    case "SUBCONTRATACION":
      return "SUBCONTRATACIÓN";
    case "SUBCONTRATACIÓN":
      return "SUBCONTRATACIÓN";
    case "SUMINISTRO":
      return "SUMINISTRO";
    case "SERVICIO":
      return "SERVICIO";
    default:
      return "SUBCONTRATACIÓN";
  }
};

const mapActivityStatus = (status: string) => {
  if (status === "SIGNED" || status === "IN_SIGNATURE") return "approved";
  if (status === "DRAFT") return "created";
  return "pending";
};

const parseAmount = (value: string) => {
  const normalized = value.replace(/[€\\s.]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
};

const formatCurrency = (value: number | string) => {
  const numeric =
    typeof value === "string"
      ? Number(value.replace(".", "").replace(",", "."))
      : value;
  if (Number.isNaN(numeric)) return String(value);
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(numeric);
};

const formatDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

