import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@chakra-ui/react";
import { useRef } from "react";

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
import { fetchErpProject } from "../../api/erpReports";

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
  const resolvedTenantIdRef = useRef<number | undefined>(undefined);

  const resolveWriteTenantId = async () => {
    if (tenantId) return tenantId;
    if (resolvedTenantIdRef.current) return resolvedTenantIdRef.current;
    if (!projectId) return undefined;
    try {
      const project = await fetchErpProject(projectId);
      const resolved = project?.tenant_id ?? undefined;
      resolvedTenantIdRef.current = resolved;
      return resolved;
    } catch {
      return undefined;
    }
  };

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
    mutationFn: async (payload: Parameters<typeof createProjectBudgetLine>[1]) => {
      const writeTenantId = await resolveWriteTenantId();
      return createProjectBudgetLine(projectId as number, payload, writeTenantId);
    },

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
    }) =>
      resolveWriteTenantId().then((writeTenantId) =>
        updateProjectBudgetLine(
          projectId as number,
          budgetId,
          payload,
          writeTenantId,
        ),
      ),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["project-budgets", ...scopedKey],
      });
      toast({ title: "Presupuesto actualizado", status: "success" });
    },

    onError: async (error: any, variables) => {
      const status = error?.response?.status;
      if (status === 404 && projectId !== null && variables?.payload) {
        try {
          const writeTenantId = await resolveWriteTenantId();
          await createProjectBudgetLine(
            projectId as number,
            variables.payload as any,
            writeTenantId,
          );
          await queryClient.invalidateQueries({
            queryKey: ["project-budgets", ...scopedKey],
          });
          toast({
            title: "Presupuesto recreado",
            description:
              "La línea no existía en el servidor y se ha vuelto a crear.",
            status: "info",
          });
          return;
        } catch (innerError: any) {
          toast({
            title: "Error al recrear presupuesto",
            description:
              innerError?.response?.data?.detail ??
              "No se pudo recrear el presupuesto desincronizado.",
            status: "error",
          });
          return;
        }
      }

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
    mutationFn: async (budgetId: number) => {
      const writeTenantId = await resolveWriteTenantId();
      return deleteProjectBudgetLine(projectId as number, budgetId, writeTenantId);
    },

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
    mutationFn: async (payload: Parameters<typeof createBudgetMilestone>[1]) => {
      const writeTenantId = await resolveWriteTenantId();
      return createBudgetMilestone(projectId as number, payload, writeTenantId);
    },

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
      resolveWriteTenantId().then((writeTenantId) =>
        updateBudgetMilestone(
          projectId as number,
          milestoneId,
          payload,
          writeTenantId,
        ),
      ),

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
    mutationFn: async (milestoneId: number) => {
      const writeTenantId = await resolveWriteTenantId();
      return deleteBudgetMilestone(projectId as number, milestoneId, writeTenantId);
    },

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
