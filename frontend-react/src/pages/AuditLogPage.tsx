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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
        bgGradient="linear(120deg, var(--chakra-colors-brand-700) 0%, var(--chakra-colors-brand-500) 55%, var(--chakra-colors-brand-300) 110%)"
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
          <Text textTransform="uppercase" fontSize="xs" letterSpacing="0.2em">{t("audit.header.eyebrow")}</Text>
          <Heading size="lg">{t("audit.header.title")}</Heading>
          <Text fontSize="sm" opacity={0.9}>
            {t("audit.header.subtitle")}
          </Text>
        </Box>
      </Box>
      <Text mb={6}>
        {t("audit.description")}
      </Text>

      {isLoading && (
        <Box mb={4}>
          <Spinner size="sm" mr={2} />
          <Text as="span" fontSize="sm">
            {t("audit.loading")}
          </Text>
        </Box>
      )}

      {isError && (
        <Text mb={4} fontSize="sm" color="red.500">
          {t("audit.error")}
          conexión).
        </Text>
      )}

      <Box borderWidth="1px" borderRadius="md" overflow="hidden" bg={cardBg}>
        <Table size="sm">
          <Thead bg={tableHeadBg}>
            <Tr>
              <Th>{t("audit.table.date")}</Th>
              <Th>{t("audit.table.user")}</Th>
              <Th>{t("audit.table.action")}</Th>
              <Th>{t("audit.table.details")}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {items.length === 0 ? (
              <Tr>
                <Td colSpan={4}>
                  <Text fontSize="sm" color="gray.500">
                    {t("audit.table.empty")}
                  </Text>
                </Td>
              </Tr>
            ) : (
              items.map((item) => (
                <Tr key={item.id}>
                  <Td>{new Date(item.created_at).toLocaleString()}</Td>
                  <Td>{item.user_email ?? "-"}</Td>
                  <Td>{t(`audit_actions.${item.action}`, { defaultValue: item.action })}</Td>
                  <Td>{t(`audit_details.${item.action}`, { defaultValue: item.details ?? "-" })}</Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </Box>
    </AppShell>
  );
};
