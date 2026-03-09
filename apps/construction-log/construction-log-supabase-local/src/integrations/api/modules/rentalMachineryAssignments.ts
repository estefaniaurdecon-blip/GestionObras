type ApiFetchJsonFn = <T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
) => Promise<T>;

type BuildQueryParamsFn = (
  params: Record<string, string | number | boolean | undefined | null>
) => string;

export interface RentalMachineryAssignmentsApiDeps {
  apiFetchJson: ApiFetchJsonFn;
  buildQueryParams: BuildQueryParamsFn;
}

export interface ApiRentalMachineryAssignment {
  id: number;
  tenant_id: number;
  rental_machinery_id: string;
  work_id: string;
  assignment_date: string;
  end_date?: string | null;
  operator_name: string;
  company_name: string;
  activity?: string | null;
  created_by_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ListRentalMachineryAssignmentsParams {
  rentalMachineryId?: string;
  date?: string;
  workId?: string;
}

export interface CreateRentalMachineryAssignmentPayload {
  rental_machinery_id: string;
  work_id: string;
  assignment_date: string;
  end_date?: string | null;
  operator_name: string;
  company_name: string;
  activity?: string | null;
}

export interface UpdateRentalMachineryAssignmentPayload {
  assignment_date?: string;
  end_date?: string | null;
  operator_name?: string;
  company_name?: string;
  activity?: string | null;
}

export function createRentalMachineryAssignmentsApi(deps: RentalMachineryAssignmentsApiDeps) {
  const listRentalMachineryAssignments = async (
    params: ListRentalMachineryAssignmentsParams = {}
  ): Promise<ApiRentalMachineryAssignment[]> => {
    const query = deps.buildQueryParams({
      rental_machinery_id: params.rentalMachineryId,
      assignment_date: params.date,
      work_id: params.workId,
    });
    return deps.apiFetchJson<ApiRentalMachineryAssignment[]>(
      `/api/v1/erp/rental-machinery-assignments${query}`
    );
  };

  const createRentalMachineryAssignment = async (
    payload: CreateRentalMachineryAssignmentPayload
  ): Promise<ApiRentalMachineryAssignment> => {
    return deps.apiFetchJson<ApiRentalMachineryAssignment>(
      '/api/v1/erp/rental-machinery-assignments',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  };

  const updateRentalMachineryAssignment = async (
    assignmentId: number,
    payload: UpdateRentalMachineryAssignmentPayload
  ): Promise<ApiRentalMachineryAssignment> => {
    return deps.apiFetchJson<ApiRentalMachineryAssignment>(
      `/api/v1/erp/rental-machinery-assignments/${assignmentId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  };

  const deleteRentalMachineryAssignment = async (assignmentId: number): Promise<void> => {
    return deps.apiFetchJson<void>(`/api/v1/erp/rental-machinery-assignments/${assignmentId}`, {
      method: 'DELETE',
    });
  };

  return {
    listRentalMachineryAssignments,
    createRentalMachineryAssignment,
    updateRentalMachineryAssignment,
    deleteRentalMachineryAssignment,
  };
}
