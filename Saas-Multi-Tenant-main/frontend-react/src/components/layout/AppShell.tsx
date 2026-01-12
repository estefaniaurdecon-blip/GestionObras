import React from "react";
import {
  Avatar,
  Box,
  Button,
  Divider,
  Flex,
  HStack,
  Image,
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text,
  VStack,
  useColorModeValue,
} from "@chakra-ui/react";
import { Link, useRouter } from "@tanstack/react-router";

import { NotificationsBell } from "../NotificationsBell";

interface AppShellProps {
  children: React.ReactNode;
}

interface CurrentUser {
  email: string;
  full_name?: string | null;
  is_super_admin?: boolean;
  tenant_id?: number | null;
  role_id?: number | null;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const sidebarBg = useColorModeValue("white", "gray.900");
  const headerBg = useColorModeValue("white", "gray.900");
  const pageBg = useColorModeValue("gray.50", "gray.800");
  const router = useRouter();

  let currentUser: CurrentUser | null = null;
  try {
    const raw = localStorage.getItem("current_user");
    if (raw) currentUser = JSON.parse(raw);
  } catch {
    currentUser = null;
  }

  const email = currentUser?.email ?? "dios@cortecelestial.god";
  const fullName = currentUser?.full_name ?? "Super Admin";
  const isSuperAdmin = Boolean(currentUser?.is_super_admin);
  const isTenantAdmin = !isSuperAdmin && Boolean(currentUser?.role_id);

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("current_user");
    router.history.push("/");
  };

  const goToUserSettings = () => {
    router.history.push("/user-settings");
  };

  return (
    <Flex minH="100vh" bg={pageBg}>
      {/* SIDEBAR */}
      <Box
        as="nav"
        w="260px"
        borderRightWidth="1px"
        bg={sidebarBg}
        px={6}
        py={6}
        display={{ base: "none", md: "block" }}
      >
        <VStack align="stretch" spacing={6}>
          <HStack spacing={3}>
            <Image
              src="/logo-urdecon.svg"
              alt="Logo Urdecon"
              boxSize="56px"
              objectFit="contain"
            />
            <Box>
              <Text fontSize="lg" fontWeight="bold">
                URDECON INNOVA
              </Text>
              <Text fontSize="xs" color="gray.500">
                Plataforma SaaS corporativa
              </Text>
            </Box>
          </HStack>

          <Divider />

          <VStack align="stretch" spacing={2}>
            <Text
              fontSize="xs"
              fontWeight="semibold"
              textTransform="uppercase"
              color="gray.500"
            >
              Navegación
            </Text>

            <Button
              as={Link}
              to="/dashboard"
              variant="ghost"
              justifyContent="flex-start"
              size="sm"
            >
              Dashboard
            </Button>

            <Accordion allowToggle borderWidth="1px" borderRadius="md">
              <AccordionItem border="none">
                <AccordionButton px={3} py={2}>
                  <Box flex="1" textAlign="left" fontSize="sm" fontWeight="semibold">
                    ERP
                  </Box>
                  <AccordionIcon />
                </AccordionButton>
                <AccordionPanel px={2} pb={3}>
                  <VStack align="stretch" spacing={1}>
                    <Button
                      as={Link}
                      to="/erp/projects"
                      variant="ghost"
                      justifyContent="flex-start"
                      size="sm"
                    >
                      Proyectos y tareas
                    </Button>
                    <Button
                      as={Link}
                      to="/erp/time-control"
                      variant="ghost"
                      justifyContent="flex-start"
                      size="sm"
                    >
                      Control de tiempo
                    </Button>
                    <Button
                      as={Link}
                      to="/erp/time-report"
                      variant="ghost"
                      justifyContent="flex-start"
                      size="sm"
                    >
                      Informe de horas
                    </Button>
                  </VStack>
                </AccordionPanel>
              </AccordionItem>
            </Accordion>

            {(isSuperAdmin || isTenantAdmin) && (
              <>
                <Button
                  as={Link}
                  to="/users"
                  variant="ghost"
                  justifyContent="flex-start"
                  size="sm"
                >
                  Usuarios
                </Button>
                <Button
                  as={Link}
                  to="/hr"
                  variant="ghost"
                  justifyContent="flex-start"
                  size="sm"
                >
                  Recursos humanos
                </Button>
              </>
            )}

            <Button
              as={Link}
              to="/support"
              variant="ghost"
              justifyContent="flex-start"
              size="sm"
            >
              Soporte
            </Button>

            <Button
              as={Link}
              to="/tools"
              variant="ghost"
              justifyContent="flex-start"
              size="sm"
            >
              Herramientas
            </Button>

            {isSuperAdmin && (
              <Button
                as={Link}
                to="/audit"
                variant="ghost"
                justifyContent="flex-start"
                size="sm"
              >
                Auditoría
              </Button>
            )}
          </VStack>

          <Divider />

          {isSuperAdmin && (
            <VStack align="stretch" spacing={2}>
              <Text
                fontSize="xs"
                fontWeight="semibold"
                textTransform="uppercase"
                color="gray.500"
              >
                Administración
              </Text>
              <Button
                as={Link}
                to="/tenant-settings"
                variant="ghost"
                justifyContent="flex-start"
                size="sm"
              >
                Ajustes de tenants
              </Button>
            </VStack>
          )}
        </VStack>
      </Box>

      {/* CONTENT */}
      <Flex direction="column" flex="1">
        {/* HEADER */}
        <Flex as="header" bg={headerBg} borderBottomWidth="1px" px={8} py={4}>
          <Flex
            w="100%"
            maxW="7xl"
            mx="auto"
            align="center"
            justify="space-between"
          >
            <Box>
              <Text fontSize="lg" fontWeight="semibold">
                Panel de control
              </Text>
              <Text fontSize="sm" color="gray.500">
                Vista general de tu organización y herramientas
              </Text>
            </Box>

            <HStack spacing={4}>
              <NotificationsBell />
              <Menu>
                <MenuButton>
                  <HStack spacing={3}>
                    <VStack align="flex-end" spacing={0}>
                      <Text fontSize="sm" fontWeight="medium">
                        {fullName}
                      </Text>
                      <Text fontSize="xs" color="gray.500">
                        {email}
                      </Text>
                    </VStack>
                    <Avatar name={fullName} size="sm" />
                  </HStack>
                </MenuButton>
                <MenuList>
                  <MenuItem onClick={goToUserSettings}>
                    Ajustes de usuario
                  </MenuItem>
                  <MenuItem onClick={handleLogout}>Cerrar sesión</MenuItem>
                </MenuList>
              </Menu>
            </HStack>
          </Flex>
        </Flex>

        {/* MAIN */}
        <Box as="main" px={{ base: 4, md: 8 }} py={6} w="100%">
          <Box maxW="7xl" mx="auto" w="100%">
            {children}
          </Box>
        </Box>
      </Flex>
    </Flex>
  );
};
