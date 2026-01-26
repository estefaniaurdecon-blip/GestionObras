import { useEffect, useMemo, useState } from "react";

import type { ErpActivity, ErpMilestone, ErpSubActivity } from "../../api/erpStructure";
import type { ErpProject as ErpProjectApi } from "../../api/erpReports";
import type { ErpTask as ErpTaskApi } from "../../api/erpTimeTracking";
import { toDateInput } from "../../utils/erp";

type UseProjectDetailsArgs = {
  activities: ErpActivity[];
  subactivities: ErpSubActivity[];
  milestones: ErpMilestone[];
  rawTasks: ErpTaskApi[];
};

export const useProjectDetails = ({
  activities,
  subactivities,
  milestones,
  rawTasks,
}: UseProjectDetailsArgs) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ErpProjectApi | null>(
    null,
  );
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editActive, setEditActive] = useState(true);

  const [activityEdits, setActivityEdits] = useState<
    Record<number, { name: string; start: string; end: string; description: string }>
  >({});
  const [subactivityEdits, setSubactivityEdits] = useState<
    Record<number, { name: string; start: string; end: string; description: string }>
  >({});
  const [milestoneEdits, setMilestoneEdits] = useState<
    Record<number, { title: string; due: string; description: string }>
  >({});

  const openProjectDetails = (project: ErpProjectApi) => {
    setSelectedProject(project);
    setDetailsOpen(true);
  };

  const closeProjectDetails = () => {
    setDetailsOpen(false);
  };

  const selectedProjectActivities = useMemo(
    () =>
      selectedProject
        ? activities.filter((act) => act.project_id === selectedProject.id)
        : [],
    [selectedProject, activities],
  );

  const selectedProjectMilestones = useMemo(
    () =>
      selectedProject
        ? milestones.filter((mil) => mil.project_id === selectedProject.id)
        : [],
    [selectedProject, milestones],
  );

  const selectedProjectTasks = useMemo(
    () =>
      selectedProject
        ? rawTasks.filter((task) => task.project_id === selectedProject.id)
        : [],
    [selectedProject, rawTasks],
  );

  const selectedProjectSubactivities = useMemo(() => {
    if (!selectedProject) return [];
    const activityIds = new Set(selectedProjectActivities.map((a) => a.id));
    return subactivities.filter((sub) => activityIds.has(sub.activity_id));
  }, [selectedProject, selectedProjectActivities, subactivities]);

  useEffect(() => {
    if (!selectedProject) return;
    setEditName(selectedProject.name ?? "");
    setEditDescription(selectedProject.description ?? "");
    setEditStart(toDateInput(selectedProject.start_date));
    setEditEnd(toDateInput(selectedProject.end_date));
    setEditActive(selectedProject.is_active ?? true);
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedProject) return;

    const nextActivities: Record<
      number,
      { name: string; start: string; end: string; description: string }
    > = {};
    selectedProjectActivities.forEach((act) => {
      nextActivities[act.id] = {
        name: act.name ?? "",
        start: toDateInput(act.start_date),
        end: toDateInput(act.end_date),
        description: act.description ?? "",
      };
    });
    setActivityEdits(nextActivities);

    const nextSubactivities: Record<
      number,
      { name: string; start: string; end: string; description: string }
    > = {};
    selectedProjectSubactivities.forEach((sub) => {
      nextSubactivities[sub.id] = {
        name: sub.name ?? "",
        start: toDateInput(sub.start_date),
        end: toDateInput(sub.end_date),
        description: sub.description ?? "",
      };
    });
    setSubactivityEdits(nextSubactivities);

    const nextMilestones: Record<
      number,
      { title: string; due: string; description: string }
    > = {};
    selectedProjectMilestones.forEach((mil) => {
      nextMilestones[mil.id] = {
        title: mil.title ?? "",
        due: toDateInput(mil.due_date),
        description: mil.description ?? "",
      };
    });
    setMilestoneEdits(nextMilestones);
  }, [
    selectedProject,
    selectedProjectActivities,
    selectedProjectSubactivities,
    selectedProjectMilestones,
  ]);

  return {
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
  };
};
