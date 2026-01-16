import React, { useEffect, useMemo, useState } from "react";
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
import { useTranslation } from "react-i18next";

import { NotificationsBell } from "../NotificationsBell";
import { apiClient } from "../../api/client";
import { useCurrentUser } from "../../hooks/useCurrentUser";

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const { t } = useTranslation();
  const sidebarBg = useColorModeValue("white", "gray.900");
  const headerBg = useColorModeValue("white", "gray.900");
  const pageBg = useColorModeValue("gray.50", "gray.800");
  const router = useRouter();
  const pathname = router.state.location.pathname;
  const isErpRoute = useMemo(() => pathname.startsWith("/erp/"), [pathname]);
  const [erpAccordionIndex, setErpAccordionIndex] = useState(
    isErpRoute ? 0 : -1
  );
  const isActive = (path: string) => pathname === path;
  const isActivePrefix = (path: string) =>
    pathname === path || pathname.startsWith(`${path}/`);

  useEffect(() => {
    if (isErpRoute) {
      setErpAccordionIndex(0);
    }
  }, [isErpRoute]);

  const { data: currentUser } = useCurrentUser();

  const email = currentUser?.email ?? t("layout.user.fallbackEmail");
  const fullName = currentUser?.full_name ?? t("layout.user.fallbackName");
  const isSuperAdmin = Boolean(currentUser?.is_super_admin);
  const isTenantAdmin = !isSuperAdmin && Boolean(currentUser?.role_id);

  const handleLogout = () => {
    void apiClient.post("/api/v1/auth/logout").catch(() => undefined);
    localStorage.removeItem("access_token");
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
        w="300px"
        borderRightWidth="1px"
        bg={sidebarBg}
        px={5}
        py={6}
        display={{ base: "none", md: "block" }}
      >
        <VStack align="stretch" spacing={6}>
          <HStack spacing={3}>
            <Image
              src="/logo-urdecon.svg"
              alt={t("layout.brand.logoAlt")}
              boxSize="56px"
              objectFit="contain"
            />
            <Box>
              <Text fontSize="lg" fontWeight="bold">
                {t("layout.brand.title")}
              </Text>
              <Text fontSize="xs" color="gray.500">
                {t("layout.brand.subtitle")}
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
              {t("layout.sections.navigation")}
            </Text>

            <Button
              as={Link}
              to="/dashboard"
              variant={isActive("/dashboard") ? "solid" : "ghost"}
              justifyContent="flex-start"
              size="sm"
            >{t("layout.nav.dashboard")}</Button>

            <Accordion
              allowToggle
              index={erpAccordionIndex}
              onChange={(nextIndex) => {
                setErpAccordionIndex(
                  typeof nextIndex === "number" ? nextIndex : nextIndex[0] ?? -1
                );
              }}
              borderWidth="1px"
              borderRadius="md"
            >
              <AccordionItem border="none">
                <AccordionButton px={3} py={2}>
                  <Box
                    flex="1"
                    textAlign="left"
                    fontSize="sm"
                    fontWeight="semibold"
                  >{t("layout.nav.erp")}</Box>
                  <AccordionIcon />
                </AccordionButton>
                <AccordionPanel px={2} pb={3}>
                  <VStack align="stretch" spacing={1}>
                    <Button
                      as={Link}
                      to="/erp/time-report"
                      variant={isActive("/erp/time-report") ? "solid" : "ghost"}
                      justifyContent="flex-start"
                      size="sm"
                    >{t("layout.nav.timeReport")}</Button>
                    <Button
                      as={Link}
                      to="/erp/time-control"
                      variant={isActive("/erp/time-control") ? "solid" : "ghost"}
                      justifyContent="flex-start"
                      size="sm"
                    >{t("layout.nav.timeControl")}</Button>
                    <Button
                      as={Link}
                      to="/erp/tasks"
                      variant={isActive("/erp/tasks") ? "solid" : "ghost"}
                      justifyContent="flex-start"
                      size="sm"
                    >{t("layout.nav.tasks")}</Button>
                    <Button
                      as={Link}
                      to="/erp/projects"
                      variant={
                        isActivePrefix("/erp/projects") ? "solid" : "ghost"
                      }
                      justifyContent="flex-start"
                      size="sm"
                    >{t("layout.nav.projects")}</Button>
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
                >{t("layout.nav.users")}</Button>
                <Button
                  as={Link}
                  to="/hr"
                  variant="ghost"
                  justifyContent="flex-start"
                  size="sm"
                >{t("layout.nav.hr")}</Button>
              </>
            )}

            <Button
              as={Link}
              to="/support"
              variant="ghost"
              justifyContent="flex-start"
              size="sm"
            >{t("layout.nav.support")}</Button>

            <Button
              as={Link}
              to="/tools"
              variant="ghost"
              justifyContent="flex-start"
              size="sm"
            >{t("layout.nav.tools")}</Button>

            {isSuperAdmin && (
              <Button
                as={Link}
                to="/audit"
                variant="ghost"
                justifyContent="flex-start"
                size="sm"
              >{t("layout.nav.audit")}</Button>
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
                {t("layout.sections.administration")}
              </Text>
              <Button
                as={Link}
                to="/tenant-settings"
                variant="ghost"
                justifyContent="flex-start"
                size="sm"
              >{t("layout.nav.tenantSettings")}</Button>
            </VStack>
          )}
        </VStack>
      </Box>

      {/* CONTENT */}
      <Flex direction="column" flex="1">
        {/* HEADER */}
        <Flex as="header" bg={headerBg} borderBottomWidth="1px" px={6} py={4}>
          <Flex
            w="100%"
            maxW="100%"
            mx={0}
            align="center"
            justify="space-between"
          >
            <Box>
              <Text fontSize="lg" fontWeight="semibold">{t("layout.header.title")}</Text>
              <Text fontSize="sm" color="gray.500">{t("layout.header.subtitle")}</Text>
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
                  <MenuItem onClick={goToUserSettings}>{t("layout.userMenu.settings")}</MenuItem>
                  <MenuItem onClick={handleLogout}>{t("layout.userMenu.logout")}</MenuItem>
                </MenuList>
              </Menu>
            </HStack>
          </Flex>
        </Flex>

        {/* MAIN */}
        <Box as="main" px={{ base: 4, md: 6 }} py={6} w="100%">
          <Box maxW="100%" mx={0} w="100%">
            {children}
          </Box>
        </Box>
      </Flex>
    </Flex>
  );
};
