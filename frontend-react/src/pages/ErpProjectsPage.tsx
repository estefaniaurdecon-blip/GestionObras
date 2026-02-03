// Vista principal de proyectos: creacion, resumen, diagrama Gantt y edicion detallada.

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  useColorModeValue,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";

import { keyframes } from "@emotion/react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "../components/layout/AppShell";
import {
  CreateProjectSection,
  GanttSection,
  ProjectDetailsModal,
  ProjectHero,
  ProjectsListSection,
  SummarySection,
} from "../components/erp";
import { YEAR_FILTER_OPTIONS } from "../utils/erp";
import {
  useErpSummary,
  useGanttData,
  useProjectCreation,
  useProjectDetails,
} from "../hooks/erp";

import {
  fetchErpProjects,
  type ErpProject as ErpProjectApi,
} from "../api/erpReports";

import { deleteErpProject, updateErpProject } from "../api/erpManagement";

import {
  fetchErpTasks,
  type ErpTask as ErpTaskApi,
} from "../api/erpTimeTracking";

import { fetchDepartments, type Department } from "../api/hr";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { fetchDepartments, type Department } from "../api/hr";
import { fetchAllTenants, type TenantOption } from "../api/users";
import { useRouter } from "@tanstack/react-router";
import {
  fetchActivities,
  fetchMilestones,
  fetchSubActivities,
  updateActivity,
  updateMilestone,
  updateSubActivity,
  type ErpActivity,
  type ErpMilestone,
  type ErpSubActivity,
} from "../api/erpStructure";

// Pagina principal de proyectos: resumen, listado, Gantt, creacion y edicion detallada.

