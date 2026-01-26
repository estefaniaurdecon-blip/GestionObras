import { useMemo } from "react";

import type { ErpProject as ErpProjectApi } from "../../api/erpReports";
import type { ErpTask as ErpTaskApi } from "../../api/erpTimeTracking";
import type { ErpActivity, ErpMilestone, ErpSubActivity } from "../../api/erpStructure";
import { computeProgress, toDateSafe } from "../../utils/erp";
import type { ErpTaskLocal as ErpTask, GanttTask, Status } from "../../utils/erp";

type UseGanttDataArgs = {
  projects: ErpProjectApi[];
  activities: ErpActivity[];
  subactivities: ErpSubActivity[];
  milestones: ErpMilestone[];
  rawTasks: ErpTaskApi[];
  selectedProjectId: string;
};

export const useGanttData = ({
  projects,
  activities,
  subactivities,
  milestones,
  rawTasks,
  selectedProjectId,
}: UseGanttDataArgs) => {
  const tasks: ErpTask[] = useMemo(() => {
    const now = new Date();
    return rawTasks
      .filter((task) => task.start_date && task.end_date)
      .map((task) => {
        const status = task.is_completed
          ? "completed"
          : task.status === "done"
            ? "completed"
            : task.status === "in_progress"
              ? "in_progress"
              : "pending";

        const start = new Date(task.start_date as string);
        const end = new Date(task.end_date as string);
        const durationMs = end.getTime() - start.getTime();
        let progress = 0;

        if (status === "completed") {
          progress = 100;
        } else if (status === "in_progress" && durationMs > 0) {
          const elapsedMs = now.getTime() - start.getTime();
          const ratio = Math.min(Math.max(elapsedMs / durationMs, 0), 1);
          progress = Math.round(ratio * 100);
        }

        return {
          id: task.id,
          project_id: task.project_id ?? null,
          name: task.title,
          start_date: task.start_date ?? "",
          end_date: task.end_date ?? "",
          status,
          progress,
        };
      });
  }, [rawTasks]);

  const totalTasks = rawTasks.length;
  const completedTasks = rawTasks.filter(
    (task) =>
      task.is_completed ||
      task.status === "done" ||
      task.status === "completed",
  ).length;

  const projectNameMap = useMemo(() => {
    const map = new Map<number, string>();
    projects.forEach((project) => {
      map.set(project.id, project.name);
    });
    return map;
  }, [projects]);

  const projectMap = useMemo(() => {
    const map = new Map<number, ErpProjectApi>();
    projects.forEach((project) => map.set(project.id, project));
    return map;
  }, [projects]);

  const activityMap = useMemo(() => {
    const map = new Map<number, ErpActivity>();
    activities.forEach((activity) => {
      map.set(activity.id, activity);
    });
    return map;
  }, [activities]);

  const ganttItems: GanttTask[] = useMemo(() => {
    const items: GanttTask[] = [];
    const now = new Date();

    projects.forEach((project) => {
      const projectStart = toDateSafe(project.start_date) ?? new Date();
      const projectEnd =
        toDateSafe(project.end_date) ??
        new Date(projectStart.getTime() + 30 * 24 * 60 * 60 * 1000);
      const progress = computeProgress(projectStart, projectEnd);
      const status: Status =
        now >= projectEnd
          ? "on-time"
          : now >= projectStart
            ? "planned"
            : "planned";
      const projectMilestones = milestones.filter(
        (m) => m.project_id === project.id,
      );
      const milestoneDates = projectMilestones
        .map(
          (m) =>
            toDateSafe(m.due_date) ??
            toDateSafe((m as any).end_date) ??
            toDateSafe((m as any).start_date),
        )
        .filter((d): d is Date => Boolean(d));

      items.push({
        id: `project-${project.id}`,
        name: project.name,
        start: projectStart,
        end: projectEnd,
        progress,
        type: "project",
        status,
        project: project.name,
        projectId: project.id,
        activityId: undefined,
        hasMilestones: projectMilestones.length > 0,
        milestoneDates,
      });
    });

    activities.forEach((activity) => {
      const project = projectMap.get(activity.project_id);
      const fallbackStart = project ? toDateSafe(project.start_date) : null;
      const fallbackEnd = project ? toDateSafe(project.end_date) : null;
      const start =
        toDateSafe(activity.start_date) ?? fallbackStart ?? new Date();
      const end =
        toDateSafe(activity.end_date) ??
        fallbackEnd ??
        new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
      const progress = computeProgress(start, end);
      const status: Status =
        now >= end ? "on-time" : now >= start ? "planned" : "planned";

      items.push({
        id: `activity-${activity.id}`,
        name: activity.name,
        start,
        end,
        progress,
        type: "task",
        status,
        project: projectNameMap.get(activity.project_id),
        projectId: activity.project_id,
        activityId: activity.id,
      });
    });

    subactivities.forEach((subactivity) => {
      const activity = activityMap.get(subactivity.activity_id);
      const project = activity ? projectMap.get(activity.project_id) : null;
      if (!activity) return;

      const fallbackStart =
        toDateSafe(activity.start_date) ??
        (project ? toDateSafe(project.start_date) : null);
      const fallbackEnd =
        toDateSafe(activity.end_date) ??
        (project ? toDateSafe(project.end_date) : null);
      const start =
        toDateSafe(subactivity.start_date) ?? fallbackStart ?? new Date();
      const end =
        toDateSafe(subactivity.end_date) ??
        fallbackEnd ??
        new Date(start.getTime() + 5 * 24 * 60 * 60 * 1000);
      const progress = computeProgress(start, end);
      const status: Status =
        now >= end ? "on-time" : now >= start ? "planned" : "planned";

      items.push({
        id: `subactivity-${subactivity.id}`,
        name: `Sub: ${subactivity.name}`,
        start,
        end,
        progress,
        type: "task",
        status,
        project: projectNameMap.get(activity.project_id),
        projectId: activity.project_id,
        activityId: subactivity.activity_id,
      });
    });

    milestones.forEach((milestone) => {
      const project = projectMap.get(milestone.project_id);
      const fallbackDue =
        toDateSafe(milestone.due_date) ??
        toDateSafe(project?.end_date) ??
        toDateSafe(project?.start_date) ??
        new Date();
      const due = fallbackDue;
      const status: Status = now > due ? "on-time" : "planned";

      items.push({
        id: `milestone-${milestone.id}`,
        name: milestone.title,
        start: due,
        end: due,
        progress: 100,
        type: "milestone",
        status,
        project: projectNameMap.get(milestone.project_id),
        projectId: milestone.project_id,
        activityId: milestone.activity_id ?? undefined,
      });
    });

    rawTasks.forEach((task) => {
      if (!task.start_date || !task.end_date) return;
      const start = new Date(task.start_date as string);
      const end = new Date(task.end_date as string);
      const progress =
        task.is_completed || task.status === "done"
          ? 100
          : computeProgress(start, end);
      const status: Status =
        task.is_completed || task.status === "done"
          ? "on-time"
          : task.status === "in_progress"
            ? "at-risk"
            : "planned";

      items.push({
        id: `task-${task.id}`,
        name: task.title,
        start,
        end,
        progress,
        type: "task",
        status,
        project: projectNameMap.get(task.project_id ?? 0),
        projectId: task.project_id ?? undefined,
      });
    });

    return items;
  }, [
    projects,
    activities,
    subactivities,
    milestones,
    rawTasks,
    projectNameMap,
    projectMap,
    activityMap,
  ]);

  const ganttTasks: GanttTask[] = useMemo(() => {
    if (selectedProjectId === "all") {
      return ganttItems
        .filter((item) => item.type === "project")
        .sort((a, b) => a.start.getTime() - b.start.getTime());
    }

    const filtered = ganttItems.filter(
      (item) => item.projectId && String(item.projectId) === selectedProjectId,
    );
    const projectIdNum = Number(selectedProjectId);
    const projectRow = filtered.find((t) => t.id === `project-${projectIdNum}`);
    const activityRows = filtered
      .filter((t) => t.id.startsWith("activity-"))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    const subRows = filtered
      .filter((t) => t.id.startsWith("subactivity-"))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    const milestoneRows = filtered
      .filter((t) => t.id.startsWith("milestone-"))
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    const ordered: GanttTask[] = [];
    if (projectRow) ordered.push(projectRow);

    activityRows.forEach((act) => {
      ordered.push(act);
      const actId = act.activityId;
      if (typeof actId !== "number") return;
      subRows
        .filter((sub) => sub.activityId === actId)
        .forEach((sub) => ordered.push(sub));
      milestoneRows
        .filter(
          (mil) =>
            typeof mil.activityId === "number" && mil.activityId === actId,
        )
        .forEach((mil) => ordered.push(mil));
    });

    milestoneRows.filter((mil) => !mil.activityId).forEach((mil) => ordered.push(mil));
    return ordered;
  }, [selectedProjectId, ganttItems]);

  return {
    tasks,
    totalTasks,
    completedTasks,
    ganttTasks,
    ganttProjects: projects,
  };
};
