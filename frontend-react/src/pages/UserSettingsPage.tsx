import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Select,
  Stack,
  Switch,
  Text,
  useColorMode,
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import { AppShell } from "../components/layout/AppShell";
import { apiClient } from "../api/client";
import type { CurrentUser } from "../api/users";

interface MeResponse extends CurrentUser {
  created_at: string;
}

export const UserSettingsPage: React.FC = () => {
  const toast = useToast();
  const { t, i18n } = useTranslation();
  const { colorMode, setColorMode } = useColorMode();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState("en");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");

  const cardBg = useColorModeValue("white", "gray.700");
  const labelColor = useColorModeValue("gray.700", "gray.100");

  useEffect(() => {
    const loadMe = async () => {
      try {
        const response = await apiClient.get<MeResponse>("/api/v1/users/me");
        setEmail(response.data.email);
        setFullName(response.data.full_name ?? "");
        const preferredLanguage =
          response.data.language ?? i18n.language ?? "en";
        setLanguage(preferredLanguage);
        i18n.changeLanguage(preferredLanguage);
      } catch (error: any) {
        const detail =
          error?.response?.data?.detail ??
          t("settings.messages.loadErrorFallback");
        toast({
          title: t("settings.messages.loadErrorTitle"),
          description: detail,
          status: "error",
        });
      } finally {
        setLoading(false);
      }
    };

    loadMe();
  }, [toast]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await apiClient.patch<MeResponse>("/api/v1/users/me", {
        full_name: fullName,
        language,
      });


      toast({
        title: t("settings.messages.profileUpdatedTitle"),
        description: t("settings.messages.profileUpdatedDesc"),
        status: "success",
      });
    } catch (error: any) {
      const detail =
        error?.response?.data?.detail ??
        t("settings.messages.profileUpdateErrorFallback");
      toast({
        title: t("settings.messages.profileUpdateErrorTitle"),
        description: detail,
        status: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDarkMode = () => {
    setColorMode(colorMode === "light" ? "dark" : "light");
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !newPasswordConfirm) {
      toast({
        title: t("settings.messages.passwordMissingTitle"),
        description: t("settings.messages.passwordMissingDesc"),
        status: "warning",
      });
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      toast({
        title: t("settings.messages.passwordMismatchTitle"),
        description: t("settings.messages.passwordMismatchDesc"),
        status: "warning",
      });
      return;
    }

    try {
      await apiClient.post("/api/v1/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirm: newPasswordConfirm,
      });
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      toast({
        title: t("settings.messages.passwordUpdatedTitle"),
        description: t("settings.messages.passwordUpdatedDesc"),
        status: "success",
      });
    } catch (error: any) {
      const detail =
        error?.response?.data?.detail ??
        t("settings.messages.passwordUpdateErrorFallback");
      toast({
        title: t("settings.messages.passwordUpdateErrorTitle"),
        description: detail,
        status: "error",
      });
    }
  };

  return (
    <AppShell>
      <Heading mb={4}>{t("settings.title")}</Heading>
      <Text mb={6}>{t("settings.subtitle")}</Text>

      <Stack spacing={8} maxW="640px">
        <Box
          as="form"
          onSubmit={handleSaveProfile}
          borderWidth="1px"
          borderRadius="md"
          p={6}
          bg={cardBg}
        >
          <Heading as="h3" size="sm" mb={4}>
            {t("settings.profile")}
          </Heading>
          <Stack spacing={4}>
            <FormControl>
              <FormLabel color={labelColor}>{t("settings.email")}</FormLabel>
              <Input value={email} isReadOnly />
            </FormControl>
            <FormControl isRequired>
              <FormLabel color={labelColor}>{t("settings.fullName")}</FormLabel>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                isDisabled={loading}
              />
            </FormControl>
            {/* Preferencia de idioma sincronizada con i18n y backend. */}
            <FormControl>
              <FormLabel color={labelColor}>{t("settings.language")}</FormLabel>
              <Select
                value={language}
                onChange={(e) => {
                  const nextLanguage = e.target.value;
                  setLanguage(nextLanguage);
                  i18n.changeLanguage(nextLanguage);
                }}
              >
                <option value="en">{t("settings.languageOptions.en")}</option>
                <option value="es">{t("settings.languageOptions.es")}</option>
              </Select>
              <Text fontSize="xs" color={labelColor} mt={1}>
                {t("settings.languageHelp")}
              </Text>
            </FormControl>
            <FormControl display="flex" alignItems="center">
              <FormLabel mb="0" color={labelColor}>
                {t("settings.darkMode")}
              </FormLabel>
              <Switch
                isChecked={colorMode === "dark"}
                onChange={handleToggleDarkMode}
              />
            </FormControl>

            <Button
              type="submit"
              colorScheme="blue"
              isLoading={saving}
              isDisabled={loading}
              alignSelf="flex-start"
            >
              {t("settings.saveProfile")}
            </Button>
          </Stack>
        </Box>

        <Box borderWidth="1px" borderRadius="md" p={6} bg={cardBg}>
          <Heading as="h3" size="sm" mb={4}>
            {t("settings.password")}
          </Heading>
          <Stack spacing={4}>
            <FormControl isRequired>
              <FormLabel color={labelColor}>{t("settings.currentPassword")}</FormLabel>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel color={labelColor}>{t("settings.newPassword")}</FormLabel>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel color={labelColor}>{t("settings.confirmPassword")}</FormLabel>
              <Input
                type="password"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
              />
            </FormControl>
            <Button
              type="button"
              colorScheme="blue"
              variant="outline"
              alignSelf="flex-start"
              onClick={handleChangePassword}
            >
              {t("settings.updatePassword")}
            </Button>
          </Stack>
        </Box>
      </Stack>
    </AppShell>
  );
}

