
import { useState } from "react";

import { useToast } from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createActivity, createMilestone, createSubActivity } from "../../api/erpStructure";
import { createErpProject } from "../../api/erpManagement";
import { createId } from "../../utils/erp";
import type { ProjectActivityForm, ProjectMilestoneForm } from "../../utils/erp";

export const useProjectCreation = ({
  isSuperAdmin,
  tenantId,
  selectedTenantId,
}: {
  isSuperAdmin: boolean;
  tenantId?: number | null;
  selectedTenantId: string;
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectType, setProjectType] = useState<
    "regional" | "nacional" | "internacional"
  >("regional");
  const [projectStart, setProjectStart] = useState("");
  const [projectEnd, setProjectEnd] = useState("");
  const [projectActivities, setProjectActivities] = useState<ProjectActivityForm[]>([]);
  const [projectMilestones, setProjectMilestones] = useState<ProjectMilestoneForm[]>([]);

  const handleAddActivity = () => {
    setProjectActivities((prev) => [
      ...prev,
      {
        id: createId(),
        name: `Actividad ${prev.length + 1}`,
        weight: 0,
        start: "",
        end: "",
        subactivities: [],
      },
    ]);
  };

  const handleAddSubactivity = (actId: string) => {
    setProjectActivities((prev) =>
      prev.map((act) =>
        act.id === actId
          ? {
              ...act,
              subactivities: [
                ...act.subactivities,
                {
                  id: createId(),
                  name: `Subactividad ${act.subactivities.length + 1}`,
                  weight: 0,
                  start: "",
                  end: "",
                },
              ],
            }
          : act,
      ),
    );
  };

  const handleAddMilestone = () => {
    setProjectMilestones((prev) => [
      ...prev,
      { id: createId(), name: `Hito ${prev.length + 1}`, start: "", end: "" },
    ]);
  };

  const createProjectMutation = useMutation({
    mutationFn: async () => {
      const effectiveTenantId = isSuperAdmin
        ? Number(selectedTenantId)
        : tenantId ?? undefined;
      const project = await createErpProject(
        {
          name: projectName.trim(),
          description: projectDescription.trim() || null,
          project_type: projectType,
          start_date: projectStart || null,
          end_date: projectEnd || null,
        },
        effectiveTenantId,
      );

      for (const activity of projectActivities) {
        const activityDescription =
          activity.weight > 0 ? `Peso: ${activity.weight}%` : null;

        const createdActivity = await createActivity(
          {
            project_id: project.id,
            name: activity.name.trim() || "Actividad",
            description: activityDescription,
            start_date: activity.start || null,
            end_date: activity.end || null,
          },
          effectiveTenantId,
        );

        for (const subactivity of activity.subactivities) {
          const subDescription =
            subactivity.weight > 0 ? `Peso: ${subactivity.weight}%` : null;

          await createSubActivity(
            {
              activity_id: createdActivity.id,
              name: subactivity.name.trim() || "Subactividad",
              description: subDescription,
              start_date: subactivity.start || null,
              end_date: subactivity.end || null,
            },
            effectiveTenantId,
          );
        }
      }

      for (const milestone of projectMilestones) {
        const milestoneDescription =
          milestone.start && milestone.end && milestone.start !== milestone.end
            ? `Inicio: ${milestone.start}. Fin: ${milestone.end}.`
            : milestone.start
              ? `Inicio: ${milestone.start}.`
              : milestone.end
                ? `Fin: ${milestone.end}.`
                : null;

        await createMilestone(
          {
            project_id: project.id,
            title: milestone.name.trim() || "Hito",
            due_date: milestone.end || milestone.start || null,
            description: milestoneDescription,
          },
          effectiveTenantId,
        );
      }

      return project;
    },
    onSuccess: async () => {
      setProjectName("");
      setProjectDescription("");
      setProjectType("regional");
      setProjectStart("");
      setProjectEnd("");
      setProjectActivities([]);
      setProjectMilestones([]);
      await queryClient.invalidateQueries({ queryKey: ["erp-projects"] });
      toast({ title: "Proyecto guardado", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al guardar",
        description:
          error?.response?.data?.detail ?? "No se pudo guardar el proyecto.",
        status: "error",
      });
    },
  });

  const handleSaveProject = () => {
    if (!projectName.trim()) {
      toast({ title: "Nombre requerido", status: "warning" });
      return;
    }
    if (isSuperAdmin && !selectedTenantId) {
      toast({ title: "Selecciona un tenant", status: "warning" });
      return;
    }
    createProjectMutation.mutate();
  };

  return {
    projectName,
    setProjectName,
    projectDescription,
    setProjectDescription,
    projectType,
    setProjectType,
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
  };
};
