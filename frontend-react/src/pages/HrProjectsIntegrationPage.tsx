import React, { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Collapse,
  Divider,
  Flex,
  Heading,
  HStack,
  Icon,
  Input,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Progress,
  SimpleGrid,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
  VStack,
} from "@chakra-ui/react";
import {
  FiAlertCircle,
  FiAlertTriangle,
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiPlus,
  FiX,
} from "react-icons/fi";

import { AppShell } from "../components/layout/AppShell";

type Employee = {
  id: number;
  nombre: string;
  apellido: string;
  puesto: string;
  departamento: string;
  costoHora: number;
};

type Disponibilidad = {
  horasBase: number;
  porcentaje: number;
};

type Disponibilidades = Record<number, Record<number, Disponibilidad>>;

type Proyecto = {
  id: number;
  codigo: string;
  nombre: string;
  año: number;
  hitos: string[];
  datos: Record<string, { horasJustificar: number; horasJustificadas: number }>;
  asignaciones: Record<number, Record<string, number>>;
};

type EstadoDisponibilidad =
  | { estado: "normal"; usado: number; disponibles: number; porcentaje: number }
  | { estado: "alerta"; usado: number; disponibles: number; porcentaje: number }
  | { estado: "sobrecarga"; usado: number; disponibles: number; porcentaje: number };

const calcularDisponibilidad = (horasBase: number, porcentaje: number) =>
  Math.round((horasBase * porcentaje) / 100);

