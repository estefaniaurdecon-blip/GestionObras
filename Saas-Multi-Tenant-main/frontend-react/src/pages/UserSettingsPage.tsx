import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Stack,
  Switch,
  Text,
  useColorMode,
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";

import { AppShell } from "../components/layout/AppShell";
import { apiClient } from "../api/client";
import type { CurrentUser } from "../api/users";

interface MeResponse extends CurrentUser {
  created_at: string;
}

export const UserSettingsPage: React.FC = () => {
  const toast = useToast();
  const { colorMode, setColorMode } = useColorMode();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
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
      } catch (error: any) {
        const detail =
          error?.response?.data?.detail ??
          "No se ha podido cargar la información de usuario.";
        toast({
          title: "Error al cargar perfil",
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
      });

      localStorage.setItem("current_user", JSON.stringify(response.data));

      toast({
        title: "Perfil actualizado",
        description: "Tu información de usuario se ha guardado correctamente.",
        status: "success",
      });
    } catch (error: any) {
      const detail =
        error?.response?.data?.detail ??
        "No se ha podido actualizar tu perfil (revisa los datos).";
      toast({
        title: "Error al actualizar perfil",
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
        title: "Datos incompletos",
        description: "Rellena todos los campos de contraseña.",
        status: "warning",
      });
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      toast({
        title: "Contraseña no coincide",
        description: "La nueva contraseña y su confirmación deben ser iguales.",
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
        title: "Contraseña actualizada",
        description:
          "Tu contraseña se ha cambiado correctamente. Úsala en tu próximo inicio de sesión.",
        status: "success",
      });
    } catch (error: any) {
      const detail =
        error?.response?.data?.detail ??
        "No se ha podido cambiar la contraseña.";
      toast({
        title: "Error al cambiar contraseña",
        description: detail,
        status: "error",
      });
    }
  };

  return (
    <AppShell>
      <Heading mb={4}>Ajustes de usuario</Heading>
      <Text mb={6}>
        Configura tu información básica de perfil, tu contraseña y tus
        preferencias de apariencia.
      </Text>

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
            Perfil
          </Heading>
          <Stack spacing={4}>
            <FormControl>
              <FormLabel color={labelColor}>Correo electrónico</FormLabel>
              <Input value={email} isReadOnly />
            </FormControl>
            <FormControl isRequired>
              <FormLabel color={labelColor}>Nombre completo</FormLabel>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                isDisabled={loading}
              />
            </FormControl>
            <FormControl display="flex" alignItems="center">
              <FormLabel mb="0" color={labelColor}>
                Modo oscuro
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
              Guardar cambios
            </Button>
          </Stack>
        </Box>

        <Box borderWidth="1px" borderRadius="md" p={6} bg={cardBg}>
          <Heading as="h3" size="sm" mb={4}>
            Cambiar contraseña
          </Heading>
          <Stack spacing={4}>
            <FormControl isRequired>
              <FormLabel color={labelColor}>Contraseña actual</FormLabel>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel color={labelColor}>Nueva contraseña</FormLabel>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel color={labelColor}>Repetir nueva contraseña</FormLabel>
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
              Actualizar contraseña
            </Button>
          </Stack>
        </Box>
      </Stack>
    </AppShell>
  );
}

