
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import axios from "axios";

import { apiClient } from "../../api/client";
import {
  fetchDepartments,
  fetchEmployeeAllocations,
  fetchEmployees,
  createEmployeeAllocation,
  updateEmployeeAllocation,
  deleteEmployeeAllocation,
  type EmployeeAllocation,
  type EmployeeProfile,
  type Department,
} from "../../api/hr";
import { loadSummaryFallback, persistSummaryFallback } from "../../utils/erp";
import type { SummaryYearlyData, SaveStatus } from "../../utils/erp";
import { useDebouncedSave } from "./useDebouncedSave";

const fetchSummaryData = async (year: number): Promise<SummaryYearlyData> => {
  try {
    const response = await apiClient.get<SummaryYearlyData>(
      `/api/v1/erp/summary/${year}`,
    );
    await persistSummaryFallback(year, response.data);
    return response.data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      return loadSummaryFallback(year);
    }
    console.warn("Fallo al cargar resumen, usando almacenamiento local", err);
    return loadSummaryFallback(year);
  }
};

const saveSummaryData = async ({
  year,
  payload,
}: {
  year: number;
  payload: SummaryYearlyData;
}): Promise<void> => {
  try {
    await apiClient.put<SummaryYearlyData>(
      `/api/v1/erp/summary/${year}`,
      payload,
    );
    await persistSummaryFallback(year, payload);
  } catch (err) {
    if (
      axios.isAxiosError(err) &&
      (err.response?.status === 404 || err.code === "ERR_NETWORK")
    ) {
      persistSummaryFallback(year, payload);
      return;
    }
    console.error(err);
    throw err;
  }
};