export const HrProjectsIntegrationPage: React.FC = () => {
  const cardBg = useColorModeValue("white", "gray.800");
  const mutedText = useColorModeValue("gray.600", "gray.300");
  const tableStriped = useColorModeValue("gray.50", "gray.700");

  const [tab, setTab] = useState<"tabla" | "rrhh">("tabla");
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});
  const [showAsignacion, setShowAsignacion] = useState<number | null>(null);

  const [empleados] = useState<Employee[]>([
    { id: 1, nombre: "Carlos Manuel", apellido: "Alcaraz Hernández", puesto: "Arquitecto", departamento: "Jurídico", costoHora: 45 },
    { id: 2, nombre: "Dimas Israel", apellido: "Alvarez Hernández", puesto: "Jefe de Obra", departamento: "Estudios", costoHora: 34 },
    { id: 3, nombre: "Ana Isabel", apellido: "Belijar Rubio", puesto: "Investigador", departamento: "Estudios", costoHora: 17 },
    { id: 4, nombre: "Luis García", apellido: "López Martín", puesto: "Técnico", departamento: "Investigación", costoHora: 28 },
  ]);

  const [disponibilidades, setDisponibilidades] = useState<Disponibilidades>({
    1: { 2024: { horasBase: 1800, porcentaje: 100 } },
    2: { 2024: { horasBase: 1800, porcentaje: 100 } },
    3: { 2024: { horasBase: 1800, porcentaje: 30 } },
    4: { 2024: { horasBase: 1800, porcentaje: 50 } },
  });

  const [proyectos, setProyectos] = useState<Proyecto[]>([
    {
      id: 1,
      codigo: "PRJ-001",
      nombre: "TECNOMR",
      año: 2024,
      hitos: ["H3", "H4", "H1", "H2"],
      datos: {
        H3: { horasJustificar: 7400, horasJustificadas: 2610 },
        H4: { horasJustificar: 3061, horasJustificadas: 3061 },
        H1: { horasJustificar: 2463, horasJustificadas: 2463 },
        H2: { horasJustificar: 4498, horasJustificadas: 1440 },
      },
      asignaciones: {
        1: { H3: 300, H4: 500, H1: 0, H2: 50 },
      },
    },
    {
      id: 2,
      codigo: "PRJ-002",
      nombre: "ECONOM",
      año: 2024,
      hitos: ["H3", "H4", "H1", "H2"],
      datos: {
        H3: { horasJustificar: 262, horasJustificadas: 0 },
        H4: { horasJustificar: 400, horasJustificadas: 400 },
        H1: { horasJustificar: 1733, horasJustificadas: 125 },
        H2: { horasJustificar: 2933, horasJustificadas: 270 },
      },
      asignaciones: {
        2: { H3: 0, H4: 0, H1: 520, H2: 0 },
      },
    },
    {
      id: 3,
      codigo: "PRJ-003",
      nombre: "PROTOTEC",
      año: 2024,
      hitos: ["H3"],
      datos: {
        H3: { horasJustificar: 7415, horasJustificadas: 7415 },
      },
      asignaciones: {
        4: { H3: 513 },
      },
    },
  ]);

  const departamentos = useMemo(() => {
    return [...new Set(empleados.map((e) => e.departamento))].sort();
  }, [empleados]);

  const coloresDepartamento: Record<string, string> = {
    Jurídico: "#1e40af",
    Estudios: "#059669",
    Investigación: "#7c3aed",
    Desarrollo: "#dc2626",
  };

  const obtenerHorasUsadas = (idEmpleado: number, año: number) =>
    proyectos
      .filter((p) => p.año === año)
      .reduce((total, proyecto) => {
        const asign = proyecto.asignaciones[idEmpleado];
        if (!asign) return total;
        return total + Object.values(asign).reduce((sum, h) => sum + (h ?? 0), 0);
      }, 0);

  const obtenerEstadoDisponibilidad = (
    idEmpleado: number,
    año: number
  ): EstadoDisponibilidad => {
    const disp = disponibilidades[idEmpleado]?.[año];
    if (!disp) return { estado: "normal", usado: 0, disponibles: 0, porcentaje: 0 };

    const horasDisponibles = calcularDisponibilidad(disp.horasBase, disp.porcentaje);
    const usado = obtenerHorasUsadas(idEmpleado, año);
    const porcentaje = horasDisponibles > 0 ? (usado / horasDisponibles) * 100 : 0;

    if (porcentaje > 100) return { estado: "sobrecarga", usado, disponibles: horasDisponibles, porcentaje };
    if (porcentaje > 85) return { estado: "alerta", usado, disponibles: horasDisponibles, porcentaje };
    return { estado: "normal", usado, disponibles: horasDisponibles, porcentaje };
  };

  const allHitos = useMemo(() => {
    const hitos = new Set<string>();
    proyectos.forEach((p) => p.hitos.forEach((h) => hitos.add(h)));
    return Array.from(hitos).sort((a, b) => Number(a.substring(1)) - Number(b.substring(1)));
  }, [proyectos]);

  const calcularTotalesHito = (hito: string, campo: "horasJustificar" | "horasJustificadas") =>
    proyectos.reduce((sum, p) => sum + (p.datos[hito]?.[campo] ?? 0), 0);

  const calcularTotalesGeneral = (campo: "horasJustificar" | "horasJustificadas") =>
    proyectos.reduce(
      (sum, p) => sum + Object.values(p.datos).reduce((s, h) => s + (h[campo] ?? 0), 0),
      0
    );

  const actualizarAsignacion = (idProyecto: number, idEmpleado: number, hito: string, horas: number) => {
    setProyectos((prev) =>
      prev.map((p) => {
        if (p.id !== idProyecto) return p;
        return {
          ...p,
          asignaciones: {
            ...p.asignaciones,
            [idEmpleado]: {
              ...p.asignaciones[idEmpleado],
              [hito]: Number.isFinite(horas) ? horas : 0,
            },
          },
        };
      })
    );
  };

  const agregarEmpleadoProyecto = (idProyecto: number, idEmpleado: number) => {
    setProyectos((prev) =>
      prev.map((p) => {
        if (p.id !== idProyecto) return p;
        const nuevoEmpleado: Record<string, number> = {};
        p.hitos.forEach((hito) => {
          nuevoEmpleado[hito] = 0;
        });
        return {
          ...p,
          asignaciones: {
            ...p.asignaciones,
            [idEmpleado]: nuevoEmpleado,
          },
        };
      })
    );
    setShowAsignacion(null);
  };

  const removerEmpleadoProyecto = (idProyecto: number, idEmpleado: number) => {
    setProyectos((prev) =>
      prev.map((p) => {
        if (p.id !== idProyecto) return p;
        const newAsign = { ...p.asignaciones };
        delete newAsign[idEmpleado];
        return { ...p, asignaciones: newAsign };
      })
    );
  };

  const actualizarDisponibilidad = (
    idEmpleado: number,
    año: number,
    campo: keyof Disponibilidad,
    valor: number
  ) => {
    setDisponibilidades((prev) => ({
      ...prev,
      [idEmpleado]: {
        ...prev[idEmpleado],
        [año]: {
          ...prev[idEmpleado]?.[año],
          [campo]: Number.isFinite(valor) ? valor : 0,
        },
      },
    }));
  };

  const resumenJustificar = calcularTotalesGeneral("horasJustificar");
  const resumenJustificadas = calcularTotalesGeneral("horasJustificadas");

  return (
    <AppShell>
      <Box p={{ base: 4, md: 6 }} maxW="1400px" mx="auto">
        <Box
          borderRadius="2xl"
          p={{ base: 6, md: 8 }}
          bgGradient="linear(120deg, var(--chakra-colors-brand-700) 0%, var(--chakra-colors-brand-500) 55%, var(--chakra-colors-brand-300) 110%)"
          color="white"
          boxShadow="lg"
          mb={8}
        >
          <Text textTransform="uppercase" fontSize="xs" letterSpacing="0.2em" opacity={0.8}>
            Gestión avanzada
          </Text>
          <Heading size="lg" mb={2}>
            Gestión Integrada de Proyectos & RRHH
          </Heading>
          <Text maxW="720px" opacity={0.9}>
            Sistema bidireccional con control automático de disponibilidad y asignación de horas.
          </Text>
        </Box>

        <HStack spacing={4} mb={6} borderBottomWidth="1px" pb={2}>
          <Button
            onClick={() => setTab("tabla")}
            variant={tab === "tabla" ? "solid" : "ghost"}
            colorScheme="blue"
          >
            📊 Tabla Integrada
          </Button>
          <Button
            onClick={() => setTab("rrhh")}
            variant={tab === "rrhh" ? "solid" : "ghost"}
            colorScheme="blue"
          >
            👥 Disponibilidad Anual
          </Button>
        </HStack>

        {tab === "rrhh" ? (
          <Stack spacing={4}>
            {empleados.map((emp) => {
              const estado = obtenerEstadoDisponibilidad(emp.id, 2024);
              const disp = disponibilidades[emp.id]?.[2024];
              const badgeColor =
                estado.estado === "sobrecarga"
                  ? "red"
                  : estado.estado === "alerta"
                    ? "yellow"
                    : "green";

              return (
                <Box key={emp.id} bg={cardBg} borderRadius="xl" p={5} boxShadow="md" borderWidth="1px">
                  <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap={4} mb={3} wrap="wrap">
                    <HStack align="center" spacing={4}>
                      <Box
                        w="56px"
                        h="56px"
                        borderRadius="full"
                        bg={coloresDepartamento[emp.departamento] ?? "gray.500"}
                        color="white"
                        display="grid"
                        placeItems="center"
                        fontWeight="bold"
                        fontSize="lg"
                      >
                        {emp.nombre.charAt(0)}
                        {emp.apellido.charAt(0)}
                      </Box>
                      <Box>
                        <Heading size="sm">
                          {emp.nombre} {emp.apellido}
                        </Heading>
                        <Text fontSize="sm" color={mutedText}>
                          {emp.puesto} • {emp.departamento}
                        </Text>
                      </Box>
                    </HStack>
                    <Badge colorScheme="blue" fontSize="sm" px={3} py={1} borderRadius="full">
                      €{emp.costoHora}/h
                    </Badge>
                  </Flex>

                  <Stack spacing={3}>
                    <SimpleGrid columns={{ base: 1, md: 3, lg: 6 }} spacing={3}>
                      <Box>
                        <Text fontSize="xs" fontWeight="bold" color={mutedText} mb={1}>
                          Horas base
                        </Text>
                        <Input
                          type="number"
                          value={disp?.horasBase ?? ""}
                          onChange={(e) =>
                            actualizarDisponibilidad(emp.id, 2024, "horasBase", Number(e.target.value))
                          }
                          textAlign="center"
                        />
                      </Box>
                      <Box>
                        <Text fontSize="xs" fontWeight="bold" color={mutedText} mb={1}>
                          % Disponibilidad
                        </Text>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={disp?.porcentaje ?? ""}
                          onChange={(e) =>
                            actualizarDisponibilidad(emp.id, 2024, "porcentaje", Number(e.target.value))
                          }
                          textAlign="center"
                        />
                      </Box>
                      <StatPill label="Disponibles" value={`${estado.disponibles}h`} tone="blue" />
                      <StatPill label="Usadas" value={`${estado.usado}h`} tone="gray" />
                      <StatPill
                        label="Faltantes"
                        value={`${estado.disponibles - estado.usado}h`}
                        tone={estado.disponibles - estado.usado < 0 ? "red" : "green"}
                      />
                      <StatPill
                        label="% Uso"
                        value={`${estado.porcentaje.toFixed(1)}%`}
                        tone={badgeColor}
                      />
                    </SimpleGrid>
                    <Progress
                      value={Math.min(estado.porcentaje, 140)}
                      size="sm"
                      borderRadius="full"
                      colorScheme={badgeColor}
                      bg={useColorModeValue("gray.200", "gray.600")}
                    />
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        ) : (
          <Stack spacing={6}>
            <Box bg={useColorModeValue("gray.900", "gray.700")} color="white" borderRadius="xl" p={6} boxShadow="lg">
              <Heading size="md" mb={4}>
                Resumen General de Proyectos 2024
              </Heading>
              <SimpleGrid columns={{ base: 1, sm: 2, md: 3, lg: 5 }} spacing={4}>
                <SummaryStat label="Horas a justificar" value={`${resumenJustificar}h`} />
                <SummaryStat label="Justificadas" value={`${resumenJustificadas}h`} accent="green.300" />
                <SummaryStat
                  label="Faltantes"
                  value={`${resumenJustificar - resumenJustificadas}h`}
                  accent="orange.300"
                />
                <SummaryStat
                  label="% Ejecutado"
                  value={
                    resumenJustificar > 0
                      ? `${((resumenJustificadas / resumenJustificar) * 100).toFixed(0)}%`
                      : "0%"
                  }
                  accent="blue.300"
                />
                <SummaryStat label="Empleados" value={empleados.length.toString()} accent="purple.300" />
              </SimpleGrid>
            </Box>

            <Box bg={cardBg} borderRadius="xl" boxShadow="lg" borderWidth="1px" overflow="hidden">
              <Box overflowX="auto">
                <Table size="sm" variant="striped" colorScheme="gray">
                  <Thead bg={useColorModeValue("gray.900", "gray.700")} color="white">
                    <Tr>
                      <Th minW="200px">Proyecto</Th>
                      {allHitos.map((hito) => (
                        <Th key={hito} textAlign="center" minW="90px">
                          {hito}
                        </Th>
                      ))}
                      <Th textAlign="center" minW="100px">
                        Total
                      </Th>
                      <Th textAlign="center" minW="150px">
                        Empleados &amp; horas
                      </Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    <Tr bg={tableStriped}>
                      <Td fontWeight="bold">Horas a justificar</Td>
                      {allHitos.map((hito) => (
                        <Td key={hito} textAlign="center" fontWeight="semibold">
                          {calcularTotalesHito(hito, "horasJustificar")}h
                        </Td>
                      ))}
                      <Td textAlign="center" fontWeight="semibold">
                        {resumenJustificar}h
                      </Td>
                      <Td />
                    </Tr>
                    <Tr>
                      <Td fontWeight="bold" color="green.700">
                        Justificadas
                      </Td>
                      {allHitos.map((hito) => (
                        <Td key={hito} textAlign="center" fontWeight="semibold" color="green.700">
                          {calcularTotalesHito(hito, "horasJustificadas")}h
                        </Td>
                      ))}
                      <Td textAlign="center" fontWeight="semibold" color="green.700">
                        {resumenJustificadas}h
                      </Td>
                      <Td />
                    </Tr>
                    <Tr bg={tableStriped}>
                      <Td fontWeight="bold" color="orange.700">
                        Faltantes
                      </Td>
                      {allHitos.map((hito) => {
                        const falt =
                          calcularTotalesHito(hito, "horasJustificar") -
                          calcularTotalesHito(hito, "horasJustificadas");
                        return (
                          <Td key={hito} textAlign="center" fontWeight="semibold" color={falt > 0 ? "orange.700" : "green.700"}>
                            {falt}h
                          </Td>
                        );
                      })}
                      <Td textAlign="center" fontWeight="semibold" color="white" bg="orange.500">
                        {resumenJustificar - resumenJustificadas}h
                      </Td>
                      <Td />
                    </Tr>
                    <Tr>
                      <Td fontWeight="bold" color="blue.700">
                        % Ejecutado 2024
                      </Td>
                      {allHitos.map((hito) => {
                        const total = calcularTotalesHito(hito, "horasJustificar");
                        const just = calcularTotalesHito(hito, "horasJustificadas");
                        return (
                          <Td key={hito} textAlign="center" fontWeight="semibold" color="blue.700">
                            {total > 0 ? ((just / total) * 100).toFixed(0) : 0}%
                          </Td>
                        );
                      })}
                      <Td textAlign="center" fontWeight="semibold" color="white" bg="blue.600">
                        {resumenJustificar > 0
                          ? ((resumenJustificadas / resumenJustificar) * 100).toFixed(0)
                          : 0}
                        %
                      </Td>
                      <Td />
                    </Tr>

                    {proyectos.map((proyecto) => {
                      const empleadosAsignados = Object.keys(proyecto.asignaciones).map((id) =>
                        Number(id)
                      );
                      const expandKey = `proy-${proyecto.id}`;
                      const expandido = Boolean(expandidos[expandKey]);
                      const colSpan = allHitos.length + 3;

                      return (
                        <React.Fragment key={proyecto.id}>
                          <Tr
                            bg={useColorModeValue("gray.100", "gray.700")}
                            _hover={{ bg: useColorModeValue("gray.200", "gray.700") }}
                            cursor="pointer"
                            onClick={() =>
                              setExpandidos((prev) => ({
                                ...prev,
                                [expandKey]: !prev[expandKey],
                              }))
                            }
                          >
                            <Td>
                              <HStack spacing={3}>
                                <Icon as={expandido ? FiChevronUp : FiChevronDown} />
                                <Box>
                                  <Text fontWeight="bold">{proyecto.nombre}</Text>
                                  <Text fontSize="xs" color={mutedText}>
                                    {proyecto.codigo}
                                  </Text>
                                </Box>
                              </HStack>
                            </Td>
                            {allHitos.map((hito) => (
                              <Td key={hito} textAlign="center" fontWeight="semibold">
                                {proyecto.datos[hito]?.horasJustificar ?? "-"}h
                              </Td>
                            ))}
                            <Td textAlign="center" fontWeight="bold">
                              {Object.values(proyecto.datos).reduce((s, h) => s + h.horasJustificar, 0)}h
                            </Td>
                            <Td textAlign="center">
                              <Badge colorScheme="blue">
                                {empleadosAsignados.length} empleados
                              </Badge>
                            </Td>
                          </Tr>

                          <Tr>
                            <Td colSpan={colSpan} p={0} border="none">
                              <Collapse in={expandido} animateOpacity>
                                <Box px={4} py={3} bg={useColorModeValue("blue.50", "gray.800")}>
                                  {empleadosAsignados.length === 0 ? (
                                    <Box textAlign="center" py={4} color={mutedText}>
                                      No hay empleados asignados
                                    </Box>
                                  ) : (
                                    <VStack spacing={3} align="stretch">
                                      {empleadosAsignados.map((idEmp) => {
                                        const emp = empleados.find((e) => e.id === idEmp);
                                        if (!emp) return null;
                                        const estado = obtenerEstadoDisponibilidad(idEmp, proyecto.año);
                                        const asignaciones = proyecto.asignaciones[idEmp];
                                        const disp = disponibilidades[idEmp]?.[proyecto.año];
                                        const horasDisponibles = calcularDisponibilidad(
                                          disp?.horasBase ?? 0,
                                          disp?.porcentaje ?? 0
                                        );
                                        const horasAsignadas = Object.values(asignaciones).reduce(
                                          (s, h) => s + (h ?? 0),
                                          0
                                        );

                                        const tone =
                                          estado.estado === "sobrecarga"
                                            ? "red"
                                            : estado.estado === "alerta"
                                              ? "yellow"
                                              : "green";

                                        return (
                                          <Box
                                            key={`${proyecto.id}-${idEmp}`}
                                            borderWidth="1px"
                                            borderRadius="lg"
                                            p={3}
                                            bg={useColorModeValue("white", "gray.900")}
                                            boxShadow="sm"
                                          >
                                            <Flex
                                              justify="space-between"
                                              align={{ base: "flex-start", md: "center" }}
                                              gap={3}
                                              wrap="wrap"
                                              mb={3}
                                            >
                                              <HStack spacing={3}>
                                                <Box
                                                  w="40px"
                                                  h="40px"
                                                  borderRadius="full"
                                                  bg={coloresDepartamento[emp.departamento] ?? "gray.500"}
                                                  color="white"
                                                  display="grid"
                                                  placeItems="center"
                                                  fontWeight="bold"
                                                  fontSize="sm"
                                                >
                                                  {emp.nombre.charAt(0)}
                                                  {emp.apellido.charAt(0)}
                                                </Box>
                                                <Box>
                                                  <Text fontWeight="semibold" fontSize="sm">
                                                    {emp.nombre} {emp.apellido}
                                                  </Text>
                                                  <Text fontSize="xs" color={mutedText}>
                                                    {emp.puesto}
                                                  </Text>
                                                </Box>
                                              </HStack>
                                              <HStack spacing={2}>
                                                <Icon
                                                  as={
                                                    estado.estado === "sobrecarga"
                                                      ? FiAlertTriangle
                                                      : estado.estado === "alerta"
                                                        ? FiAlertCircle
                                                        : FiCheckCircle
                                                  }
                                                  color={`${tone}.500`}
                                                />
                                                <Button
                                                  size="xs"
                                                  variant="ghost"
                                                  colorScheme="red"
                                                  onClick={() => removerEmpleadoProyecto(proyecto.id, idEmp)}
                                                  leftIcon={<FiX />}
                                                >
                                                  Remover
                                                </Button>
                                              </HStack>
                                            </Flex>

                                            <SimpleGrid
                                              columns={{ base: 2, sm: Math.min(4, allHitos.length) }}
                                              spacing={2}
                                              mb={3}
                                            >
                                              {allHitos.map((hito) => {
                                                const horas = asignaciones[hito] ?? 0;
                                                return (
                                                  <Box key={`${proyecto.id}-${idEmp}-${hito}`}>
                                                    <Text fontSize="xs" color={mutedText} mb={1}>
                                                      {hito}
                                                    </Text>
                                                    <Input
                                                      type="number"
                                                      min={0}
                                                      value={horas}
                                                      onChange={(e) =>
                                                        actualizarAsignacion(
                                                          proyecto.id,
                                                          idEmp,
                                                          hito,
                                                          Number(e.target.value)
                                                        )
                                                      }
                                                      size="sm"
                                                      textAlign="center"
                                                    />
                                                  </Box>
                                                );
                                              })}
                                            </SimpleGrid>

                                            <Flex align="center" justify="space-between" wrap="wrap" gap={2}>
                                              <Text fontWeight="semibold" fontSize="sm">
                                                Total: {horasAsignadas}h / {horasDisponibles}h
                                              </Text>
                                              <Badge colorScheme={tone} borderRadius="md">
                                                {horasDisponibles > 0
                                                  ? `${((horasAsignadas / horasDisponibles) * 100).toFixed(0)}%`
                                                  : "0%"}
                                              </Badge>
                                            </Flex>
                                          </Box>
                                        );
                                      })}
                                    </VStack>
                                  )}

                                  <Divider my={4} />
                                  <Popover
                                    isOpen={showAsignacion === proyecto.id}
                                    onClose={() => setShowAsignacion(null)}
                                    placement="bottom-start"
                                  >
                                    <PopoverTrigger>
                                      <Button
                                        size="sm"
                                        colorScheme="blue"
                                        leftIcon={<FiPlus />}
                                        onClick={() =>
                                          setShowAsignacion(
                                            showAsignacion === proyecto.id ? null : proyecto.id
                                          )
                                        }
                                      >
                                        Asignar empleado
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent maxW="320px">
                                      <PopoverBody>
                                        <Stack spacing={3}>
                                          <Text fontWeight="semibold" fontSize="sm">
                                            Seleccionar por departamento
                                          </Text>
                                          {departamentos.map((depto) => {
                                            const candidatos = empleados.filter(
                                              (e) =>
                                                e.departamento === depto &&
                                                !Object.keys(proyecto.asignaciones).includes(
                                                  e.id.toString()
                                                )
                                            );
                                            if (candidatos.length === 0) return null;
                                            return (
                                              <Box key={depto}>
                                                <Text
                                                  fontSize="xs"
                                                  fontWeight="bold"
                                                  color={coloresDepartamento[depto] ?? "gray.500"}
                                                  mb={1}
                                                >
                                                  {depto}
                                                </Text>
                                                <Stack spacing={1}>
                                                  {candidatos.map((emp) => (
                                                    <Button
                                                      key={emp.id}
                                                      size="sm"
                                                      variant="ghost"
                                                      justifyContent="flex-start"
                                                      onClick={() => agregarEmpleadoProyecto(proyecto.id, emp.id)}
                                                    >
                                                      <Box textAlign="left">
                                                        <Text fontWeight="semibold" fontSize="sm">
                                                          {emp.nombre} {emp.apellido}
                                                        </Text>
                                                        <Text fontSize="xs" color={mutedText}>
                                                          {emp.puesto} • €{emp.costoHora}/h
                                                        </Text>
                                                      </Box>
                                                    </Button>
                                                  ))}
                                                </Stack>
                                              </Box>
                                            );
                                          })}
                                          {departamentos.every((depto) =>
                                            empleados
                                              .filter((e) => e.departamento === depto)
                                              .every((e) =>
                                                Object.keys(proyecto.asignaciones).includes(e.id.toString())
                                              )
                                          ) && (
                                            <Text fontSize="sm" color={mutedText}>
                                              Todos los empleados ya están asignados.
                                            </Text>
                                          )}
                                        </Stack>
                                      </PopoverBody>
                                    </PopoverContent>
                                  </Popover>
                                </Box>
                              </Collapse>
                            </Td>
                          </Tr>
                        </React.Fragment>
                      );
                    })}
                  </Tbody>
                </Table>
              </Box>
            </Box>
          </Stack>
        )}
      </Box>
    </AppShell>
  );
};

interface StatPillProps {
  label: string;
  value: string;
  tone: "blue" | "gray" | "green" | "red" | "yellow";
}

const StatPill: React.FC<StatPillProps> = ({ label, value, tone }) => {
  const bg = useColorModeValue(`${tone}.50`, `${tone}.900`);
  const border = useColorModeValue(`${tone}.200`, `${tone}.700`);
  const color = useColorModeValue(`${tone}.700`, `${tone}.200`);
  return (
    <Box borderWidth="1px" borderColor={border} bg={bg} borderRadius="md" p={2} textAlign="center">
      <Text fontSize="xs" color={color} fontWeight="bold" mb={1}>
        {label}
      </Text>
      <Text fontWeight="bold">{value}</Text>
    </Box>
  );
};

interface SummaryStatProps {
  label: string;
  value: string;
  accent?: string;
}

const SummaryStat: React.FC<SummaryStatProps> = ({ label, value, accent }) => {
  return (
    <Box
      borderRadius="lg"
      p={4}
      bg="whiteAlpha.100"
      borderWidth="1px"
      borderColor="whiteAlpha.200"
    >
      <Text fontSize="xs" color={accent ?? "gray.300"} textTransform="uppercase" letterSpacing="0.08em">
        {label}
      </Text>
      <Text fontSize="2xl" fontWeight="bold" color={accent ?? "white"}>
        {value}
      </Text>
    </Box>
  );
};

export default HrProjectsIntegrationPage;
