import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  Input,
  InputGroup,
  InputRightElement,
  Stack,
  Text,
  useColorModeValue,
  useToast,
  IconButton,
} from "@chakra-ui/react";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

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
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toast = useToast();
  const router = useRouter();
  const { t } = useTranslation();

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
    if (!fullName.trim() || !password || !passwordConfirm) {
      toast({
        title: t("invitation.messages.passwordMissingTitle"),
        description: t("invitation.messages.passwordMissingDesc"),
        status: "warning",
      });
      return;
    }
    if (password !== passwordConfirm) {
      toast({
        title: t("invitation.messages.passwordMismatchTitle"),
        description: t("invitation.messages.passwordMismatchDesc"),
        status: "warning",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await acceptInvitation({
        token,
        full_name: fullName,
        password,
        password_confirm: passwordConfirm,
      });
      toast({
        title: t("invitation.messages.successTitle"),
        description: t("invitation.messages.successDesc"),
        status: "success",
      });
      router.history.push("/");
    } catch (error: any) {
      const detail =
        error?.response?.data?.detail ??
        t("invitation.messages.errorFallback");
      toast({
        title: t("invitation.messages.errorTitle"),
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
          {t("invitation.title")}
        </Heading>
        <Text fontSize="sm" color={subtitleColor} mb={6}>
          {t("invitation.subtitle")}
        </Text>

        {isLoading && <Text>{t("invitation.loading")}</Text>}

        {!isLoading && invalid && (
          <Text color="red.400">
            {t("invitation.invalid")}
          </Text>
        )}

        {!isLoading && !invalid && validation && (
          <form onSubmit={handleSubmit}>
            <Stack spacing={4}>
              <Box fontSize="sm" mb={2}>
                <Text>
                  {t("invitation.labels.tenant")}{" "}
                  <strong>{validation.tenant_name}</strong>
                </Text>
                <Text>
                  {t("invitation.labels.email")}{" "}
                  <strong>{validation.email}</strong>
                </Text>
                <Text>
                  {t("invitation.labels.role")}{" "}
                  <strong>{validation.role_name}</strong>
                </Text>
              </Box>

              <FormControl isRequired>
                <FormLabel>{t("invitation.fields.fullName")}</FormLabel>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>{t("invitation.fields.password")}</FormLabel>
                <InputGroup>
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <InputRightElement>
                    <IconButton
                      aria-label={
                        showPassword ? "Ocultar contrasena" : "Mostrar contrasena"
                      }
                      variant="ghost"
                      size="sm"
                      icon={showPassword ? <FiEyeOff /> : <FiEye />}
                      onClick={() => setShowPassword((prev) => !prev)}
                    />
                  </InputRightElement>
                </InputGroup>
              </FormControl>
              <FormControl isRequired>
                <FormLabel>{t("invitation.fields.passwordConfirm")}</FormLabel>
                <InputGroup>
                  <Input
                    type={showPasswordConfirm ? "text" : "password"}
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                  />
                  <InputRightElement>
                    <IconButton
                      aria-label={
                        showPasswordConfirm
                          ? "Ocultar contrasena"
                          : "Mostrar contrasena"
                      }
                      variant="ghost"
                      size="sm"
                      icon={showPasswordConfirm ? <FiEyeOff /> : <FiEye />}
                      onClick={() => setShowPasswordConfirm((prev) => !prev)}
                    />
                  </InputRightElement>
                </InputGroup>
              </FormControl>
              <Button
                type="submit"
                colorScheme="green"
                isLoading={isSubmitting}
              >{t("invitation.actions.createAccount")}</Button>
            </Stack>
          </form>
        )}
      </Box>
    </Box>
  );
};