export const ErpProjectsPage: React.FC = () => {
  // Tokens de estilo y animaci+n para la cabecera hero.

  const cardBg = useColorModeValue("white", "gray.700");

  const subtleText = useColorModeValue("gray.600", "gray.300");

  const fadeUp = keyframes`

    from { opacity: 0; transform: translateY(12px); }

    to { opacity: 1; transform: translateY(0); }

  `;

  // Estado de navegacion, filtros y utilidades.

  const [activeTab, setActiveTab] = useState(0);

  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");

  const toast = useToast();

  const queryClient = useQueryClient();

  const router = useRouter();

  const { isOpen: isAddModalOpen, onClose: onCloseAddModal } = useDisclosure();

  // Formulario de creacion de proyectos.

  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = currentUser?.is_super_admin === true;
  const tenantId = currentUser?.tenant_id ?? null;
  const effectiveTenantId = isSuperAdmin ? undefined : tenantId ?? undefined;
  const tenantReady = Boolean(currentUser && (isSuperAdmin || tenantId));
  const [createTenantId, setCreateTenantId] = useState<string>("");

  const {
    projectName,
    setProjectName,
    projectDescription,
    setProjectDescription,
    projectType,
    setProjectType,
    projectDepartmentId,
    setProjectDepartmentId,
    projectStart,
    setProjectStart,
    projectEnd,
    setProjectEnd,
    projectActivities,
    setProjectActivities,
    projectMilestones,
    setProjectMilestones,
    handleAddActivity,
    handleAddSubactivity,
    handleAddMilestone,
    handleSaveProject,
    createProjectMutation,
  } = useProjectCreation({
    isSuperAdmin,
    tenantId: tenantId ?? undefined,
    selectedTenantId: createTenantId,
  });

  // Fetch basico: proyectos, tareas, actividades, subactividades e hitos.

  const { data: projects = [] } = useQuery<ErpProjectApi[]>({
    queryKey: ["erp-projects", effectiveTenantId ?? "all"],
    queryFn: () => fetchErpProjects(effectiveTenantId),
    enabled: tenantReady,
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["erp-project-departments", effectiveTenantId ?? "all"],
    queryFn: () => fetchDepartments(effectiveTenantId),
    enabled: tenantReady,
  });

  const { data: tenants = [] } = useQuery<TenantOption[]>({
    queryKey: ["tenants-all"],
    queryFn: () => fetchAllTenants(),
    enabled: isSuperAdmin,
  });

  const activeTenants = useMemo(
    () => tenants.filter((tenant) => tenant.is_active !== false),
    [tenants],
  );

  const visibleProjects = useMemo(() => {
    if (isSuperAdmin) return projects;
    if (!tenantId) return [];
    return projects.filter((project) => project.tenant_id === tenantId);
  }, [projects, isSuperAdmin, tenantId]);

  const { data: rawTasks = [] } = useQuery<ErpTaskApi[]>({
    queryKey: ["erp-tasks", effectiveTenantId ?? "all"],
    queryFn: () => fetchErpTasks(effectiveTenantId),
    enabled: tenantReady,
  });

  // Si es super admin sin tenant seleccionado, traemos todos los empleados (sin filtro de tenant).

  const hrTenantId = effectiveTenantId ?? undefined;

  const { data: activities = [] } = useQuery<ErpActivity[]>({
    queryKey: ["erp-activities", effectiveTenantId ?? "all"],
    queryFn: () => fetchActivities(undefined, effectiveTenantId),
    enabled: tenantReady,
  });

  const { data: subactivities = [] } = useQuery<ErpSubActivity[]>({
    queryKey: ["erp-subactivities", effectiveTenantId ?? "all"],
    queryFn: () => fetchSubActivities({}, effectiveTenantId),
    enabled: tenantReady,
  });

  const { data: milestones = [] } = useQuery<ErpMilestone[]>({
    queryKey: ["erp-milestones", effectiveTenantId ?? "all"],
    queryFn: () => fetchMilestones({}, effectiveTenantId),
    enabled: tenantReady,
  });

  const visibleProjectIds = useMemo(
    () => new Set(visibleProjects.map((project) => project.id)),
    [visibleProjects],
  );

  const visibleActivities = useMemo(
    () => activities.filter((activity) => visibleProjectIds.has(activity.project_id)),
    [activities, visibleProjectIds],
  );

  const visibleMilestones = useMemo(
    () => milestones.filter((milestone) => visibleProjectIds.has(milestone.project_id)),
    [milestones, visibleProjectIds],
  );

  const visibleTasks = useMemo(
    () =>
      rawTasks.filter(
        (task) => task.project_id && visibleProjectIds.has(task.project_id),
      ),
    [rawTasks, visibleProjectIds],
  );

  const visibleActivityIds = useMemo(
    () => new Set(visibleActivities.map((activity) => activity.id)),
    [visibleActivities],
  );

  const visibleSubactivities = useMemo(
    () => subactivities.filter((sub) => visibleActivityIds.has(sub.activity_id)),
    [subactivities, visibleActivityIds],
  );

  const {
    detailsOpen,
    selectedProject,
    setSelectedProject,
    openProjectDetails,
    closeProjectDetails,
    editName,
    setEditName,
    editDescription,
    setEditDescription,
    editProjectType,
    setEditProjectType,
    editDepartmentId,
    setEditDepartmentId,
    editStart,
    setEditStart,
    editEnd,
    setEditEnd,
    editSubsidyPercent,
    setEditSubsidyPercent,
    editActive,
    setEditActive,
    activityEdits,
    setActivityEdits,
    subactivityEdits,
    setSubactivityEdits,
    milestoneEdits,
    setMilestoneEdits,
    selectedProjectActivities,
    selectedProjectSubactivities,
    selectedProjectMilestones,
    selectedProjectTasks,
  } = useProjectDetails({
    activities: visibleActivities,
    subactivities: visibleSubactivities,
    milestones: visibleMilestones,
    rawTasks: visibleTasks,
  });

  useEffect(() => {
    if (!selectedProject) return;
    const exists = projects.some((project) => project.id === selectedProject.id);
    if (exists) return;
    setSelectedProject(null);
    closeProjectDetails();
    toast({
      title: "Proyecto no disponible",
      description: "El proyecto ya no existe o pertenece a otro tenant.",
      status: "warning",
    });
  }, [projects, selectedProject, closeProjectDetails, setSelectedProject, toast]);

  const {
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
    departmentFilter,
    setDepartmentFilter,
    addDrawerDeptFilter,
    setAddDrawerDeptFilter,
    addDrawerSearch,
    setAddDrawerSearch,
    saveStatusLabel,
    saveErrorMessage,
    loadingSummaryYear,
    departmentAllocationPercentMap,
    departmentColorMap,
    departmentMap,
    allocationKey,
    allocationIndex,
    employeeAvailability,
    employeeDepartmentPercentages,
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
  } = useErpSummary({
    hrTenantId,
    currentUserId: currentUser?.id,
  });
  const { totalTasks, completedTasks, ganttTasks, ganttProjects } = useGanttData(
    {
      projects: visibleProjects,
      activities: visibleActivities,
      subactivities: visibleSubactivities,
      milestones: visibleMilestones,
      rawTasks: visibleTasks,
      selectedProjectId,
    },
  );

  const projectColumns = useMemo(
    () =>
      visibleProjects.map((project) => ({
        id: project.id,
        name: project.name || "Proyecto",
      })),
    [visibleProjects],
  );

  // Mutaciones de edicion en cascada para actividad, subactividad e hito.

  const updateActivityMutation = useMutation({
    mutationFn: async (input: {
      id: number;

      payload: Parameters<typeof updateActivity>[1];
    }) => updateActivity(input.id, input.payload),

    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["erp-activities"] });

      toast({ title: "Actividad actualizada", status: "success" });
    },

    onError: (error: any) => {
      toast({
        title: "Error al actualizar actividad",

        description:
          error?.response?.data?.detail ??
          "No se pudo actualizar la actividad.",

        status: "error",
      });
    },
  });

  const updateSubActivityMutation = useMutation({
    mutationFn: async (input: {
      id: number;

      payload: Parameters<typeof updateSubActivity>[1];
    }) => updateSubActivity(input.id, input.payload),

    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["erp-subactivities"] });

      toast({ title: "Subactividad actualizada", status: "success" });
    },

    onError: (error: any) => {
      toast({
        title: "Error al actualizar subactividad",

        description:
          error?.response?.data?.detail ??
          "No se pudo actualizar la subactividad.",

        status: "error",
      });
    },
  });

  const updateMilestoneMutation = useMutation({
    mutationFn: async (input: {
      id: number;

      payload: Parameters<typeof updateMilestone>[1];
    }) => updateMilestone(input.id, input.payload),

    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["erp-milestones"] });

      toast({ title: "Hito actualizado", status: "success" });
    },

    onError: (error: any) => {
      toast({
        title: "Error al actualizar hito",

        description:
          error?.response?.data?.detail ?? "No se pudo actualizar el hito.",

        status: "error",
      });
    },
  });

  // Elimina proyecto seleccionado.

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProject) {
        throw new Error("No hay proyecto seleccionado");
      }

      return deleteErpProject(selectedProject.id);
    },

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["erp-projects", effectiveTenantId ?? "all"],
      });

      setSelectedProject(null);

      closeProjectDetails();

      toast({ title: "Proyecto eliminado", status: "success" });
    },

    onError: async (error: any) => {
      // Fallback: si el backend no permite DELETE (405), intenta desactivar el proyecto.

      if (error?.response?.status === 405 && selectedProject) {
        try {
          const tenantIdForUpdate =
            selectedProject.tenant_id ??
            projects.find((project) => project.id === selectedProject.id)?.tenant_id ??
            undefined;
          await updateErpProject(
            selectedProject.id,
            { is_active: false },
            tenantIdForUpdate,
          );

          await queryClient.invalidateQueries({
            queryKey: ["erp-projects", effectiveTenantId ?? "all"],
          });

          toast({
            title: "Proyecto desactivado",

            description:
              "El backend no permite eliminar; se marc+ como inactivo.",

            status: "info",
          });

          setSelectedProject(null);

          closeProjectDetails();

          return;
        } catch (fallbackError: any) {
          toast({
            title: "Error al desactivar",

            description:
              fallbackError?.response?.data?.detail ??
              "No se pudo desactivar el proyecto despu+s del 405.",

            status: "error",
          });

          return;
        }
      }

      toast({
        title: "Error al eliminar",

        description:
          error?.response?.data?.detail ?? "No se pudo eliminar el proyecto.",

        status: "error",
      });
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProject) {
        throw new Error("No hay proyecto seleccionado");
      }
      const tenantIdForUpdate = isSuperAdmin
        ? selectedProject.tenant_id ??
          projects.find((project) => project.id === selectedProject.id)?.tenant_id ??
          undefined
        : tenantId ??
          selectedProject.tenant_id ??
          projects.find((project) => project.id === selectedProject.id)?.tenant_id ??
          undefined;
      const payload = {
        name: editName.trim(),
        description: editDescription.trim() || null,
        project_type: editProjectType,
        department_id: editDepartmentId === "" ? null : editDepartmentId,
<<<<<<< HEAD

=======
>>>>>>> dev
        start_date: editStart || null,
        end_date: editEnd || null,
        subsidy_percent: editSubsidyPercent ? Number(editSubsidyPercent) : 0,
        is_active: editActive,
      };

      try {
        return await updateErpProject(selectedProject.id, payload, tenantIdForUpdate);
      } catch (error: any) {
        if (error?.response?.status === 404 && tenantIdForUpdate != null && isSuperAdmin) {
          return updateErpProject(selectedProject.id, payload);
        }
        throw error;
      }
    },

    onSuccess: async (project) => {
      setSelectedProject(project);

      await queryClient.invalidateQueries({
        queryKey: ["erp-projects", effectiveTenantId ?? "all"],
      });

      toast({ title: "Proyecto actualizado", status: "success" });
    },

    onError: async (error: any) => {
      if (error?.response?.status === 404) {
        await queryClient.invalidateQueries({
          queryKey: ["erp-projects", effectiveTenantId ?? "all"],
        });
        setSelectedProject(null);
        closeProjectDetails();
        toast({
          title: "Proyecto no encontrado",
          description: "El proyecto ya no existe o no tienes acceso.",
          status: "warning",
        });
        return;
      }
      toast({
        title: "Error al actualizar",

        description:
          error?.response?.data?.detail ?? "No se pudo actualizar el proyecto.",

        status: "error",
      });
    },
  });

  // Guarda edicion del proyecto actual.

  const handleUpdateProject = () => {
    if (!selectedProject) {
      toast({ title: "Selecciona un proyecto", status: "warning" });

      return;
    }

    if (!editName.trim()) {
      toast({ title: "Nombre requerido", status: "warning" });

      return;
    }

    updateProjectMutation.mutate();
  };

  const handleDeleteProject = () => {
    if (!selectedProject) {
      toast({ title: "Selecciona un proyecto", status: "warning" });

      return;
    }

    deleteProjectMutation.mutate();
  };

  const handleUpdateActivity = (id: number) => {
    const form = activityEdits[id];

    if (!form) return;

    updateActivityMutation.mutate({
      id,

      payload: {
        name: form.name.trim() || "Actividad",

        description: form.description.trim() || null,

        start_date: form.start || null,

        end_date: form.end || null,
      },
    });
  };

  const handleUpdateSubactivity = (id: number) => {
    const form = subactivityEdits[id];

    if (!form) return;

    updateSubActivityMutation.mutate({
      id,

      payload: {
        name: form.name.trim() || "Subactividad",

        description: form.description.trim() || null,

        start_date: form.start || null,

        end_date: form.end || null,
      },
    });
  };

  const handleUpdateMilestone = (id: number) => {
    const form = milestoneEdits[id];

    if (!form) return;

    updateMilestoneMutation.mutate({
      id,

      payload: {
        title: form.title.trim() || "Hito",

        description: form.description.trim() || null,

        due_date: form.due || null,
      },
    });
  };

  const heroItems = [
    { label: "Proyectos activos", value: visibleProjects.length },

    { label: "Total tareas", value: totalTasks },

    {
      label: "Completadas",

      value: completedTasks,
    },
  ];

  //////////////////////////////////////Render principal./////////////////////////////////////////////////////////////////////////////

  return (
    <AppShell>
      <ProjectHero
        items={heroItems}
        title="Gestión de Proyectos"
        subtitle="Control y visualizacion de proyectos y tareas"
        animation={`${fadeUp} 0.6s ease-out`}
      />

      {/* Navegacion por pestanas: resumen, tarjetas, Gantt y creacion */}

      <Tabs
        variant="line"
        colorScheme="green"
        isLazy
        index={activeTab}
        onChange={setActiveTab}
      >
        <TabList borderBottomWidth="1px">
          <Tab>Proyectos</Tab>

          <Tab>Diagrama de Gantt</Tab>

          <Tab>Justificacion</Tab>

          <Tab>Crear</Tab>
        </TabList>

        <TabPanels mt={4}>
          {/* Listado detallado por proyecto con boton de edicion */}
          <TabPanel px={0}>
            <ProjectsListSection
              projects={visibleProjects}
              activities={visibleActivities}
              milestones={visibleMilestones}
              rawTasks={visibleTasks}
              onEditProject={openProjectDetails}
              onViewProjectDetails={(project) =>
                router.history.push(`/erp/projects/${project.id}/budget`)
              }
              onViewProjectDocs={(project) =>
                router.history.push(`/erp/projects/${project.id}/documents`)
              }
              cardBg={cardBg}
              subtleText={subtleText}
            />
          </TabPanel>

          {/* Diagrama Gantt filtrable y con selector de vista */}
          <TabPanel px={0}>
            <GanttSection
              ganttProjects={ganttProjects}
              selectedProjectId={selectedProjectId}
              onSelectedProjectChange={setSelectedProjectId}
              ganttTasks={ganttTasks}
              subtleText={subtleText}
            />
          </TabPanel>

          {/* Resumen editable tipo Excel: horas por empleado y proyecto */}
          <TabPanel px={0} minW="0" overflowX="hidden">
            <SummarySection
              summaryYear={summaryYear}
              subtleText={subtleText}
              loadingSummaryYear={loadingSummaryYear}
              saveStatusLabel={saveStatusLabel}
              saveErrorMessage={saveErrorMessage}
              summarySearch={summarySearch}
              onSummarySearchChange={setSummarySearch}
              departmentFilter={departmentFilter}
              onDepartmentFilterChange={setDepartmentFilter}
              hrDepartments={hrDepartments}
              yearOptions={YEAR_FILTER_OPTIONS}
              onSummaryYearChange={setSummaryYear}
              onRefreshAllocations={() =>
                queryClient.invalidateQueries({
                  queryKey: ["hr-allocations", summaryYear, hrTenantId],
                })
              }
              summaryEditMode={summaryEditMode}
              onToggleSummaryEdit={() => setSummaryEditMode((v) => !v)}
              departmentColorMap={departmentColorMap}
              projectColumns={projectColumns}
              summaryMilestones={summaryMilestones}
              onAddSummaryMilestone={addMilestoneRow}
              onRemoveSummaryMilestone={(projectId, index) =>
                setSummaryMilestones((prev) => {
                  const list = prev[projectId] ?? [];
                  const next = list.filter((_, mIdx) => mIdx !== index);
                  return { ...prev, [projectId]: next };
                })
              }
              projectJustify={projectJustify}
              onProjectJustifyChange={(projectId, value) =>
                setProjectJustify((prev) => ({
                  ...prev,
                  [projectId]: value,
                }))
              }
              projectJustified={projectJustified}
              filteredSummaryEmployees={filteredSummaryEmployees}
              employeeAvailability={employeeAvailability}
              departmentMap={departmentMap}
              departmentAllocationPercentMap={departmentAllocationPercentMap}
              employeeDepartmentPercentages={employeeDepartmentPercentages}
              allocationKey={allocationKey}
              allocationIndex={allocationIndex}
              allocationDraftsState={allocationDraftsState}
              onAllocationDraftChange={handleAllocationDraftChange}
              onAllocationBlur={handleAllocationBlur}
              isAddModalOpen={isAddModalOpen}
              onCloseAddModal={onCloseAddModal}
              hrTenantId={hrTenantId ?? null}
              hrEmployees={hrEmployees}
              selectedEmployeeIds={selectedEmployeeIds}
              employeesLoading={employeesLoading}
              departmentsLoading={departmentsLoading}
              employeesError={employeesError}
              departmentsError={departmentsError}
              employeesErrorMsg={employeesErrorMsg}
              departmentsErrorMsg={departmentsErrorMsg}
              onRetryEmployeesDepartments={() => {
                queryClient.invalidateQueries({
                  queryKey: ["hr-employees", hrTenantId],
                });
                queryClient.invalidateQueries({
                  queryKey: ["hr-departments", hrTenantId],
                });
              }}
              addDrawerDeptFilter={addDrawerDeptFilter}
              onAddDrawerDeptFilterChange={setAddDrawerDeptFilter}
              addDrawerSearch={addDrawerSearch}
              onAddDrawerSearchChange={setAddDrawerSearch}
              employeesAvailableToAdd={employeesAvailableToAdd}
              onAddEmployee={handleAddEmployee}
            />
          </TabPanel>

          {/* Alta de proyecto con actividades, subactividades e hitos locales */}
          <TabPanel px={0}>
            <CreateProjectSection
              isSuperAdmin={isSuperAdmin}
              selectedTenantId={createTenantId}
              activeTenants={activeTenants}
              onTenantChange={setCreateTenantId}
              projectName={projectName}
              onProjectNameChange={setProjectName}
              projectDescription={projectDescription}
              onProjectDescriptionChange={setProjectDescription}
              projectType={projectType}
              onProjectTypeChange={setProjectType}
              departments={
                isSuperAdmin && createTenantId
                  ? departments.filter(
                      (dept) => dept.tenant_id === Number(createTenantId),
                    )
                  : isSuperAdmin
                    ? []
                    : departments
              }
              projectDepartmentId={projectDepartmentId}
              onProjectDepartmentChange={setProjectDepartmentId}
              projectStart={projectStart}
              onProjectStartChange={setProjectStart}
              projectEnd={projectEnd}
              onProjectEndChange={setProjectEnd}
              projectActivities={projectActivities}
              setProjectActivities={setProjectActivities}
              onAddActivity={handleAddActivity}
              onAddSubactivity={handleAddSubactivity}
              projectMilestones={projectMilestones}
              setProjectMilestones={setProjectMilestones}
              onAddMilestone={handleAddMilestone}
              onSaveProject={handleSaveProject}
              isSaving={createProjectMutation.isPending}
              subtleText={subtleText}
              cardBg={cardBg}
            />
          </TabPanel>
        </TabPanels></Tabs>

      {/* Popup centrado de detalle/edicion del proyecto seleccionado */}

      <ProjectDetailsModal
        isOpen={detailsOpen}
        onClose={closeProjectDetails}
        selectedProject={selectedProject}
        subtleText={subtleText}
        selectedProjectActivities={selectedProjectActivities}
        selectedProjectSubactivities={selectedProjectSubactivities}
        selectedProjectMilestones={selectedProjectMilestones}
        selectedProjectTasks={selectedProjectTasks}
        editName={editName}
        setEditName={setEditName}
        editActive={editActive}
        setEditActive={setEditActive}
        editDescription={editDescription}
        setEditDescription={setEditDescription}
        editProjectType={editProjectType}
        setEditProjectType={setEditProjectType}
        departments={
          selectedProject?.tenant_id != null
            ? departments.filter(
                (dept) => dept.tenant_id === selectedProject.tenant_id,
              )
            : departments
        }
        editDepartmentId={editDepartmentId}
        setEditDepartmentId={setEditDepartmentId}
        editStart={editStart}
        setEditStart={setEditStart}
        editEnd={editEnd}
        setEditEnd={setEditEnd}
        editSubsidyPercent={editSubsidyPercent}
        setEditSubsidyPercent={setEditSubsidyPercent}
        activityEdits={activityEdits}
        setActivityEdits={setActivityEdits}
        subactivityEdits={subactivityEdits}
        setSubactivityEdits={setSubactivityEdits}
        milestoneEdits={milestoneEdits}
        setMilestoneEdits={setMilestoneEdits}
        onUpdateActivity={handleUpdateActivity}
        onUpdateSubactivity={handleUpdateSubactivity}
        onUpdateMilestone={handleUpdateMilestone}
        updateActivityPending={updateActivityMutation.isPending}
        updateSubActivityPending={updateSubActivityMutation.isPending}
        updateMilestonePending={updateMilestoneMutation.isPending}
        onDeleteProject={handleDeleteProject}
        deleteProjectPending={deleteProjectMutation.isPending}
        onUpdateProject={handleUpdateProject}
        updateProjectPending={updateProjectMutation.isPending}
      />
    </AppShell>
  );
};

export default ErpProjectsPage;
