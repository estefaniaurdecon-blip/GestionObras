import React, { useEffect, useState } from "react";
import {
  Box,
  Heading,
  Spinner,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";

import { AppShell } from "../components/layout/AppShell";
import { apiClient } from "../api/client";

interface AuditLogItem {
  id: number;
  created_at: string;
  user_email: string | null;
  action: string;
  details: string | null;
}

/**
 * Página de auditoria.
 *
 * Muestra el log real de acciones clave (login, gestión de tenants, etc.)
 * obtenido del backend.
 */
// Pantalla de auditoria con el registro de acciones.
export const AuditLogPage: React.FC = () => {
  // Estilos base de la tabla.
  const cardBg = useColorModeValue("white", "gray.700");
  const tableHeadBg = useColorModeValue("gray.50", "gray.800");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  // Carga el log de auditoria al montar la pagina.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setIsLoading(true);
        setIsError(false);
        const response = await apiClient.get<AuditLogItem[]>("/api/v1/audit/", {
          params: { limit: 100 },
        });
        if (!cancelled) {
          setItems(response.data);
        }
      } catch {
        if (!cancelled) {
          setIsError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  // Render principal de la pagina.
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
        <Box position="relative">
          <Text textTransform="uppercase" fontSize="xs" letterSpacing="0.2em">
            Administracion
          </Text>
          <Heading size="lg">Auditoria</Heading>
          <Text fontSize="sm" opacity={0.9}>
            Registro de acciones y eventos clave del sistema.
          </Text>
        </Box>
      </Box>
      <Text mb={6}>
        Registro de acciones relevantes en la plataforma para este tenant.
      </Text>

      {isLoading && (
        <Box mb={4}>
          <Spinner size="sm" mr={2} />
          <Text as="span" fontSize="sm">
            Cargando registros de auditoria...
          </Text>
        </Box>
      )}

      {isError && (
        <Text mb={4} fontSize="sm" color="red.500">
          No se han podido cargar los registros de auditoria (comprueba permisos y
          conexión).
        </Text>
      )}

      <Box borderWidth="1px" borderRadius="md" overflow="hidden" bg={cardBg}>
        <Table size="sm">
          <Thead bg={tableHeadBg}>
            <Tr>
              <Th>Fecha</Th>
              <Th>Usuario</Th>
              <Th>Accion</Th>
              <Th>Detalles</Th>
            </Tr>
          </Thead>
          <Tbody>
            {items.length === 0 ? (
              <Tr>
                <Td colSpan={4}>
                  <Text fontSize="sm" color="gray.500">
                    Todavia no hay registros de auditoria para mostrar.
                  </Text>
                </Td>
              </Tr>
            ) : (
              items.map((item) => (
                <Tr key={item.id}>
                  <Td>{new Date(item.created_at).toLocaleString()}</Td>
                  <Td>{item.user_email ?? "-"}</Td>
                  <Td>{item.action}</Td>
                  <Td>{item.details ?? "-"}</Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </Box>
    </AppShell>
  );
};
