import { apiClient } from "./client";

export interface ProjectBudgetLinePayload {
  concept: string;
  hito1_budget: number;
  justified_hito1: number;
  hito2_budget: number;
  justified_hito2: number;
  approved_budget: number;
  percent_spent: number;
  forecasted_spent: number;
}

export interface ProjectBudgetMilestone {
  id: number;
  project_id: number;
  name: string;
  order_index: number;
  created_at: string;
}

export interface BudgetLineMilestone {
  id: number;
  milestone_id: number;
  amount: number;
  justified: number;
  created_at: string;
}

export interface ProjectBudgetLine extends ProjectBudgetLinePayload {
  id: number;
  project_id: number;
  created_at: string;
  milestones?: BudgetLineMilestone[];
}

export async function fetchProjectBudgets(projectId: number) {
  try {
    const response = await apiClient.get<ProjectBudgetLine[]>(
      `/api/v1/erp/projects/${projectId}/budgets`
    );
    return response.data;
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return [];
    }
    throw error;
  }
}

export async function createProjectBudgetLine(
  projectId: number,
  payload: ProjectBudgetLinePayload
) {
  const response = await apiClient.post<ProjectBudgetLine>(
    `/api/v1/erp/projects/${projectId}/budgets`,
    payload
  );
  return response.data;
}

export type ProjectBudgetLineUpdatePayload = Partial<
  ProjectBudgetLinePayload & {
    milestones: Array<{
      milestone_id: number;
      amount?: number | null;
      justified?: number | null;
    }>;
  }
>;

export async function updateProjectBudgetLine(
  projectId: number,
  budgetId: number,
  payload: ProjectBudgetLineUpdatePayload
) {
  const response = await apiClient.patch<ProjectBudgetLine>(
    `/api/v1/erp/projects/${projectId}/budgets/${budgetId}`,
    payload
  );
  return response.data;
}

export async function deleteProjectBudgetLine(
  projectId: number,
  budgetId: number
) {
  await apiClient.delete(`/api/v1/erp/projects/${projectId}/budgets/${budgetId}`);
}

export async function fetchBudgetMilestones(projectId: number) {
  const response = await apiClient.get<ProjectBudgetMilestone[]>(
    `/api/v1/erp/projects/${projectId}/budget-milestones`
  );
  return response.data;
}

export async function createBudgetMilestone(
  projectId: number,
  payload: { name: string; order_index?: number }
) {
  const response = await apiClient.post<ProjectBudgetMilestone>(
    `/api/v1/erp/projects/${projectId}/budget-milestones`,
    payload
  );
  return response.data;
}

export async function deleteBudgetMilestone(projectId: number, milestoneId: number) {
  await apiClient.delete(`/api/v1/erp/projects/${projectId}/budget-milestones/${milestoneId}`);
}

export async function updateBudgetMilestone(
  projectId: number,
  milestoneId: number,
  payload: { name?: string; order_index?: number }
) {
  const response = await apiClient.patch<ProjectBudgetMilestone>(
    `/api/v1/erp/projects/${projectId}/budget-milestones/${milestoneId}`,
    payload
  );
  return response.data;
}
