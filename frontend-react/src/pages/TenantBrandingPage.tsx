import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Image,
  Input,
  Select,
  SimpleGrid,
  Stack,
  Text,
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { AppShell } from "../components/layout/AppShell";
import { apiClient } from "../api/client";
import { fetchBranding, updateBranding } from "../api/branding";
import { fetchAllTenants, type TenantOption } from "../api/users";
import { useCurrentUser } from "../hooks/useCurrentUser";

export const TenantBrandingPage: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const logoPreviewBg = useColorModeValue("white", "gray.800");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = Boolean(currentUser?.is_super_admin);

  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [accentColor, setAccentColor] = useState("#00662b");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoVersion, setLogoVersion] = useState(0);
  const [companyName, setCompanyName] = useState("");
  const [companySubtitle, setCompanySubtitle] = useState("");

  useEffect(() => {
    if (!currentUser?.tenant_id) return;
    if (isSuperAdmin) return;
    if (selectedTenantId !== null) return;
    setSelectedTenantId(currentUser.tenant_id);
  }, [currentUser?.tenant_id, isSuperAdmin, selectedTenantId]);

  const {
    data: tenants,
    isLoading: isLoadingTenants,
    isError: isErrorTenants,
  } = useQuery<TenantOption[]>({
    queryKey: ["tenants-for-branding"],
    queryFn: fetchAllTenants,
    enabled: isSuperAdmin,
    onSuccess: (data) => {
      if (isSuperAdmin && selectedTenantId === null && data.length > 0) {
        setSelectedTenantId(data[0].id);
      }
    },
  });

  const tenantId = selectedTenantId ?? undefined;

  const brandingQuery = useQuery({
    queryKey: ["tenant-branding", tenantId],
    queryFn: () => fetchBranding(tenantId as number),
    enabled: Boolean(tenantId),
  });

  useEffect(() => {
    if (!brandingQuery.data) return;
    setAccentColor(brandingQuery.data.accent_color);
    setLogoFile(null);
    setLogoVersion((prev) => prev + 1);
    setCompanyName(brandingQuery.data.company_name ?? "");
    setCompanySubtitle(brandingQuery.data.company_subtitle ?? "");
  }, [brandingQuery.data]);

  const previewPalette = useMemo(() => {
    const hex = accentColor.toLowerCase();
    if (!/^#([0-9a-f]{6})$/.test(hex)) {
      return brandingQuery.data?.color_palette ?? {};
    }

    const toRgb = (value: string) => ({
      r: parseInt(value.slice(1, 3), 16),
      g: parseInt(value.slice(3, 5), 16),
      b: parseInt(value.slice(5, 7), 16),
    });
    const mix = (base: number, target: number, ratio: number) =>
      Math.round(base + (target - base) * ratio);
    const toHex = (r: number, g: number, b: number) =>
      `#${[r, g, b]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("")}`;

    const base = toRgb(hex);
    const lightMix: Record<string, number> = {
      "50": 0.9227,
      "100": 0.8365,
      "200": 0.6845,
      "300": 0.5216,
      "400": 0.3582,
    };
    const darkMix: Record<string, number> = {
      "600": 0.1794,
      "700": 0.354,
      "800": 0.4973,
      "900": 0.6504,
    };

    const palette: Record<string, string> = {};
    Object.entries(lightMix).forEach(([key, ratio]) => {
      palette[key] = toHex(
        mix(base.r, 255, ratio),
        mix(base.g, 255, ratio),
        mix(base.b, 255, ratio),
      );
    });
    palette["500"] = hex;
    Object.entries(darkMix).forEach(([key, ratio]) => {
      palette[key] = toHex(
        mix(base.r, 0, ratio),
        mix(base.g, 0, ratio),
        mix(base.b, 0, ratio),
      );
    });
    return palette;
  }, [accentColor, brandingQuery.data?.color_palette]);

  const resolvedLogo = useMemo(() => {
    if (logoFile) {
      return URL.createObjectURL(logoFile);
    }
    const logo = brandingQuery.data?.logo ?? null;
    if (!logo) return null;
    if (logo.startsWith("http")) return logo;
    const base = apiClient.defaults.baseURL || window.location.origin;
    return `${base}${logo}?v=${logoVersion}`;
  }, [brandingQuery.data?.logo, logoVersion, logoFile]);

  useEffect(() => {
    return () => {
      if (logoFile) {
        URL.revokeObjectURL(resolvedLogo ?? "");
      }
    };
  }, [logoFile, resolvedLogo]);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateBranding(tenantId as number, {
        accentColor,
        logoFile,
        companyName,
        companySubtitle,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["tenant-branding", tenantId], data);
      queryClient.invalidateQueries({ queryKey: ["tenant-branding", tenantId] });
      queryClient.invalidateQueries({
        queryKey: ["tenant-branding-shell", tenantId],
      });
      queryClient.invalidateQueries({
        queryKey: ["tenant-branding-global", tenantId],
      });
      setLogoVersion(Date.now());
      setLogoFile(null);
      toast({
        title: t("branding.messages.updateSuccessTitle"),
        description: t("branding.messages.updateSuccessDesc"),
        status: "success",
      });
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ??
        t("branding.messages.updateErrorFallback");
      toast({
        title: t("branding.messages.updateErrorTitle"),
        description: detail,
        status: "error",
      });
    },
  });

  const handleTenantChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value);
    setSelectedTenantId(Number.isNaN(id) ? null : id);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    updateMutation.mutate();
  };

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
        <Stack position="relative" spacing={2} maxW="640px">
          <Text textTransform="uppercase" fontSize="xs" letterSpacing="0.2em">
            {t("branding.header.eyebrow")}
          </Text>
          <Heading size="lg">{t("branding.header.title")}</Heading>
          <Text fontSize="sm" opacity={0.9}>
            {t("branding.header.subtitle")}
          </Text>
        </Stack>
      </Box>

      {isSuperAdmin && (
        <Box mb={6}>
          <FormControl maxW="320px">
            <FormLabel>{t("branding.fields.tenant")}</FormLabel>
            <Select
              placeholder={
                isLoadingTenants
                  ? t("branding.fields.loadingTenants")
                  : t("branding.fields.selectTenant")
              }
              value={selectedTenantId ?? ""}
              onChange={handleTenantChange}
              isDisabled={isLoadingTenants || isErrorTenants}
            >
              {tenants?.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} ({tenant.subdomain})
                </option>
              ))}
            </Select>
            {isErrorTenants && (
              <Text mt={2} color="red.500" fontSize="sm">
                {t("branding.messages.loadTenantsError")}
              </Text>
            )}
          </FormControl>
        </Box>
      )}

      <Box
        as="form"
        onSubmit={handleSubmit}
        bg={cardBg}
        borderWidth="1px"
        borderRadius="xl"
        p={{ base: 4, md: 6 }}
      >
        {!tenantId && (
          <Text color={subtleText}>{t("branding.messages.selectTenant")}</Text>
        )}
        {tenantId && brandingQuery.isLoading && (
          <Text>{t("branding.messages.loading")}</Text>
        )}
        {tenantId && brandingQuery.isError && (
          <Text color="red.500">{t("branding.messages.loadError")}</Text>
        )}

        {tenantId && brandingQuery.data && (
          <Stack spacing={5}>
            <FormControl>
              <FormLabel>{t("branding.fields.logo")}</FormLabel>
              <HStack spacing={4} align="center">
                <Box
                  borderWidth="1px"
                  borderRadius="md"
                  p={3}
                  bg={logoPreviewBg}
                >
                  {resolvedLogo ? (
                    <Image
                      src={resolvedLogo}
                      alt="logo"
                      maxH="80px"
                      maxW="200px"
                      objectFit="contain"
                    />
                  ) : (
                    <Text fontSize="sm" color={subtleText}>
                      {t("branding.fields.noLogo")}
                    </Text>
                  )}
                </Box>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                />
              </HStack>
            </FormControl>

            <FormControl maxW="420px">
              <FormLabel>{t("branding.fields.companyName")}</FormLabel>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </FormControl>

            <FormControl maxW="520px">
              <FormLabel>{t("branding.fields.companySubtitle")}</FormLabel>
              <Input
                value={companySubtitle}
                onChange={(e) => setCompanySubtitle(e.target.value)}
              />
            </FormControl>

            <FormControl maxW="220px">
              <FormLabel>{t("branding.fields.accentColor")}</FormLabel>
              <HStack>
                <Input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  w="64px"
                  p={0}
                />
                <Input
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                />
              </HStack>
            </FormControl>

            <Box>
              <Text fontSize="sm" color={subtleText} mb={2}>
                {t("branding.fields.palette")}
              </Text>
              <SimpleGrid columns={{ base: 2, md: 5 }} spacing={3}>
                {Object.entries(previewPalette).map(([key, value]) => {
                  const keyNum = Number(key);
                  const labelColor = keyNum <= 400 ? "#111" : "white";
                  return (
                    <Box
                      key={key}
                      borderWidth="1px"
                      borderRadius="md"
                      p={3}
                      bg={value}
                    >
                      <Text fontSize="xs" color={labelColor}>
                        {key}: {value}
                      </Text>
                    </Box>
                  );
                })}
              </SimpleGrid>
            </Box>

            <Button
              type="submit"
              colorScheme="green"
              alignSelf="flex-start"
              isLoading={updateMutation.isPending}
            >
              {t("branding.actions.save")}
            </Button>
          </Stack>
        )}
      </Box>
    </AppShell>
  );
};
