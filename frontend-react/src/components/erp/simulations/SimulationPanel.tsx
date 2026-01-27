// Importa React y useMemo para memorizar cálculos y evitar renders innecesarios
import React, { useMemo } from "react";

// Componentes de Chakra UI para layout, inputs y estilos
import {
  Box,
  Button,
  Divider,
  HStack,
  Input,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
} from "@chakra-ui/react";

// Tipo del proyecto de simulación
import type { SimulationProject } from "../../../hooks/erp";

// Utilidad para formatear euros
import { formatEuroValue } from "../../../utils/erp";

/**
 * Props del panel de simulación
 * Todas las funciones vienen del componente padre
 */
interface SimulationPanelProps {
  project: SimulationProject; // Datos del proyecto
  onBudgetChange: (value: string) => void; // Cambiar presupuesto
  onPercentChange: (value: string) => void; // Cambiar % subvención
  onThresholdChange: (value: string) => void; // Cambiar % umbral
  onAddExpense: () => void; // Añadir gasto
  onExpenseConceptChange: (expenseId: number, value: string) => void; // Cambiar concepto
  onExpenseAmountChange: (expenseId: number, value: string) => void; // Cambiar importe
  onRemoveExpense: (expenseId: number) => void; // Eliminar gasto
}

// Componente principal
export const SimulationPanel: React.FC<SimulationPanelProps> = ({
  project,
  onBudgetChange,
  onPercentChange,
  onThresholdChange,
  onAddExpense,
  onExpenseConceptChange,
  onExpenseAmountChange,
  onRemoveExpense,
}) => {
  /**
   * Colores dinámicos según modo claro / oscuro
   */
  const panelBg = useColorModeValue("white", "gray.700");
  const panelBorder = useColorModeValue("gray.200", "gray.600");
  const inputBg = useColorModeValue("white", "gray.800");
  const inputBorder = useColorModeValue("gray.300", "gray.600");
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const resultBg = useColorModeValue("gray.900", "gray.900");
  const resultText = useColorModeValue("white", "white");

  /**
   * Calcula el importe subvencionado
   * presupuesto * % subvención
   */
  const subsidyAmount = useMemo(
    () => (project.budget * project.subsidyPercent) / 100,
    [project.budget, project.subsidyPercent],
  );

  /**
   * Suma todos los gastos del proyecto
   */
  const totalExpenses = useMemo(
    () => project.expenses.reduce((sum, item) => sum + (item.amount || 0), 0),
    [project.expenses],
  );

  /**
   * Resultado final:
   * subvención - gastos
   */
  const result = subsidyAmount - totalExpenses;

  /**
   * Umbral mínimo aceptable
   * subvención * % umbral
   */
  const threshold = subsidyAmount * (project.thresholdPercent / 100);

  /**
   * Determina si el resultado es favorable
   */
  const isFavorable = result >= threshold;

  /**
   * Porcentaje que falta para llegar al umbral (solo si es desfavorable)
   */
  const unfavorablePercent = useMemo(() => {
    if (threshold <= 0) return 0;
    if (isFavorable) return 0;

    const gap = Math.max(0, threshold - result);
    return Math.min(100, (gap / threshold) * 100);
  }, [isFavorable, result, threshold]);

  return (
    // Contenedor principal del panel
    <Stack
      spacing={5}
      bg={panelBg}
      borderRadius="xl"
      p={6}
      borderWidth="1px"
      borderColor={panelBorder}
    >
      {/* CABECERA */}
      <HStack justify="space-between" align="flex-start" flexWrap="wrap">
        {/* Datos de entrada */}
        <Stack spacing={2}>
          <Text fontSize="lg" fontWeight="bold">
            Simulacion: {project.name}
          </Text>

          {/* Inputs principales */}
          <HStack spacing={4} flexWrap="wrap">
            {/* Presupuesto */}
            <HStack>
              <Text>Presupuesto:</Text>
              <Input
                size="sm"
                type="text"
                inputMode="decimal"
                value={project.budget}
                onChange={(e) => onBudgetChange(e.target.value)}
                bg={inputBg}
                borderColor={inputBorder}
                maxW="130px"
              />
            </HStack>

            {/* % subvención */}
            <HStack>
              <Text>% subvencion:</Text>
              <Input
                size="sm"
                type="text"
                inputMode="decimal"
                value={project.subsidyPercent}
                onChange={(e) => onPercentChange(e.target.value)}
                bg={inputBg}
                borderColor={inputBorder}
                maxW="90px"
              />
            </HStack>

            {/* % umbral */}
            <HStack>
              <Text>% umbral:</Text>
              <Input
                size="sm"
                type="text"
                inputMode="decimal"
                value={project.thresholdPercent}
                onChange={(e) => onThresholdChange(e.target.value)}
                bg={inputBg}
                borderColor={inputBorder}
                maxW="90px"
              />
            </HStack>
          </HStack>

          {/* Valores calculados */}
          <Text color={subtleText}>
            Subvencionado: {formatEuroValue(subsidyAmount)} €
          </Text>
          <Text color={subtleText}>
            Umbral ({project.thresholdPercent}%): {formatEuroValue(threshold)} €
          </Text>
        </Stack>

        {/* RESULTADO /// El resultado es favorable si: (Presupuesto × % subvención − Gastos) ≥ (Presupuesto × % subvención × % umbral) */}
        <Box
          textAlign="right"
          bg={resultBg}
          color={resultText}
          p={4}
          borderRadius="lg"
        >
          <Text fontSize="sm" fontWeight="bold" color="gray.200">
            RESULTADO
          </Text>
          <Text fontSize="xl" fontWeight="bold">
            {formatEuroValue(result)} €
          </Text>
          <Text color={isFavorable ? "green.300" : "red.300"}>
            {isFavorable ? "Favorable" : "Desfavorable"}
          </Text>

          {/* Info extra si es desfavorable */}
          {!isFavorable && (
            <Text color="red.200" fontSize="sm">
              {unfavorablePercent.toFixed(1)}% lejos de ser favorable
            </Text>
          )}
        </Box>
      </HStack>

      <Divider borderColor={panelBorder} />

      {/* GASTOS */}
      <Stack spacing={3}>
        <HStack justify="space-between">
          <Text fontWeight="semibold">Gastos</Text>
          <Button
            size="sm"
            colorScheme="green"
            variant="outline"
            onClick={onAddExpense}
          >
            + Anadir gasto
          </Button>
        </HStack>

        {/* Tabla de gastos */}
        <Table size="sm" variant="simple">
          <Thead>
            <Tr>
              <Th color="gray.300">Concepto</Th>
              <Th color="gray.300">Importe (€)</Th>
              <Th color="gray.300">Accion</Th>
            </Tr>
          </Thead>
          <Tbody>
            {/* Sin gastos */}
            {project.expenses.length === 0 ? (
              <Tr>
                <Td colSpan={3} color={subtleText}>
                  Aun no hay gastos.
                </Td>
              </Tr>
            ) : (
              // Lista de gastos
              project.expenses.map((expense) => (
                <Tr key={expense.id}>
                  <Td>
                    <Input
                      size="sm"
                      value={expense.concept}
                      onChange={(e) =>
                        onExpenseConceptChange(expense.id, e.target.value)
                      }
                      bg={inputBg}
                      borderColor={inputBorder}
                    />
                  </Td>
                  <Td>
                    <Input
                      size="sm"
                      type="text"
                      inputMode="decimal"
                      value={expense.amount}
                      onChange={(e) =>
                        onExpenseAmountChange(expense.id, e.target.value)
                      }
                      bg={inputBg}
                      borderColor={inputBorder}
                    />
                  </Td>
                  <Td>
                    <Button
                      size="xs"
                      colorScheme="red"
                      variant="ghost"
                      onClick={() => onRemoveExpense(expense.id)}
                    >
                      X
                    </Button>
                  </Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>

        {/* Total gastos */}
        <Text fontWeight="semibold">
          Total gastos: {formatEuroValue(totalExpenses)} €
        </Text>
      </Stack>
    </Stack>
  );
};
