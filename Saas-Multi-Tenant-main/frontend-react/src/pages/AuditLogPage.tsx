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
export const AuditLogPage: React.FC = () => {
  const cardBg = useColorModeValue("white", "gray.700");
  const tableHeadBg = useColorModeValue("gray.50", "gray.800");

  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);

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

  return (
    <AppShell>
      <Heading mb={4}>Auditoria</Heading>
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

