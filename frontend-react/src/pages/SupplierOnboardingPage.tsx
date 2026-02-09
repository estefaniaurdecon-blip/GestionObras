import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Stack,
  Text,
  useToast,
} from "@chakra-ui/react";
import { useRouter } from "@tanstack/react-router";

import {
  submitSupplierOnboarding,
  validateSupplierOnboarding,
  type Supplier,
} from "../api/contracts";

interface SupplierFormState {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  contact_name: string;
  bank_iban: string;
  bank_bic: string;
}

const buildFormState = (supplier?: Supplier): SupplierFormState => ({
  name: supplier?.name ?? "",
  email: supplier?.email ?? "",
  phone: supplier?.phone ?? "",
  address: supplier?.address ?? "",
  city: supplier?.city ?? "",
  postal_code: supplier?.postal_code ?? "",
  country: supplier?.country ?? "",
  contact_name: supplier?.contact_name ?? "",
  bank_iban: supplier?.bank_iban ?? "",
  bank_bic: supplier?.bank_bic ?? "",
});

export const SupplierOnboardingPage: React.FC = () => {
  const router = useRouter();
  const toast = useToast();
  const token = useMemo(() => {
    const search = router.state.location.search ?? "";
    const params = new URLSearchParams(search);
    return params.get("token") ?? "";
  }, [router.state.location.search]);

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierFormState>(buildFormState());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    validateSupplierOnboarding(token)
      .then((data) => {
        setSupplier(data.supplier);
        setForm(buildFormState(data.supplier));
      })
      .catch(() => {
        toast({
          title: "Enlace no valido",
          description: "No se pudo validar la invitacion del proveedor.",
          status: "error",
        });
      })
      .finally(() => setIsLoading(false));
  }, [token, toast]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsSaving(true);
    try {
      const updated = await submitSupplierOnboarding(token, form);
      setSupplier(updated);
      toast({
        title: "Datos guardados",
        description: "Gracias. La informacion del proveedor fue actualizada.",
        status: "success",
      });
    } catch {
      toast({
        title: "Error al guardar",
        description: "No se pudo actualizar la informacion del proveedor.",
        status: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Box minH="100vh" display="flex" alignItems="center" justifyContent="center">
        <Text>Validando enlace...</Text>
      </Box>
    );
  }

  if (!supplier) {
    return (
      <Box minH="100vh" display="flex" alignItems="center" justifyContent="center">
        <Text>Invitacion no valida o expirada.</Text>
      </Box>
    );
  }

  return (
    <Box minH="100vh" bg="gray.50" py={{ base: 10, md: 16 }} px={6}>
      <Box
        maxW="720px"
        mx="auto"
        bg="white"
        borderRadius="2xl"
        p={{ base: 6, md: 10 }}
        boxShadow="xl"
      >
        <Stack spacing={6} as="form" onSubmit={handleSubmit}>
          <Stack spacing={1}>
            <Heading size="lg">Completar datos del proveedor</Heading>
            <Text color="gray.600">
              CIF/NIF: <strong>{supplier.tax_id}</strong>
            </Text>
          </Stack>

          <FormControl isRequired>
            <FormLabel>Empresa</FormLabel>
            <Input name="name" value={form.name} onChange={handleChange} />
          </FormControl>
          <FormControl isRequired>
            <FormLabel>Email</FormLabel>
            <Input name="email" type="email" value={form.email} onChange={handleChange} />
          </FormControl>
          <FormControl>
            <FormLabel>Telefono</FormLabel>
            <Input name="phone" value={form.phone} onChange={handleChange} />
          </FormControl>
          <FormControl>
            <FormLabel>Direccion</FormLabel>
            <Input name="address" value={form.address} onChange={handleChange} />
          </FormControl>
          <FormControl>
            <FormLabel>Ciudad</FormLabel>
            <Input name="city" value={form.city} onChange={handleChange} />
          </FormControl>
          <FormControl>
            <FormLabel>Codigo postal</FormLabel>
            <Input name="postal_code" value={form.postal_code} onChange={handleChange} />
          </FormControl>
          <FormControl>
            <FormLabel>Pais</FormLabel>
            <Input name="country" value={form.country} onChange={handleChange} />
          </FormControl>
          <FormControl>
            <FormLabel>Persona de contacto</FormLabel>
            <Input name="contact_name" value={form.contact_name} onChange={handleChange} />
          </FormControl>
          <FormControl>
            <FormLabel>IBAN</FormLabel>
            <Input name="bank_iban" value={form.bank_iban} onChange={handleChange} />
          </FormControl>
          <FormControl>
            <FormLabel>BIC</FormLabel>
            <Input name="bank_bic" value={form.bank_bic} onChange={handleChange} />
          </FormControl>

          <Button type="submit" colorScheme="green" isLoading={isSaving}>
            Guardar datos
          </Button>
        </Stack>
      </Box>
    </Box>
  );
};

export default SupplierOnboardingPage;
