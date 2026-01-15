import React from "react";
import { Box, Heading, Text, useColorModeValue } from "@chakra-ui/react";
import { useParams } from "@tanstack/react-router";

import { AppShell } from "../components/layout/AppShell";

// Vista detalle basica para proyectos ERP.
export const ErpProjectDetailPage: React.FC = () => {
  const { projectId } = useParams({ strict: false }) as { projectId?: string };
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.500", "gray.300");

  return (
    <AppShell>
      <Box borderWidth="1px" borderRadius="xl" p={6} bg={cardBg}>
        <Heading size="md" mb={2}>
          Detalles del proyecto
        </Heading>
        <Text fontSize="sm" color={subtleText}>
          Proyecto #{projectId ?? "sin id"}
        </Text>
      </Box>
    </AppShell>
  );
};
