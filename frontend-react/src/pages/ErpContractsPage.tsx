import React from "react";
import { Box, Heading, useColorModeValue } from "@chakra-ui/react";

import { AppShell } from "../components/layout/AppShell";
import { ContractsModule } from "../components/erp/contracts/ContractsModule";

export const ErpContractsPage: React.FC = () => {
  const pageBg = useColorModeValue("gray.50", "gray.900");

  return (
    <AppShell>
      <Box bg={pageBg} minH="100vh" px={{ base: 4, md: 8 }} py={{ base: 6, md: 8 }}>
        <Heading size="lg" mb={6} color={useColorModeValue("gray.900", "white")}>
          Contratos
        </Heading>
        <ContractsModule />
      </Box>
    </AppShell>
  );
};

export default ErpContractsPage;
