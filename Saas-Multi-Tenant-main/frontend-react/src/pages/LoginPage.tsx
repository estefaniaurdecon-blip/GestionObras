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
        router.history.push("/mfa");
        return;
      }

      if (result.access_token) {
        localStorage.setItem("access_token", result.access_token);

        router.history.push("/dashboard");
        return;
      }

      toast({
        title: "Error",
        description: "Respuesta de autenticación inesperada",
        status: "error",
      });
    } catch (error: any) {
      const backendMessage =
        error?.response?.data?.detail ??
        "Credenciales incorrectas o error de servidor";
      toast({
        title: "Error de login",
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
            alt="Logo Urdecon"
            boxSize="56px"
            objectFit="contain"
          />
          <Box textAlign="center">
            <Heading size="lg" mb={1}>
              Acceso a URDECON INNOVA
            </Heading>
            <Text fontSize="sm" color={subtitleColor}>
              Inicia sesión con tu usuario corporativo
            </Text>
          </Box>
        </Stack>

        <form onSubmit={handleSubmit}>
          <Stack spacing={4}>
            <FormControl isRequired>
              <FormLabel htmlFor="email" color={labelColor}>
                Email
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
                Contraseña
              </FormLabel>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormControl>
            <Button type="submit" colorScheme="blue" isLoading={isLoading}>
              Entrar
            </Button>
          </Stack>
        </form>
      </Box>
    </Box>
  );
};

