import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Select,
  Stack,
  Text,
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { AppShell } from "../components/layout/AppShell";
import { PageHero } from "../components/layout/PageHero";
import { fetchBranding, updateBranding } from "../api/branding";
import { fetchAllTenants, type TenantOption } from "../api/users";
import { useCurrentUser } from "../hooks/useCurrentUser";

export const TenantDepartmentEmailsPage: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = currentUser?.is_super_admin === true;

  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [departmentEmails, setDepartmentEmails] = useState<
    Array<{ department: string; email: string }>
  >([]);

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
    queryKey: ["tenants-for-department-emails"],
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
    const loadedDepartments = Object.entries(
      brandingQuery.data.department_emails ?? {},
    ).map(([department, email]) => ({
      department,
      email,
    }));
    setDepartmentEmails(loadedDepartments);
  }, [brandingQuery.data]);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateBranding(tenantId as number, {
        departmentEmails: departmentEmails.reduce<Record<string, string>>(
          (acc, item) => {
            const key = item.department.trim();
            const email = item.email.trim();
            if (!key || !email) return acc;
            acc[key] = email;
            return acc;
          },
          {},
        ),
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
      toast({
        title: t("branding.messages.updateSuccessTitle"),
        description: t("branding.messages.updateSuccessDesc"),
        status: "success",
      });
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ?? t("branding.messages.updateErrorFallback");
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

  const handleDepartmentChange = (
    index: number,
    field: "department" | "email",
    value: string,
  ) => {
    setDepartmentEmails((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, [field]: value } : item,
      ),
    );
  };

  const handleAddDepartmentEmail = () => {
    setDepartmentEmails((prev) => [...prev, { department: "", email: "" }]);
  };

  const handleRemoveDepartmentEmail = (index: number) => {
    setDepartmentEmails((prev) => prev.filter((_, idx) => idx !== index));
  };

  return (
    <AppShell>
      <Box animation={`${fadeUp} 0.6s ease-out`} mb={8}>
        <PageHero
          eyebrow={t("branding.header.eyebrow")}
          title={t("branding.departmentEmails.title")}
          subtitle={t("branding.departmentEmails.subtitle")}
        />
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
          <Stack spacing={4}>
            <HStack justify="flex-end">
              <Button
                size="sm"
                variant="outline"
                onClick={handleAddDepartmentEmail}
              >
                {t("branding.departmentEmails.add")}
              </Button>
            </HStack>
            {departmentEmails.length === 0 && (
              <Text fontSize="sm" color={subtleText}>
                {t("branding.departmentEmails.empty")}
              </Text>
            )}
            {departmentEmails.map((item, index) => (
              <HStack key={`dept-email-${index}`} align="flex-end">
                <FormControl>
                  <FormLabel fontSize="xs">
                    {t("branding.departmentEmails.department")}
                  </FormLabel>
                  <Input
                    size="sm"
                    value={item.department}
                    onChange={(e) =>
                      handleDepartmentChange(
                        index,
                        "department",
                        e.target.value,
                      )
                    }
                  />
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="xs">
                    {t("branding.departmentEmails.email")}
                  </FormLabel>
                  <Input
                    size="sm"
                    type="email"
                    value={item.email}
                    onChange={(e) =>
                      handleDepartmentChange(index, "email", e.target.value)
                    }
                  />
                </FormControl>
                <Button
                  size="sm"
                  variant="ghost"
                  colorScheme="red"
                  onClick={() => handleRemoveDepartmentEmail(index)}
                >
                  {t("branding.departmentEmails.remove")}
                </Button>
              </HStack>
            ))}

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
