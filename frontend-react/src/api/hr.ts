import { apiClient } from "./client";

export interface Department {
  id: number;
  tenant_id: number;
  name: string;
  description?: string | null;
  manager_id?: number | null;
  is_active: boolean;
  created_at: string;
  project_allocation_percentage?: number | null;
}

export interface EmployeeProfile {
  id: number;
  tenant_id: number;
  user_id?: number | null;
  full_name?: string | null;
  email?: string | null;
  hourly_rate?: number | null;
  available_hours?: number | null;
  availability_percentage?: number | null;
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

export interface DepartmentUpdateInput {
  name?: string;
  description?: string | null;
  manager_id?: number | null;
  is_active?: boolean;
}

export interface DepartmentUpdatePayload {
  departmentId: number;
  data: DepartmentUpdateInput;
}

export interface EmployeeCreateInput {
  user_id?: number | null;
  full_name?: string;
  email?: string;
  hourly_rate?: number;
  available_hours?: number | null;
  availability_percentage?: number | null;
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
  available_hours?: number | null;
  availability_percentage?: number | null;
  position?: string;
  employment_type?: string;
  primary_department_id?: number | null;
  is_active?: boolean;
}

export interface EmployeeUpdatePayload {
  profileId: number;
  data: EmployeeUpdateInput;
}

export interface EmployeeAllocation {
  id: number;
  tenant_id: number;
  employee_id: number;
  department_id?: number | null;
  project_id?: number | null;
  milestone?: string | null;
  year?: number | null;
  allocated_hours?: number | null;
  notes?: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface EmployeeAllocationCreateInput {
  tenant_id: number;
  employee_id: number;
  department_id?: number | null;
  project_id?: number | null;
  milestone?: string | null;
  year?: number | null;
  allocated_hours?: number | null;
  notes?: string | null;
}

export interface EmployeeAllocationUpdateInput {
  department_id?: number | null;
  project_id?: number | null;
  milestone?: string | null;
  year?: number | null;
  allocated_hours?: number | null;
  notes?: string | null;
}

export interface AllocationFilters {
  tenantId?: number;
  projectId?: number;
  employeeId?: number;
  year?: number;
}

export async function fetchDepartments(
  tenantId?: number | null,
): Promise<Department[]> {
  const response = await apiClient.get<Department[]>("/api/v1/hr/departments", {
    params:
      tenantId !== undefined && tenantId !== null
        ? { tenant_id: tenantId }
        : {},
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

export async function updateDepartment(
  payload: DepartmentUpdatePayload,
): Promise<Department> {
  const { departmentId, data } = payload;
  const response = await apiClient.patch<Department>(
    `/api/v1/hr/departments/${departmentId}`,
    data,
  );
  return response.data;
}

export async function fetchEmployees(
  tenantId?: number | null,
): Promise<EmployeeProfile[]> {
  const response = await apiClient.get<EmployeeProfile[]>(
    "/api/v1/hr/employees",
    {
      params:
        tenantId !== undefined && tenantId !== null
          ? { tenant_id: tenantId }
          : {},
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

export async function fetchEmployeeAllocations(
  filters: AllocationFilters = {},
): Promise<EmployeeAllocation[]> {
  const params: Record<string, number> = {};
  if (filters.tenantId) params.tenant_id = filters.tenantId;
  if (filters.projectId) params.project_id = filters.projectId;
  if (filters.employeeId) params.employee_id = filters.employeeId;
  if (filters.year) params.year = filters.year;

  const response = await apiClient.get<EmployeeAllocation[]>(
    "/api/v1/hr/allocations",
    {
      params: Object.keys(params).length ? params : undefined,
    },
  );
  return response.data;
}

export async function createEmployeeAllocation(
  data: EmployeeAllocationCreateInput,
): Promise<EmployeeAllocation> {
  const response = await apiClient.post<EmployeeAllocation>(
    "/api/v1/hr/allocations",
    data,
  );
  return response.data;
}

export async function updateEmployeeAllocation(
  allocationId: number,
  data: EmployeeAllocationUpdateInput,
): Promise<EmployeeAllocation> {
  const response = await apiClient.patch<EmployeeAllocation>(
    `/api/v1/hr/allocations/${allocationId}`,
    data,
  );
  return response.data;
}

export async function deleteEmployeeAllocation(
  allocationId: number,
): Promise<void> {
  await apiClient.delete(`/api/v1/hr/allocations/${allocationId}`);
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