export const useErpSummary = ({
  hrTenantId,
  currentUserId,
}: {
  hrTenantId?: number;
  currentUserId?: number;
}) => {
  const [summaryYear, setSummaryYear] = useState<number>(
    new Date().getFullYear(),
  );
  const [allocationDraftsState, setAllocationDrafts] = useState<
    Record<string, string>
  >({});
  const [summarySearch, setSummarySearch] = useState("");
  const [summaryEditMode, setSummaryEditMode] = useState(false);
  const [projectJustify, setProjectJustify] = useState<Record<number, number>>(
    {},
  );
  const [projectJustified, setProjectJustified] = useState<
    Record<number, number>
  >({});
  const [summaryMilestones, setSummaryMilestones] = useState<
    Record<number, Array<{ label: string; hours: number }>>
  >({});
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState<number | "all">(
    "all",
  );
  const [addDrawerDeptFilter, setAddDrawerDeptFilter] = useState<
    number | "all"
  >("all");
  const [addDrawerSearch, setAddDrawerSearch] = useState("");
  const [allocationEdits, setAllocationEdits] = useState<Record<string, string>>(
    {},
  );
  const allocationDraftsRef = useRef<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const skipAutoSaveRef = useRef(true);
  const queryClient = useQueryClient();

  const { data: storedYearData, isFetching: loadingSummaryYear } = useQuery<
    SummaryYearlyData | undefined
  >({
    queryKey: ["erp-summary", summaryYear],
    queryFn: () => fetchSummaryData(summaryYear),
    refetchOnWindowFocus: false,
  });

  const {
    data: hrEmployees = [],
    isError: employeesError,
    error: employeesErrorMsg,
    isLoading: employeesLoading,
  } = useQuery<EmployeeProfile[]>({
    queryKey: ["hr-employees", hrTenantId],
    queryFn: () => fetchEmployees(hrTenantId),
    enabled: !!currentUserId,
    retry: 3,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  const {
    data: hrDepartments = [],
    isError: departmentsError,
    error: departmentsErrorMsg,
    isLoading: departmentsLoading,
  } = useQuery<Department[]>({
    queryKey: ["hr-departments", hrTenantId],
    queryFn: () => fetchDepartments(hrTenantId),
    enabled: !!currentUserId,
    retry: 3,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  const { data: allocations = [], isError: allocationsError } = useQuery<
    EmployeeAllocation[]
  >({
    queryKey: ["hr-allocations", summaryYear, hrTenantId],
    queryFn: () =>
      fetchEmployeeAllocations({
        year: summaryYear,
        tenantId: hrTenantId ?? undefined,
      }),
    enabled: !!currentUserId,
    retry: 3,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  const saveSummaryMutation = useMutation({
    mutationFn: saveSummaryData,
  });

  const saveSummaryDebounced = useDebouncedSave<{
    year: number;
    payload: SummaryYearlyData;
  }>((value) => saveSummaryMutation.mutateAsync(value), 700, setSaveStatus);

  const saveStatusLabel = {
    idle: "",
    saving: "Guardando los cambios...",
    saved: "Cambios guardados",
    error: "Error al guardar",
  }[saveStatus];

  useEffect(() => {
    skipAutoSaveRef.current = true;
    if (storedYearData) {
      setProjectJustify(storedYearData.projectJustify ?? {});
      setProjectJustified(storedYearData.projectJustified ?? {});
      setSummaryMilestones(storedYearData.summaryMilestones ?? {});
    } else {
      setProjectJustify({});
      setProjectJustified({});
      setSummaryMilestones({});
    }
  }, [storedYearData]);

  useEffect(() => {
    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      return;
    }

    saveSummaryDebounced({
      year: summaryYear,
      payload: {
        projectJustify,
        projectJustified,
        summaryMilestones,
      },
    });
  }, [projectJustify, projectJustified, summaryMilestones, summaryYear]);

  const milestoneTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    Object.entries(summaryMilestones).forEach(([projectId, items]) => {
      const sum = items.reduce((acc, item) => acc + (item.hours || 0), 0);
      totals[projectId] = sum;
    });
    return totals;
  }, [summaryMilestones]);

  const departmentAllocationPercentMap = useMemo(() => {
    const map: Record<number, number> = {};
    hrDepartments.forEach((dept) => {
      map[dept.id] = Number(dept.project_allocation_percentage ?? 100);
    });
    return map;
  }, [hrDepartments]);

  const departmentMap = useMemo(() => {
    const map: Record<number, string> = {};
    hrDepartments.forEach((dept) => {
      map[dept.id] = dept.name || `Departamento ${dept.id}`;
    });
    return map;
  }, [hrDepartments]);

  const departmentColorMap = useMemo(() => {
    const map: Record<number, string> = {};
    hrDepartments.forEach((dept, idx) => {
      map[dept.id] = [
        "teal",
        "purple",
        "orange",
        "blue",
        "green",
        "red",
        "pink",
        "cyan",
      ][idx % 8];
    });
    return map;
  }, [hrDepartments]);

  const allocationKey = useCallback(
    (employeeId: number, projectId: number, year: number, milestoneLabel = "") =>
      `${employeeId}-${projectId}-${year}-${milestoneLabel || "general"}`,
    [],
  );

  const employeeById = useMemo(() => {
    const map = new Map<number, EmployeeProfile>();
    hrEmployees.forEach((emp) => {
      map.set(emp.id, emp);
    });
    return map;
  }, [hrEmployees]);

  const allocationIndex = useMemo(() => {
    const map = new Map<string, EmployeeAllocation>();
    allocations.forEach((alloc) => {
      if (!alloc.employee_id || !alloc.project_id || alloc.year !== summaryYear) {
        return;
      }
      const key = allocationKey(
        alloc.employee_id,
        alloc.project_id,
        summaryYear,
        alloc.milestone || "",
      );
      map.set(key, alloc);
    });
    return map;
  }, [allocations, allocationKey, summaryYear]);

  const persistAllocation = useCallback(
    async (key: string, value: string) => {
      const parts = key.split("-");
      const [employeeIdStr, projectIdStr, yearStr] = parts;
      const milestoneLabelRaw = parts.slice(3).join("-");
      const employeeId = Number(employeeIdStr);
      const projectId = Number(projectIdStr);
      const year = Number(yearStr);
      if (!Number.isFinite(employeeId) || !Number.isFinite(projectId) || !Number.isFinite(year)) {
        return;
      }
      const employee = employeeById.get(employeeId);

      const normalized = value.trim();
      const numericValue = Number(normalized);
      const existing = allocationIndex.get(key);
      const tenantId = hrTenantId ?? employee?.tenant_id;
      if (tenantId == null) return;
      const milestone =
        milestoneLabelRaw && milestoneLabelRaw !== "general"
          ? milestoneLabelRaw
          : null;

      if (!normalized || !Number.isFinite(numericValue)) {
        if (existing) {
          await deleteEmployeeAllocation(existing.id);
          await queryClient.invalidateQueries({
            queryKey: ["hr-allocations", summaryYear, hrTenantId],
          });
        }
        return;
      }

      const basePayload = {
        department_id: employee?.primary_department_id ?? null,
        project_id: projectId,
        milestone,
        year,
        allocated_hours: numericValue,
        notes: null,
      };

      if (existing) {
        await updateEmployeeAllocation(existing.id, basePayload);
      } else {
        await createEmployeeAllocation({
          tenant_id: tenantId,
          employee_id: employeeId,
          ...basePayload,
        });
      }

      await queryClient.invalidateQueries({
        queryKey: ["hr-allocations", summaryYear, hrTenantId],
      });
    },
    [allocationIndex, employeeById, hrTenantId, queryClient, summaryYear],
  );



  const departmentAllocationTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    allocations.forEach((alloc) => {
      if (alloc.year !== summaryYear) return;
      const deptId = alloc.department_id;
      if (!deptId) return;
      totals[deptId] = (totals[deptId] ?? 0) + Number(alloc.allocated_hours ?? 0);
    });
    return totals;
  }, [allocations, summaryYear]);

  const projectTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    allocations.forEach((a) => {
      if (!a.project_id) return;
      totals[a.project_id] =
        (totals[a.project_id] ?? 0) + Number(a.allocated_hours ?? 0);
    });
    return totals;
  }, [allocations]);

  const projectTotalsByYear = useMemo(() => {
    const totals: Record<number, number> = {};
    allocations.forEach((alloc) => {
      if (alloc.year !== summaryYear) return;
      if (!alloc.project_id) return;
      totals[alloc.project_id] =
        (totals[alloc.project_id] ?? 0) + Number(alloc.allocated_hours ?? 0);
    });
    return totals;
  }, [allocations, summaryYear]);

  const employeeAvailability = useMemo(() => {
    const map: Record<number, number> = {};
    hrEmployees.forEach((emp) => {
      const base = Number(emp.available_hours ?? 0);
      const pct = Number(emp.availability_percentage ?? 100);
      const available =
        Number.isFinite(base) && Number.isFinite(pct)
          ? Math.max(0, Math.round(base * (pct / 100)))
          : 0;
      map[emp.id] = available;
    });
    return map;
  }, [hrEmployees]);

  const employeeDepartmentPercentages = useMemo(() => {
    const records: Record<number, Record<number, number>> = {};
    allocations.forEach((alloc) => {
      if (alloc.year !== summaryYear) return;
      if (!alloc.employee_id || !alloc.department_id) return;
      const hours = Number(alloc.allocated_hours ?? 0);
      const employeeRecords = records[alloc.employee_id] ?? {};
      employeeRecords[alloc.department_id] =
        (employeeRecords[alloc.department_id] ?? 0) + hours;
      records[alloc.employee_id] = employeeRecords;
    });

    const result: Record<
      number,
      Array<{
        departmentId: number;
        departmentName: string;
        limitPercent: number;
        usedPercent: number;
        limitHours: number;
        usedHours: number;
      }>
    > = {};

    Object.entries(records).forEach(([employeeIdStr, deptMap]) => {
      const employeeId = Number(employeeIdStr);
      const available = employeeAvailability[employeeId] ?? 0;
      const list = Object.entries(deptMap)
        .map(([deptIdStr, hours]) => {
          const deptId = Number(deptIdStr);
          const limitPercent = departmentAllocationPercentMap[deptId] ?? 100;
          const limitHours = Math.round((available * limitPercent) / 100);
          const usedPercent =
            limitHours > 0 ? Math.round((hours / limitHours) * 100) : 0;
          return {
            departmentId: deptId,
            departmentName: departmentMap[deptId] ?? "Sin departamento",
            limitPercent,
            usedPercent,
            limitHours,
            usedHours: Math.round(hours),
          };
        })
        .sort((a, b) => b.usedPercent - a.usedPercent);
      result[employeeId] = list;
    });

    return result;
  }, [
    allocations,
    summaryYear,
    employeeAvailability,
    departmentMap,
    departmentAllocationPercentMap,
  ]);

  const employeeNameMap = useMemo(() => {
    const map: Record<number, string> = {};
    hrEmployees.forEach((emp) => {
      map[emp.id] = emp.full_name?.trim() || "Empleado";
    });
    return map;
  }, [hrEmployees]);

  const milestoneContributions = useMemo(() => {
    const map: Record<
      number,
      Record<string, Array<{ name: string; hours: number }>>
    > = {};
    allocations.forEach((alloc) => {
      if (!alloc.project_id || alloc.year !== summaryYear) return;
      const name = employeeNameMap[alloc.employee_id] ?? `${alloc.employee_id}`;
      const label = alloc.milestone || "Sin hitos";
      const projectMap = map[alloc.project_id] ?? {};
      const list = projectMap[label] ?? [];
      const existing = list.find((entry) => entry.name === name);
      if (existing) {
        existing.hours += Number(alloc.allocated_hours ?? 0);
      } else {
        list.push({ name, hours: Number(alloc.allocated_hours ?? 0) });
      }
      projectMap[label] = list;
      map[alloc.project_id] = projectMap;
    });
    return map;
  }, [allocations, summaryYear, employeeNameMap]);

  const employeeMilestoneHours = useMemo(() => {
    const map: Record<number, Record<number, Record<string, number>>> = {};
    allocations.forEach((alloc) => {
      if (alloc.year !== summaryYear) return;
      if (!alloc.employee_id || !alloc.project_id) return;
      const employeeMap = map[alloc.employee_id] ?? {};
      const projectMap = employeeMap[alloc.project_id] ?? {};
      const milestoneLabel = alloc.milestone || "Sin hitos";
      projectMap[milestoneLabel] =
        (projectMap[milestoneLabel] ?? 0) + Number(alloc.allocated_hours ?? 0);
      employeeMap[alloc.project_id] = projectMap;
      map[alloc.employee_id] = employeeMap;
    });
    return map;
  }, [allocations, summaryYear]);

  useEffect(() => {
    const selected = new Set(selectedEmployeeIds);
    const all = hrEmployees.map((emp) => emp.id);
    if (selectedEmployeeIds.length === 0) {
      setSelectedEmployeeIds(all);
      return;
    }
    const filtered = all.filter((id) => selected.has(id));
    if (filtered.length !== selectedEmployeeIds.length) {
      setSelectedEmployeeIds(filtered);
    }
  }, [hrEmployees, selectedEmployeeIds]);

  useEffect(() => {
    allocationDraftsRef.current = allocationDraftsState;
  }, [allocationDraftsState]);

  const handleAllocationDraftChange = useCallback((key: string, value: string) => {
    setAllocationDrafts((prev) => {
      const next = { ...prev, [key]: value };
      allocationDraftsRef.current = next;
      return next;
    });
  }, []);

  const filteredSummaryEmployees = useMemo(() => {
    const searchLower = summarySearch.toLowerCase();
    return hrEmployees.filter((emp) => {
      if (!selectedEmployeeIds.includes(emp.id)) return false;
      const matchesName = (emp.full_name || "")
        .toLowerCase()
        .includes(searchLower);
      const matchesDepartment =
        departmentFilter === "all"
          ? true
          : emp.primary_department_id === departmentFilter;
      return matchesName && matchesDepartment;
    });
  }, [hrEmployees, summarySearch, selectedEmployeeIds, departmentFilter]);

  const employeesAvailableToAdd = useMemo(() => {
    const searchLower = addDrawerSearch.toLowerCase();
    return hrEmployees.filter((emp) => {
      if (selectedEmployeeIds.includes(emp.id)) return false;
      if (
        addDrawerDeptFilter !== "all" &&
        emp.primary_department_id !== addDrawerDeptFilter
      ) {
        return false;
      }
      return (emp.full_name || "").toLowerCase().includes(searchLower);
    });
  }, [hrEmployees, addDrawerSearch, selectedEmployeeIds, addDrawerDeptFilter]);

  const handleAddEmployee = useCallback((employeeId: number) => {
    setSelectedEmployeeIds((prev) => [...prev, employeeId]);
  }, []);

  const addMilestoneRow = useCallback((projectId: number) => {
    setSummaryMilestones((prev) => {
      const list = prev[projectId] ?? [];
      return {
        ...prev,
        [projectId]: [
          ...list,
          { label: `H${list.length + 1}`, hours: 0 },
        ],
      };
    });
  }, []);

  const handleAllocationBlur = useCallback(
    async (
      employee: EmployeeProfile,
      projectId: number,
      milestoneLabel: string,
      value: string,
    ) => {
      if (!summaryEditMode) return;
      const key = allocationKey(
        employee.id,
        projectId,
        summaryYear,
        milestoneLabel,
      );
      setAllocationEdits((prev) => ({
        ...prev,
        [key]: value,
      }));
      await persistAllocation(key, value);
    },
    [
      summaryEditMode,
      allocationKey,
      summaryYear,
      persistAllocation,
    ],
  );

  useEffect(() => {
    const flush = async () => {
      if (summaryEditMode) return;
      const entries = Object.entries(allocationDraftsRef.current);
      if (entries.length === 0) return;
      await Promise.all(entries.map(([key, value]) => persistAllocation(key, value)));
      setAllocationDrafts({});
      setAllocationEdits({});
    };
    flush();
  }, [summaryEditMode, persistAllocation]);

  return {
    summaryYear,
    setSummaryYear,
    allocationDraftsState,
    setAllocationDrafts,
    handleAllocationDraftChange,
    summarySearch,
    setSummarySearch,
    summaryEditMode,
    setSummaryEditMode,
    projectJustify,
    setProjectJustify,
    projectJustified,
    setProjectJustified,
    summaryMilestones,
    setSummaryMilestones,
    selectedEmployeeIds,
    setSelectedEmployeeIds,
    departmentFilter,
    setDepartmentFilter,
    addDrawerDeptFilter,
    setAddDrawerDeptFilter,
    addDrawerSearch,
    setAddDrawerSearch,
    allocationEdits,
    setAllocationEdits,
    saveStatusLabel,
    loadingSummaryYear,
    milestoneTotals,
    departmentAllocationPercentMap,
    departmentMap,
    departmentColorMap,
    allocationKey,
    allocationIndex,
    departmentAllocationTotals,
    projectTotals,
    projectTotalsByYear,
    employeeAvailability,
    employeeDepartmentPercentages,
    employeeNameMap,
    milestoneContributions,
    employeeMilestoneHours,
    filteredSummaryEmployees,
    employeesAvailableToAdd,
    handleAddEmployee,
    addMilestoneRow,
    handleAllocationBlur,
    hrEmployees,
    hrDepartments,
    allocations,
    employeesError,
    employeesErrorMsg,
    employeesLoading,
    departmentsError,
    departmentsErrorMsg,
    departmentsLoading,
    allocationsError,
  };
};
