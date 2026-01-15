import { apiClient } from "./client";

export interface Department {
  id: number;
  tenant_id: number;
  name: string;
  description?: string | null;
  manager_id?: number | null;
  is_active: boolean;
  created_at: string;
}

export interface EmployeeProfile {
  id: number;
  tenant_id: number;
  user_id?: number | null;
  full_name?: string | null;
  email?: string | null;
  hourly_rate?: number | null;
  position?: string | null;
  employment_type: string;
  hire_date?: string | null;
  end_date?: string | null;
  is_active: boolean;
  created_at: string;
  primary_department_id?: number | null;
}

export interface HeadcountItem {
  department_id: number | null;
  department_name: string | null;
  total_employees: number;
}

export interface DepartmentCreateInput {
  name: string;
  description?: string;
  manager_id?: number | null;
  is_active?: boolean;
}

export interface DepartmentCreatePayload {
  data: DepartmentCreateInput;
  tenantId?: number;
}

export interface EmployeeCreateInput {
  user_id?: number | null;
  full_name?: string;
  email?: string;
  hourly_rate?: number;
  position?: string;
  employment_type?: string;
  primary_department_id?: number | null;
  is_active?: boolean;
}

export interface EmployeeCreatePayload {
  data: EmployeeCreateInput;
  tenantId?: number;
}

export interface EmployeeUpdateInput {
  full_name?: string;
  email?: string;
  hourly_rate?: number;
  position?: string;
  employment_type?: string;
  primary_department_id?: number | null;
  is_active?: boolean;
}

export interface EmployeeUpdatePayload {
  profileId: number;
  data: EmployeeUpdateInput;
}

export async function fetchDepartments(
  tenantId?: number,
): Promise<Department[]> {
  const response = await apiClient.get<Department[]>("/api/v1/hr/departments", {
    params: tenantId ? { tenant_id: tenantId } : undefined,
  });
  return response.data;
}

export async function createDepartment(
  payload: DepartmentCreatePayload,
): Promise<Department> {
  const { data, tenantId } = payload;
  const response = await apiClient.post<Department>(
    "/api/v1/hr/departments",
    data,
    {
      params: tenantId ? { tenant_id: tenantId } : undefined,
    },
  );
  return response.data;
}

export async function fetchEmployees(
  tenantId?: number,
): Promise<EmployeeProfile[]> {
  const response = await apiClient.get<EmployeeProfile[]>(
    "/api/v1/hr/employees",
    {
      params: tenantId ? { tenant_id: tenantId } : undefined,
    },
  );
  return response.data;
}

export async function createEmployee(
  payload: EmployeeCreatePayload,
): Promise<EmployeeProfile> {
  const { data, tenantId } = payload;
  const response = await apiClient.post<EmployeeProfile>(
    "/api/v1/hr/employees",
    data,
    {
      params: tenantId ? { tenant_id: tenantId } : undefined,
    },
  );
  return response.data;
}

export async function updateEmployee(
  payload: EmployeeUpdatePayload,
): Promise<EmployeeProfile> {
  const { profileId, data } = payload;
  const response = await apiClient.patch<EmployeeProfile>(
    `/api/v1/hr/employees/${profileId}`,
    data,
  );
  return response.data;
}

export async function deleteEmployee(profileId: number): Promise<void> {
  await apiClient.delete(`/api/v1/hr/employees/${profileId}`);
}

export async function fetchHeadcount(
  tenantId?: number,
): Promise<HeadcountItem[]> {
  const response = await apiClient.get<HeadcountItem[]>(
    "/api/v1/hr/reports/headcount",
    {
      params: tenantId ? { tenant_id: tenantId } : undefined,
    },
  );
  return response.data;
}
