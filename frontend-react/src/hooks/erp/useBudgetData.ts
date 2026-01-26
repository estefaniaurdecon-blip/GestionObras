import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@chakra-ui/react";

import {
  createBudgetMilestone,
  createProjectBudgetLine,
  deleteBudgetMilestone,
  deleteProjectBudgetLine,
  fetchBudgetMilestones,
  fetchProjectBudgets,
  updateBudgetMilestone,
  updateProjectBudgetLine,
} from "../../api/erpBudgets";

/**
 * Hook centralizado para:
 * - Leer presupuestos e hitos de un proyecto
 * - Mutaciones CRUD + refresco automático (invalidate)
 * - Feedback visual con toasts
 */
export const useBudgetData = (projectId: number | null, tenantId?: number) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const scopedKey = projectId ? [projectId, tenantId ?? "all"] : [projectId];

  /**
   * QUERY: líneas de presupuesto del proyecto
   * enabled evita ejecutar si projectId es null
   */
  const budgetsQuery = useQuery({
    queryKey: ["project-budgets", ...scopedKey],
    queryFn: () => fetchProjectBudgets(projectId as number, tenantId),
    enabled: projectId !== null,
  });

  /**
   * QUERY: hitos del presupuesto del proyecto
   */
  const budgetMilestonesQuery = useQuery({
    queryKey: ["project-budget-milestones", ...scopedKey],
    queryFn: () => fetchBudgetMilestones(projectId as number, tenantId),
    enabled: projectId !== null,
  });

  /**
   * MUTATION: crear línea de presupuesto
   * - al success: invalida lista de budgets para recargar
   */
  const createBudgetMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createProjectBudgetLine>[1]) =>
      createProjectBudgetLine(projectId as number, payload, tenantId),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["project-budgets", ...scopedKey],
      });
      toast({ title: "Presupuesto guardado", status: "success" });
    },

    onError: (error: any) => {
      toast({
        title: "Error al guardar presupuesto",
        description:
          error?.response?.data?.detail ?? "No se pudo guardar el presupuesto.",
        status: "error",
      });
    },
  });

  /**
   * MUTATION: actualizar línea de presupuesto
   */
  const updateBudgetMutation = useMutation({
    mutationFn: ({
      budgetId,
      payload,
    }: {
      budgetId: number;
      payload: Parameters<typeof updateProjectBudgetLine>[2];
    }) => updateProjectBudgetLine(projectId as number, budgetId, payload, tenantId),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["project-budgets", ...scopedKey],
      });
      toast({ title: "Presupuesto actualizado", status: "success" });
    },

    onError: (error: any) => {
      toast({
        title: "Error al actualizar presupuesto",
        description: "No se pudo actualizar el presupuesto.",
        status: "error",
      });
    },
  });

  /**
   * MUTATION: eliminar línea de presupuesto
   */
  const deleteBudgetMutation = useMutation({
    mutationFn: (budgetId: number) =>
      deleteProjectBudgetLine(projectId as number, budgetId, tenantId),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["project-budgets", ...scopedKey],
      });
      toast({ title: "Presupuesto eliminado", status: "success" });
    },

    onError: (error: any) => {
      toast({
        title: "Error al eliminar presupuesto",
        description:
          error?.response?.data?.detail ??
          "No se pudo eliminar el presupuesto.",
        status: "error",
      });
    },
  });

  /**
   * MUTATION: crear hito
   * - invalida milestones y budgets (porque el total puede depender de hitos)
   */
  const createBudgetMilestoneMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createBudgetMilestone>[1]) =>
      createBudgetMilestone(projectId as number, payload, tenantId),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["project-budget-milestones", ...scopedKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["project-budgets", ...scopedKey],
      });
      toast({ title: "Hito creado", status: "success" });
    },

    onError: (error: any) => {
      toast({
        title: "Error al crear hito",
        description:
          error?.response?.data?.detail ?? "No se pudo crear el hito.",
        status: "error",
      });
    },
  });

  /**
   * MUTATION: actualizar hito
   * (aquí no pones toast; solo refrescas)
   */
  const updateBudgetMilestoneMutation = useMutation({
    mutationFn: ({
      milestoneId,
      payload,
    }: {
      milestoneId: number;
      payload: Parameters<typeof updateBudgetMilestone>[2];
    }) =>
      updateBudgetMilestone(projectId as number, milestoneId, payload, tenantId),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["project-budget-milestones", ...scopedKey],
      });
    },
  });

  /**
   * MUTATION: eliminar hito
   * - invalida milestones y budgets
   */
  const deleteBudgetMilestoneMutation = useMutation({
    mutationFn: (milestoneId: number) =>
      deleteBudgetMilestone(projectId as number, milestoneId, tenantId),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["project-budget-milestones", ...scopedKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["project-budgets", ...scopedKey],
      });
      toast({ title: "Hito eliminado", status: "success" });
    },

    onError: (error: any) => {
      toast({
        title: "Error al eliminar hito",
        description:
          error?.response?.data?.detail ?? "No se pudo eliminar el hito.",
        status: "error",
      });
    },
  });

  /**
   * Devolvemos todo para usarlo en la página
   * (queries + mutations)
   */
  return {
    budgetsQuery,
    budgetMilestonesQuery,
    createBudgetMutation,
    updateBudgetMutation,
    deleteBudgetMutation,
    createBudgetMilestoneMutation,
    updateBudgetMilestoneMutation,
    deleteBudgetMilestoneMutation,
  };
};
