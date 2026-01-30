import React, { useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  Image,
  Input,
  Stack,
  Text,
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";
import { useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";

import { login } from "../api/auth";

/**
 * Pantalla de login inicial.
 *
 * Flujo:
 * 1. Usuario introduce email + password.
 * 2. Si el backend indica `mfa_required = true`, navegamos a /mfa.
 * 3. Si devuelve directamente el token, guardamos y vamos al dashboard.
 */

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const pageBg = useColorModeValue("gray.50", "gray.900");
  const cardBg = useColorModeValue("white", "gray.800");
  const labelColor = useColorModeValue("gray.700", "gray.100");
  const subtitleColor = useColorModeValue("gray.500", "gray.300");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      const result = await login(email, password);

      if (result.mfa_required) {
        // Guardamos el username temporalmente para MFA.
        sessionStorage.setItem("mfa_username", email);
        queryClient.clear();
        router.history.push("/mfa");
        return;
      }

      if (result.access_token) {
        queryClient.clear();
        router.history.push("/dashboard");
        return;
      }

      toast({
        title: t("auth.messages.unexpectedTitle"),
        description: t("auth.messages.unexpectedDesc"),
        status: "error",
      });
    } catch (error: any) {
      const backendMessage =
        error?.response?.data?.detail ??
        t("auth.messages.invalidFallback");
      toast({
        title: t("auth.messages.loginErrorTitle"),
        description: backendMessage,
        status: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box
      minH="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg={pageBg}
      px={4}
    >
      <Box
        bg={cardBg}
        p={8}
        rounded="md"
        shadow="md"
        width="100%"
        maxW="420px"
      >
        <Stack spacing={6} align="center" mb={4}>
          <Image
            src="/logo-urdecon.svg"
            alt={t("auth.logoAlt")}
            boxSize="56px"
            objectFit="contain"
          />
          <Box textAlign="center">
            <Heading size="lg" mb={1}>
              {t("auth.login.title")}
            </Heading>
            <Text fontSize="sm" color={subtitleColor}>
              {t("auth.login.subtitle")}
            </Text>
          </Box>
        </Stack>

        <form onSubmit={handleSubmit}>
          <Stack spacing={4}>
            <FormControl isRequired>
              <FormLabel htmlFor="email" color={labelColor}>
                {t("auth.login.email")}
              </FormLabel>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel htmlFor="password" color={labelColor}>
                {t("auth.login.password")}
              </FormLabel>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormControl>
            <Button type="submit" colorScheme="blue" isLoading={isLoading}>
              {t("auth.login.submit")}
            </Button>
          </Stack>
        </form>
      </Box>
    </Box>
  );
};

