import React, { useState } from "react";
import {
  Box,
  Button,
  Heading,
  Input,
  Stack,
  Text,
  useToast,
} from "@chakra-ui/react";
import { useRouter } from "@tanstack/react-router";

import { verifyMFA } from "../api/auth";

/**
 * Pantalla para introducir el código MFA enviado por correo.
 *
 * El backend valida el código y, si es correcto, devuelve el token final.
 */

export const MFAVerifyPage: React.FC = () => {
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();
  const router = useRouter();

  const username = sessionStorage.getItem("mfa_username") ?? "";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      const result = await verifyMFA(username, code);
      localStorage.setItem("access_token", result.access_token);
      sessionStorage.removeItem("mfa_username");
      router.history.push("/dashboard");
    } catch (error) {
      toast({
        title: "Error MFA",
        description: "Código incorrecto o expirado",
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
      bg="gray.50"
    >
      <Box bg="white" p={8} rounded="md" shadow="md" width="100%" maxW="400px">
        <Heading mb={6} size="lg" textAlign="center">
          Verificación MFA
        </Heading>
        <Text mb={4} textAlign="center">
          Introduce el código de verificación que hemos enviado a tu correo electrónico.
        </Text>
        <form onSubmit={handleSubmit}>
          <Stack spacing={4}>
            <Box>
              <Text mb={1}>Código MFA</Text>
              <Input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </Box>
            <Button type="submit" colorScheme="blue" isLoading={isLoading}>
              Verificar
            </Button>
          </Stack>
        </form>
      </Box>
    </Box>
  );
};

