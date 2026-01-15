import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Stack,
  Text,
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";
import { useRouter } from "@tanstack/react-router";

import {
  acceptInvitation,
  validateInvitation,
  type InvitationValidation,
} from "../api/users";

export const AcceptInvitationPage: React.FC = () => {
  const [token] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("token");
  });

  const [validation, setValidation] = useState<InvitationValidation | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toast = useToast();
  const router = useRouter();

  const pageBg = useColorModeValue("gray.50", "gray.900");
  const cardBg = useColorModeValue("white", "gray.800");
  const subtitleColor = useColorModeValue("gray.500", "gray.300");

  useEffect(() => {
    if (!token) return;
    setIsLoading(true);
    validateInvitation(token)
      .then((data) => {
        setValidation(data);
        if (data.full_name) {
          setFullName(data.full_name);
        }
      })
      .catch(() => {
        setValidation(null);
      })
      .finally(() => setIsLoading(false));
  }, [token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;

    setIsSubmitting(true);
    try {
      await acceptInvitation({
        token,
        full_name: fullName,
        password,
      });
      toast({
        title: "Cuenta creada",
        description: "Ya puedes iniciar sesión con tus credenciales.",
        status: "success",
      });
      router.history.push("/");
    } catch (error: any) {
      const detail =
        error?.response?.data?.detail ??
        "No se ha podido completar la invitación.";
      toast({
        title: "Error al aceptar invitación",
        description: detail,
        status: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const invalid =
    !token ||
    !validation ||
    !validation.is_valid ||
    validation.is_expired ||
    validation.is_used;

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
        maxW="480px"
      >
        <Heading size="lg" mb={2}>
          Aceptar invitación
        </Heading>
        <Text fontSize="sm" color={subtitleColor} mb={6}>
          Completa tus datos para activar tu usuario en la plataforma.
        </Text>

        {isLoading && <Text>Cargando información de la invitación…</Text>}

        {!isLoading && invalid && (
          <Text color="red.400">
            La invitación no es válida (puede estar caducada o ya usada).
          </Text>
        )}

        {!isLoading && !invalid && validation && (
          <form onSubmit={handleSubmit}>
            <Stack spacing={4}>
              <Box fontSize="sm" mb={2}>
                <Text>
                  Tenant: <strong>{validation.tenant_name}</strong>
                </Text>
                <Text>
                  Email invitado: <strong>{validation.email}</strong>
                </Text>
                <Text>
                  Rol: <strong>{validation.role_name}</strong>
                </Text>
              </Box>

              <FormControl isRequired>
                <FormLabel>Nombre completo</FormLabel>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Contraseña</FormLabel>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </FormControl>
              <Button
                type="submit"
                colorScheme="green"
                isLoading={isSubmitting}
              >
                Crear cuenta
              </Button>
            </Stack>
          </form>
        )}
      </Box>
    </Box>
  );
};

