import React, { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Badge,
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
  IconButton,
  useColorMode,
  Center,
  Spinner,
} from "@chakra-ui/react";
import { MoonIcon, SunIcon } from "@chakra-ui/icons";
import { Link, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { NotificationsBell } from "../NotificationsBell";
import { apiClient } from "../../api/client";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { fetchBranding } from "../../api/branding";
import { fetchNotifications } from "../../api/notifications";
import { useCurrentUser } from "../../hooks/useCurrentUser";

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const { t } = useTranslation();
  const { colorMode, setColorMode } = useColorMode();
  const sidebarBg = useColorModeValue("white", "gray.900");
  const headerBg = useColorModeValue("white", "gray.900");
  const pageBg = useColorModeValue("gray.50", "gray.800");
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = router.state.location.pathname;
  const isWorkManagementRoute = useMemo(
    () => pathname.startsWith("/erp/work-management"),
    [pathname],
  );
  const isErpRoute = useMemo(
    () => pathname.startsWith("/erp/") && !isWorkManagementRoute,
    [pathname, isWorkManagementRoute],
  );
  const isHrRoute = useMemo(() => pathname.startsWith("/hr"), [pathname]);
  const isSettingsRoute = useMemo(
    () =>
      pathname.startsWith("/tenant-branding") ||
      pathname.startsWith("/tenant-department-emails"),
    [pathname],
  );
  const [erpAccordionIndex, setErpAccordionIndex] = useState(
    isErpRoute ? 0 : -1
  );
  const [hrAccordionIndex, setHrAccordionIndex] = useState(
    isHrRoute ? 0 : -1
  );
  const [settingsAccordionIndex, setSettingsAccordionIndex] = useState(
    isSettingsRoute ? 0 : -1
  );
  const isActive = (path: string) => pathname === path;
  const isActivePrefix = (path: string) =>
    pathname === path || pathname.startsWith(`${path}/`);
  const isActiveHrRoute = (path: string) =>
    isActivePrefix(path) || pathname === "/hr";

  useEffect(() => {
    if (isErpRoute) {
      setErpAccordionIndex(0);
    }
  }, [isErpRoute]);

  useEffect(() => {
    if (isHrRoute) {
      setHrAccordionIndex(0);
    }
  }, [isHrRoute]);

  useEffect(() => {
    if (isSettingsRoute) {
      setSettingsAccordionIndex(0);
    }
  }, [isSettingsRoute]);


  const { data: currentUser, isLoading: isUserLoading } = useCurrentUser();

  const email = currentUser?.email ?? t("layout.user.fallbackEmail");
  const fullName = currentUser?.full_name ?? t("layout.user.fallbackName");
  const rawAvatarUrl =
    currentUser?.avatar_data ?? currentUser?.avatar_url ?? undefined;
  const resolvedAvatarUrl = rawAvatarUrl
    ? rawAvatarUrl.startsWith("http") || rawAvatarUrl.startsWith("data:")
      ? rawAvatarUrl
      : `${apiClient.defaults.baseURL || window.location.origin}${rawAvatarUrl}`
    : undefined;
  const isSuperAdmin = currentUser?.is_super_admin === true;
  const isTenantAdmin =
    !isSuperAdmin && currentUser?.role_name === "tenant_admin";
  const isGerencia = !isSuperAdmin && currentUser?.role_name === "gerencia";
  const tenantId = currentUser?.tenant_id ?? null;

  const brandingQuery = useQuery({
    queryKey: ["tenant-branding-shell", tenantId],
    queryFn: () => fetchBranding(tenantId as number),
    enabled: Boolean(tenantId) && !isSuperAdmin,
  });

  const ticketNotificationsQuery = useQuery({
    queryKey: ["notifications", { onlyUnread: true, scope: "tickets" }],
    queryFn: () => fetchNotifications(true, 50),
    refetchInterval: 30000,
    enabled: (isSuperAdmin || isTenantAdmin) && !isUserLoading,
  });

  const ticketUnreadCount =
    ticketNotificationsQuery.data?.items.filter((n) =>
      n.type.startsWith("ticket_"),
    ).length ?? 0;

  const needsBranding = !isSuperAdmin && Boolean(tenantId);
  const isBrandingLoading =
    needsBranding && (brandingQuery.isLoading || (!brandingQuery.data && brandingQuery.isFetching));

  const brandingLogo =
    !isSuperAdmin ? brandingQuery.data?.logo ?? null : null;
  const showCompanyName =
    brandingQuery.data?.show_company_name ?? true;
  const showCompanySubtitle =
    brandingQuery.data?.show_company_subtitle ?? true;
  const brandingName =
    !isSuperAdmin
      ? showCompanyName
        ? brandingQuery.data?.company_name ?? t("layout.brand.title")
        : t("layout.brand.title")
      : t("layout.brand.title");
  const brandingSubtitle =
    !isSuperAdmin
      ? showCompanySubtitle
        ? brandingQuery.data?.company_subtitle ?? t("layout.brand.subtitle")
        : t("layout.brand.subtitle")
      : t("layout.brand.subtitle");
  const brandingLogoUrl = brandingLogo
    ? brandingLogo.startsWith("http")
      ? brandingLogo
      : `${apiClient.defaults.baseURL || window.location.origin}${brandingLogo}?v=${
          brandingQuery.data?.updated_at ?? ""
        }`
    : "/logo-urdecon.svg";

  const handleLogout = () => {
    void apiClient.post("/api/v1/auth/logout").catch(() => undefined);
    localStorage.removeItem("access_token");
    queryClient.clear();
    router.history.push("/");
  };

  const goToUserSettings = () => {
    router.history.push("/user-settings");
  };

  if (isUserLoading || isBrandingLoading) {
    return (
      <Center minH="100vh" bg={pageBg}>
        <Spinner size="lg" />
      </Center>
    );
  }

  return (
    <Flex minH="100vh" bg={pageBg}>
      {/* SIDEBAR */}
      <Box
        as="nav"
        w="300px"
        flexShrink={0}
        borderRightWidth="1px"
        bg={sidebarBg}
        px={5}
        py={6}
        display={{ base: "none", md: "block" }}
      >
        <VStack align="stretch" spacing={6}>
          <HStack
            as={Link}
            to="/dashboard"
            spacing={3}
            cursor="pointer"
            _hover={{ textDecoration: "none", opacity: 0.9 }}
          >
            <Image
              src={brandingLogoUrl}
              alt={t("layout.brand.logoAlt")}
              boxSize="56px"
              objectFit="contain"
            />
            <Box>
              <Text fontSize="lg" fontWeight="bold">
                {brandingName}
              </Text>
              <Text fontSize="xs" color="gray.500">
                {brandingSubtitle}
              </Text>
            </Box>
          </HStack>

          <Divider />

          <VStack align="stretch" spacing={2}>
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
                    <Button
                      as={Link}
                      to="/erp/external-collaborations"
                      variant={
                        isActive("/erp/external-collaborations")
                          ? "solid"
                          : "ghost"
                      }
                      justifyContent="flex-start"
                      size="sm"
                    >{t("layout.nav.externalCollaborations")}</Button>
                    <Button
                      as={Link}
                      to="/erp/simulations"
                      variant={isActive("/erp/simulations") ? "solid" : "ghost"}
                      justifyContent="flex-start"
                      size="sm"
                    >{t("layout.nav.simulations")}</Button>
                    <Button
                      as={Link}
                      to="/erp/invoices"
                      variant={isActive("/erp/invoices") ? "solid" : "ghost"}
                      justifyContent="flex-start"
                      size="sm"
                    >
                      Facturas
                    </Button>
                    <Button
                      as={Link}
                      to="/erp/contracts"
                      variant={isActive("/erp/contracts") ? "solid" : "ghost"}
                      justifyContent="flex-start"
                      size="sm"
                    >
                      Contratos
                    </Button>
                  </VStack>
                </AccordionPanel>
              </AccordionItem>
            </Accordion>

            <Button
              onClick={() => router.history.push("/erp/work-management")}
              variant={isActivePrefix("/erp/work-management") ? "solid" : "ghost"}
              justifyContent="flex-start"
              size="sm"
            >
              {t("layout.nav.workManagement")}
            </Button>

            {(isSuperAdmin || isTenantAdmin || isGerencia) && (
              <>
                <Accordion
                  allowToggle
                  index={hrAccordionIndex}
                  onChange={(nextIndex) => {
                    setHrAccordionIndex(
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
                      >{t("layout.nav.hr")}</Box>
                      <AccordionIcon />
                    </AccordionButton>
                    <AccordionPanel px={2} pb={3}>
                      <VStack align="stretch" spacing={1}>
                        <Button
                          as={Link}
                          to="/hr/departments"
                          variant={isActiveHrRoute("/hr/departments") ? "solid" : "ghost"}
                          justifyContent="flex-start"
                          size="sm"
                        >{t("layout.nav.hrDepartments")}</Button>
                        <Button
                          as={Link}
                          to="/hr/employees"
                          variant={isActiveHrRoute("/hr/employees") ? "solid" : "ghost"}
                          justifyContent="flex-start"
                          size="sm"
                        >{t("layout.nav.hrEmployees")}</Button>
                        <Button
                          as={Link}
                          to="/hr/talent"
                          variant={isActiveHrRoute("/hr/talent") ? "solid" : "ghost"}
                          justifyContent="flex-start"
                          size="sm"
                        >{t("layout.nav.hrTalent")}</Button>
                      </VStack>
                    </AccordionPanel>
                  </AccordionItem>
                </Accordion>
              </>
            )}

          </VStack>

          <Divider />

          {(isSuperAdmin || isTenantAdmin || isGerencia) && (
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
                to="/users"
                variant={isActivePrefix("/users") ? "solid" : "ghost"}
                justifyContent="flex-start"
                size="sm"
              >{t("layout.nav.users")}</Button>
              {(isSuperAdmin || isTenantAdmin) && (
                <Button
                  as={Link}
                  to="/tools"
                  variant={isActivePrefix("/tools") ? "solid" : "ghost"}
                  justifyContent="flex-start"
                  size="sm"
                >{t("layout.nav.tools")}</Button>
              )}
              {isSuperAdmin && (
                <Button
                  as={Link}
                  to="/tenant-settings"
                  variant={isActivePrefix("/tenant-settings") ? "solid" : "ghost"}
                  justifyContent="flex-start"
                  size="sm"
                >
                  {t("layout.nav.tenantSettings")}
                </Button>
              )}
              {(isSuperAdmin || isTenantAdmin) && (
                <Accordion
                  allowToggle
                  index={settingsAccordionIndex}
                  onChange={(nextIndex) => {
                    setSettingsAccordionIndex(
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
                      >
                        {t("layout.nav.settings")}
                      </Box>
                      <AccordionIcon />
                    </AccordionButton>
                    <AccordionPanel px={2} pb={3}>
                      <VStack align="stretch" spacing={1}>
                        <Button
                          as={Link}
                          to="/tenant-branding"
                          variant={
                            isActivePrefix("/tenant-branding")
                              ? "solid"
                              : "ghost"
                          }
                          justifyContent="flex-start"
                          size="sm"
                        >
                          {t("layout.nav.branding")}
                        </Button>
                        <Button
                          as={Link}
                          to="/tenant-department-emails"
                          variant={
                            isActivePrefix("/tenant-department-emails")
                              ? "solid"
                              : "ghost"
                          }
                          justifyContent="flex-start"
                          size="sm"
                        >
                          {t("layout.nav.departmentEmails")}
                        </Button>
                      </VStack>
                    </AccordionPanel>
                  </AccordionItem>
                </Accordion>
              )}
              {isSuperAdmin && (
                <Button
                  as={Link}
                  to="/audit"
                  variant={isActivePrefix("/audit") ? "solid" : "ghost"}
                  justifyContent="flex-start"
                  size="sm"
                >
                  Logs
                </Button>
              )}
              {(isSuperAdmin || isTenantAdmin) && (
                <Button
                  as={Link}
                  to="/support"
                  variant={isActivePrefix("/support") ? "solid" : "ghost"}
                  justifyContent="flex-start"
                  size="sm"
                >
                  <HStack spacing={2}>
                    <Text>{t("layout.nav.support")}</Text>
                    {ticketUnreadCount > 0 && (
                      <Badge colorScheme="red" borderRadius="full" px={2}>
                        {ticketUnreadCount}
                      </Badge>
                    )}
                  </HStack>
                </Button>
              )}
            </VStack>
          )}
        </VStack>
      </Box>

      {/* CONTENT */}
      <Flex direction="column" flex="1" minW="0">
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
              <IconButton
                aria-label="Toggle color mode"
                icon={colorMode === "light" ? <MoonIcon /> : <SunIcon />}
                size="sm"
                variant="ghost"
                onClick={() =>
                  setColorMode(colorMode === "light" ? "dark" : "light")
                }
              />
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
                    <Avatar name={fullName} src={resolvedAvatarUrl} size="sm" />
                  </HStack>
                </MenuButton>
                <MenuList>
                  {!isGerencia && (
                    <MenuItem onClick={goToUserSettings}>{t("layout.userMenu.settings")}</MenuItem>
                  )}
                  <MenuItem onClick={handleLogout}>{t("layout.userMenu.logout")}</MenuItem>
                </MenuList>
              </Menu>
            </HStack>
          </Flex>
        </Flex>

        {/* MAIN */}
        <Box
          as="main"
          px={{ base: 4, md: 6 }}
          py={6}
          w="100%"
          minW="0"
          overflowX="hidden"
        >
          <Box maxW="100%" mx={0} w="100%" minW="0">
            {children}
          </Box>
        </Box>
      </Flex>
    </Flex>
  );
};
