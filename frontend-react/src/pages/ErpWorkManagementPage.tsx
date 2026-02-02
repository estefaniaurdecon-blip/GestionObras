import React from "react";
import { Box, Text, useColorModeValue } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import { AppShell } from "../components/layout/AppShell";
import { PageHero } from "../components/layout/PageHero";

export const ErpWorkManagementPage: React.FC = () => {
  const { t } = useTranslation();
  const panelBg = useColorModeValue("white", "gray.700");

  return (
    <AppShell>
      <PageHero
        title={t("layout.nav.workManagement")}
        subtitle="Seccion en preparacion."
      />
      <Box borderWidth="1px" borderRadius="xl" p={6} bg={panelBg}>
        <Text fontSize="sm" color="gray.500">
          Próximamente más opciones para la gestión de obra.
        </Text>
      </Box>
    </AppShell>
  );
};
