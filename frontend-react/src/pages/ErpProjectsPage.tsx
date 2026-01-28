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
import { useTranslation } from "react-i18next";

import { AppShell } from "../components/layout/AppShell";
import {
  BudgetModal,
  BudgetSection,
  CreateProjectSection,
  GanttSection,
  ProjectDetailsModal,
  ProjectHero,
  ProjectsListSection,
  SummarySection,
} from "../components/erp";
import { YEAR_FILTER_OPTIONS } from "../utils/erp";
import {
  useBudgetEditor,
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

import { useCurrentUser } from "../hooks/useCurrentUser";
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

  const { t } = useTranslation();
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

  const { isOpen: isAddModalOpen, onClose: onCloseAddModal } = useDisclosure();

  // Formulario de creacion de proyectos.

  const {
    projectName,
    setProjectName,
    projectDescription,
    setProjectDescription,
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
  } = useProjectCreation();

  const [budgetProjectFilter, setBudgetProjectFilter] = useState<string>("");

  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = Boolean(currentUser?.is_super_admin);
  const tenantId = currentUser?.tenant_id ?? null;
  const effectiveTenantId = isSuperAdmin ? undefined : tenantId ?? undefined;
  const tenantReady = Boolean(currentUser && (isSuperAdmin || tenantId));

  // Fetch basico: proyectos, tareas, actividades, subactividades e hitos.

  const { data: projects = [] } = useQuery<ErpProjectApi[]>({
    queryKey: ["erp-projects", effectiveTenantId ?? "all"],
    queryFn: () => fetchErpProjects(effectiveTenantId),
    enabled: tenantReady,
  });

  const visibleProjects = useMemo(() => {
    if (isSuperAdmin) return projects;
    if (!tenantId) return [];
    return projects.filter((project) => project.tenant_id === tenantId);
  }, [projects, isSuperAdmin, tenantId]);

  useEffect(() => {
    if (!budgetProjectFilter && visibleProjects.length > 0) {
      setBudgetProjectFilter(String(visibleProjects[0].id));
    }
  }, [budgetProjectFilter, visibleProjects]);

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
    loadingSummaryYear,
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

  const selectedBudgetProjectId = budgetProjectFilter
    ? Number(budgetProjectFilter)
    : null;

  const {
    budgetsEditMode,
    setBudgetsEditMode,
    budgetDrafts,
    generalExpensesMode,
    setGeneralExpensesMode,
    savingBudgets,
    seedingTemplate,
    externalCollaborations,
    isExternalCollaborationsLoading,
    externalCollabSelections,
    setExternalCollabSelections,
    displayBudgetRows,
    groupedBudgetRows,
    budgetParentMap,
    budgetParentTotals,
    budgetsTabTotals,
    budgetsDiffH1,
    budgetsDiffH2,
    canEditBudgets,
    hasRealBudgets,
    hasBudgetDrafts,
    budgetMilestonesCount,
    budgetsQueryState,
    seedTemplateBudgetLines,
    addBudgetMilestone,
    handleGeneralExpensesPercent,
    handleGeneralExpensesAmount,
    handleAddExternalCollaborationRow,
    handleRemoveExternalCollaborationRow,
    handleBudgetCellSave,
    handleBudgetSaveAll,
    handleBudgetSave,
    openBudgetModal,
    budgetModalOpen,
    closeBudgetModal,
    budgetModalInitial,
    budgetModalMode,
    isBudgetModalSaving,
  } = useBudgetEditor({
    projectId: selectedBudgetProjectId,
    projectMilestones: visibleMilestones,
    tenantId: effectiveTenantId,
  });

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
          await updateErpProject(selectedProject.id, { is_active: false });

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

      return updateErpProject(selectedProject.id, {
        name: editName.trim(),

        description: editDescription.trim() || null,

        start_date: editStart || null,

        end_date: editEnd || null,

        subsidy_percent: editSubsidyPercent ? Number(editSubsidyPercent) : 0,

        is_active: editActive,
      });
    },

    onSuccess: async (project) => {
      setSelectedProject(project);

      await queryClient.invalidateQueries({
        queryKey: ["erp-projects", effectiveTenantId ?? "all"],
      });

      toast({ title: "Proyecto actualizado", status: "success" });
    },

    onError: (error: any) => {
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
        title="Gestion de Proyectos"
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
          <Tab>Resumen</Tab>

          <Tab>Proyectos</Tab>

          <Tab>Diagrama de Gantt</Tab>

          <Tab>Presupuestos</Tab>

          <Tab>Crear</Tab>
        </TabList>

        <TabPanels mt={4}>
          {/* Resumen editable tipo Excel: horas por empleado y proyecto */}
          <TabPanel px={0} minW="0" overflowX="hidden">
            <SummarySection
              summaryYear={summaryYear}
              subtleText={subtleText}
              loadingSummaryYear={loadingSummaryYear}
              saveStatusLabel={saveStatusLabel}
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

          {/* Listado detallado por proyecto con boton de edicion */}
          <TabPanel px={0}>
            <ProjectsListSection
              projects={visibleProjects}
              activities={visibleActivities}
              milestones={visibleMilestones}
              rawTasks={visibleTasks}
              onOpenProjectDetails={openProjectDetails}
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

          <TabPanel px={0}>
            <BudgetSection
              projects={visibleProjects}
              budgetProjectFilter={budgetProjectFilter}
              onBudgetProjectChange={setBudgetProjectFilter}
              selectedBudgetProjectId={selectedBudgetProjectId}
              budgetMilestonesCount={budgetMilestonesCount}
              onAddBudgetMilestone={addBudgetMilestone}
              budgetsEditMode={budgetsEditMode}
              onToggleEditMode={() => setBudgetsEditMode((prev) => !prev)}
              canEditBudgets={canEditBudgets}
              onSaveTable={handleBudgetSaveAll}
              hasBudgetDrafts={hasBudgetDrafts}
              savingBudgets={savingBudgets}
              hasRealBudgets={hasRealBudgets}
              onSeedTemplate={seedTemplateBudgetLines}
              seedingTemplate={seedingTemplate}
              budgetsQueryState={budgetsQueryState}
              displayBudgetRows={displayBudgetRows}
              groupedBudgetRows={groupedBudgetRows}
              budgetDrafts={budgetDrafts}
              generalExpensesMode={generalExpensesMode}
              onGeneralExpensesModeChange={(budgetId, mode) =>
                setGeneralExpensesMode((prev) => ({
                  ...prev,
                  [budgetId]: mode,
                }))
              }
              onGeneralExpensesPercent={handleGeneralExpensesPercent}
              onGeneralExpensesAmount={handleGeneralExpensesAmount}
              externalCollaborations={externalCollaborations}
              isExternalCollaborationsLoading={isExternalCollaborationsLoading}
              externalCollabSelections={externalCollabSelections}
              onExternalCollabSelectionChange={(budgetId, value) =>
                setExternalCollabSelections((prev) => ({
                  ...prev,
                  [budgetId]: value,
                }))
              }
              onAddExternalCollaborationRow={handleAddExternalCollaborationRow}
              onBudgetCellSave={handleBudgetCellSave}
              onOpenBudgetModal={openBudgetModal}
              onRemoveExternalCollaborationRow={
                handleRemoveExternalCollaborationRow
              }
              budgetParentMap={budgetParentMap}
              budgetParentTotals={budgetParentTotals}
              budgetsTabTotals={budgetsTabTotals}
              budgetsDiffH1={budgetsDiffH1}
              budgetsDiffH2={budgetsDiffH2}
              subtleText={subtleText}
              externalCollabSelectPlaceholder={t(
                "externalCollaborations.form.selectPlaceholder",
              )}
            />
          </TabPanel>

          {/* Alta de proyecto con actividades, subactividades e hitos locales */}
          <TabPanel px={0}>
            <CreateProjectSection
              projectName={projectName}
              onProjectNameChange={setProjectName}
              projectDescription={projectDescription}
              onProjectDescriptionChange={setProjectDescription}
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

      <BudgetModal
        isOpen={budgetModalOpen}
        onClose={closeBudgetModal}
        onSave={handleBudgetSave}
        initialValues={budgetModalInitial}
        title={
          budgetModalMode === "edit"
            ? "Editar presupuesto"
            : "Agregar presupuesto"
        }
        submitLabel={budgetModalMode === "edit" ? "Actualizar" : "Guardar"}
        isSaving={isBudgetModalSaving}
      />

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
