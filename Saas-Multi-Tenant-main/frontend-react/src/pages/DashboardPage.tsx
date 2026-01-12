import React, { useState } from "react";
import {
  Box,
  Button,
  Heading,
  HStack,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  Text,
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { fetchTenantTools, launchTool, Tool } from "../api/tools";
import { fetchDashboardSummary, type DashboardSummary } from "../api/dashboard";
import { AppShell } from "../components/layout/AppShell";
import { ToolGrid } from "../components/tools/ToolGrid";
import type { CurrentUser } from "../api/users";

export const DashboardPage: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const [launchUrl, setLaunchUrl] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.500", "gray.300");
  const statAccent = useColorModeValue("brand.500", "brand.300");

  let tenantId = 1;
  let isSuperAdmin = false;
  try {
    const raw = localStorage.getItem("current_user");
    if (raw) {
      const me = JSON.parse(raw) as CurrentUser;
      if (me.tenant_id) {
        tenantId = me.tenant_id;
      }
      isSuperAdmin = Boolean(me.is_super_admin);
    }
  } catch {
    tenantId = 1;
    isSuperAdmin = false;
  }

  const { data: summary } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary"],
    queryFn: fetchDashboardSummary,
  });

  const { data: tools, isLoading } = useQuery<Tool[]>({
    queryKey: ["tenant-tools", tenantId],
    queryFn: () => fetchTenantTools(tenantId),
  });

  const handleLaunch = async (tool: Tool) => {
    try {
      if (tool.slug === "erp") {
        setLaunchUrl(null);
        setSelectedTool(null);
        navigate({ to: "/erp/projects" });
        return;
      }

      setSelectedTool(tool);
      const result = await launchTool(tool.id, tenantId);

      if (tool.slug === "moodle") {
        window.open(result.launch_url, "_blank", "noopener,noreferrer");
        return;
      }

      setLaunchUrl(result.launch_url);
    } catch (error: any) {
      const message =
        error?.response?.data?.detail ??
        "No se ha podido lanzar la herramienta (revisa permisos y configuración).";
      toast({
        title: "Error al lanzar herramienta",
        description: message,
        status: "error",
      });
    }
  };

  return (
    <AppShell>
      <Text mb={6} color={subtleText}>
        Resumen de tu organización y accesos rápidos a las herramientas clave.
      </Text>

      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={5} mb={8}>
        <Box
          borderWidth="1px"
          borderRadius="lg"
          bg={cardBg}
          p={4}
          borderLeftWidth="4px"
          borderLeftColor={statAccent}
        >
          <Stat>
            <StatLabel>Tenants activos</StatLabel>
            <StatNumber>{summary?.tenants_activos ?? "-"}</StatNumber>
          </Stat>
        </Box>
        <Box
          borderWidth="1px"
          borderRadius="lg"
          bg={cardBg}
          p={4}
          borderLeftWidth="4px"
          borderLeftColor={statAccent}
        >
          <Stat>
            <StatLabel>Usuarios activos</StatLabel>
            <StatNumber>{summary?.usuarios_activos ?? "-"}</StatNumber>
          </Stat>
        </Box>
        <Box
          borderWidth="1px"
          borderRadius="lg"
          bg={cardBg}
          p={4}
          borderLeftWidth="4px"
          borderLeftColor={statAccent}
        >
          <Stat>
            <StatLabel>Herramientas activas</StatLabel>
            <StatNumber>{summary?.herramientas_activas ?? "-"}</StatNumber>
          </Stat>
        </Box>
        <Box
          borderWidth="1px"
          borderRadius="lg"
          bg={cardBg}
          p={4}
          borderLeftWidth="4px"
          borderLeftColor={statAccent}
        >
          <Stat>
            <StatLabel>Horas registradas hoy</StatLabel>
            <StatNumber>
              {summary ? summary.horas_hoy.toFixed(2) : "0.00"} h
            </StatNumber>
          </Stat>
        </Box>
        <Box
          borderWidth="1px"
          borderRadius="lg"
          bg={cardBg}
          p={4}
          borderLeftWidth="4px"
          borderLeftColor={statAccent}
        >
          <Stat>
            <StatLabel>Tickets abiertos</StatLabel>
            <StatNumber>{summary?.tickets_abiertos ?? 0}</StatNumber>
          </Stat>
        </Box>
        <Box
          borderWidth="1px"
          borderRadius="lg"
          bg={cardBg}
          p={4}
          borderLeftWidth="4px"
          borderLeftColor={statAccent}
        >
          <Stat>
            <StatLabel>Tickets en progreso</StatLabel>
            <StatNumber>{summary?.tickets_en_progreso ?? 0}</StatNumber>
          </Stat>
        </Box>
      </SimpleGrid>

      <Box borderWidth="1px" borderRadius="lg" bg={cardBg} p={4} mb={8}>
        <HStack
          spacing={4}
          align="flex-start"
          justify="space-between"
          flexWrap="wrap"
        >
          <Box maxW="sm">
            <Text fontWeight="semibold" mb={1}>
              Acciones rápidas
            </Text>
            <Text fontSize="sm" color={subtleText}>
              Gestiona tu organización y accede al ERP, Moodle y las
              herramientas clave de la plataforma.
            </Text>
          </Box>
          <HStack spacing={2} flexWrap="wrap" justify="flex-end">
            {isSuperAdmin && (
              <Button
                as={Link}
                to="/tenant-settings"
                size="sm"
                colorScheme="green"
                variant="outline"
              >
                Crear / gestionar tenants
              </Button>
            )}
            <Button
              as={Link}
              to="/users"
              size="sm"
              colorScheme="green"
              variant="outline"
            >
              Gestionar usuarios
            </Button>
            <Button
              as={Link}
              to="/time-report"
              size="sm"
              colorScheme="green"
              variant="outline"
            >
              Ver informe de horas
            </Button>
            <Button
              as={Link}
              to="/support"
              size="sm"
              colorScheme="green"
              variant="outline"
            >
              Ver tickets
            </Button>
            <Button
              as={Link}
              to="/tools"
              size="sm"
              colorScheme="green"
              variant="outline"
            >
              Ver herramientas
            </Button>
          </HStack>
        </HStack>
      </Box>

      <Heading as="h2" size="md" mb={4}>
        Herramientas disponibles
      </Heading>
      <Text mb={4} fontSize="sm" color={subtleText}>
        Accede a las aplicaciones corporativas vinculadas a tu tenant.
      </Text>

      {isLoading && <Text>Cargando herramientas...</Text>}

      {!isLoading && tools && <ToolGrid tools={tools} onLaunch={handleLaunch} />}

      {launchUrl && selectedTool && (
        <Box
          mt={8}
          borderWidth="1px"
          borderRadius="lg"
          overflow="hidden"
          bg={cardBg}
        >
          <Box px={4} py={2} borderBottomWidth="1px">
            <Text fontWeight="semibold" fontSize="sm">
              {selectedTool.name}
            </Text>
            <Text fontSize="xs" color={subtleText}>
              {selectedTool.description ??
                "Herramienta integrada en la plataforma."}
            </Text>
            {selectedTool.slug === "erp" && (
              <Text fontSize="xs" color={subtleText} mt={1}>
                ERP interno integrado en el dashboard para gestionar proyectos,
                tareas y control horario.
              </Text>
            )}
          </Box>
          <Box h={{ base: "70vh", md: "75vh", lg: "80vh" }}>
            <iframe
              src={launchUrl}
              width="100%"
              height="100%"
              style={{ border: "none" }}
              title={selectedTool.name}
            />
          </Box>
        </Box>
      )}
    </AppShell>
  );
};
