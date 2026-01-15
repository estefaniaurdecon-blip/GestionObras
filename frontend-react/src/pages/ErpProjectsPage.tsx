import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Select,
  SimpleGrid,
  Stack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  Textarea,
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gantt, Task as GanttTask, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";

import { fetchErpProjects, type ErpProject } from "../api/erpReports";
import { createErpProject, createErpTask } from "../api/erpManagement";
import { fetchErpTasks, type ErpTask } from "../api/erpTimeTracking";
import {
  createActivity,
  createDeliverable,
  createMilestone,
  createSubActivity,
  fetchTaskTemplates,
  type ErpTaskTemplate,
} from "../api/erpStructure";
import { AppShell } from "../components/layout/AppShell";
import { useCurrentUser } from "../hooks/useCurrentUser";

// Cabecera personalizada del listado del Gantt.
const GanttTaskListHeader: React.FC<{
  headerHeight: number;
  fontFamily: string;
  fontSize: string;
  rowWidth: string;
  labels: string[];
}> = ({ headerHeight, fontFamily, fontSize, rowWidth, labels }) => (
  <div
    style={{
      fontFamily,
      fontSize,
      borderBottom: "1px solid rgba(0,0,0,0.08)",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: headerHeight - 2,
      }}
    >
      {labels.map((label, index) => (
        <div
          key={label}
          style={{
            minWidth: rowWidth,
            paddingLeft: 8,
            paddingRight: 8,
            borderRight: index < 2 ? "1px solid rgba(0,0,0,0.08)" : "none",
            fontWeight: 600,
          }}
        >
          {label}
        </div>
      ))}
    </div>
  </div>
);

type DraftTask = {
  id: string;
  type: "template" | "manual";
  templateId?: number;
  title: string;
};

type DraftSubActivity = {
  id: string;
  name: string;
  weight: number;
  start_date?: string;
  end_date?: string;
  tasks: DraftTask[];
};

type DraftActivity = {
  id: string;
  name: string;
  weight: number;
  start_date?: string;
  end_date?: string;
  subactivities: DraftSubActivity[];
};

type DraftDeliverable = {
  id: string;
  title: string;
  kind: "text" | "link";
  value: string;
};

type DraftMilestone = {
  id: string;
  title: string;
  due_date?: string;
  allow_late: boolean;
  deliverables: DraftDeliverable[];
};

// Pantalla de proyectos: listado, creacion y Gantt.
export const ErpProjectsPage: React.FC = () => {
  // Utilidades y estilos base.
  const toast = useToast();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.500", "gray.300");
  const panelBg = useColorModeValue("gray.50", "gray.800");
  const panelBorder = useColorModeValue("gray.200", "gray.600");
  const accent = useColorModeValue("brand.500", "brand.300");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  // Estado del formulario de creacion de proyectos y vista Gantt.
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectStartDate, setProjectStartDate] = useState("");
  const [projectEndDate, setProjectEndDate] = useState("");
  const [ganttView, setGanttView] = useState<ViewMode>(ViewMode.Week);
  const [showActivities, setShowActivities] = useState(true);
  const [showMilestones, setShowMilestones] = useState(true);
  const [activityDrafts, setActivityDrafts] = useState<DraftActivity[]>([]);
  const [milestoneDrafts, setMilestoneDrafts] = useState<DraftMilestone[]>([]);
  const [taskTemplateSelections, setTaskTemplateSelections] = useState<
    Record<string, string>
  >({});
  const [projectSaving, setProjectSaving] = useState(false);
  const draftIdRef = useRef(1);

  // Determina permisos del usuario actual.
  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = Boolean(currentUser?.is_super_admin);
  const isTenantAdmin = Boolean(currentUser?.role_id) && !isSuperAdmin;

  // Datos principales: proyectos y tareas del ERP.
  // Queries: proyectos y tareas para KPIs y Gantt.
  const {
    data: projects,
    isLoading,
    error,
  } = useQuery<ErpProject[]>({
    queryKey: ["erp-projects"],
    queryFn: fetchErpProjects,
  });

  // Tareas para calcular progreso y cargar barras del Gantt.
  const { data: tasks } = useQuery<ErpTask[]>({
    queryKey: ["erp-tasks"],
    queryFn: fetchErpTasks,
  });

  // Catalogo de plantillas para tareas.
  const { data: taskTemplates } = useQuery<ErpTaskTemplate[]>({
    queryKey: ["erp-task-templates"],
    queryFn: fetchTaskTemplates,
  });

  // KPIs del resumen.
  const projectCount = projects?.length ?? 0;
  const taskCount = tasks?.length ?? 0;
  const assignedCount =
    tasks?.filter((task) => task.assigned_to_id).length ?? 0;
  const canManageProjects = isSuperAdmin || isTenantAdmin;
  const ganttHeaderLabels = useMemo(
    () => [
      t("erp.projects.gantt.headers.name"),
      t("erp.projects.gantt.headers.start"),
      t("erp.projects.gantt.headers.end"),
    ],
    [t]
  );

  const nextDraftId = () => `draft-${draftIdRef.current++}`;
  const createInitialActivityDrafts = (): DraftActivity[] => {
    const activityId = nextDraftId();
    const subactivityId = nextDraftId();
    return [
      {
        id: activityId,
        name: t("erp.projects.defaults.activity", { index: 1 }),
        weight: 0,
        start_date: "",
        end_date: "",
        subactivities: [
          {
            id: subactivityId,
            name: t("erp.projects.defaults.subactivity", { index: 1 }),
            weight: 0,
            start_date: "",
            end_date: "",
            tasks: [],
          },
        ],
      },
    ];
  };

  const createInitialMilestoneDrafts = (): DraftMilestone[] => [
    {
      id: nextDraftId(),
      title: t("erp.projects.defaults.milestone", { index: 1 }),
      due_date: "",
      allow_late: false,
      deliverables: [],
    },
  ];

  const totalActivityWeight = useMemo(
    () => activityDrafts.reduce((acc, activity) => acc + activity.weight, 0),
    [activityDrafts]
  );

  useEffect(() => {
    if (activityDrafts.length === 0) {
      setActivityDrafts(createInitialActivityDrafts());
    }
    if (milestoneDrafts.length === 0) {
      setMilestoneDrafts(createInitialMilestoneDrafts());
    }
  }, []);

  const handleAddActivityDraft = () => {
    const newActivity: DraftActivity = {
      id: nextDraftId(),
      name: t("erp.projects.defaults.activity", {
        index: activityDrafts.length + 1,
      }),
      weight: 0,
      subactivities: [],
    };
    setActivityDrafts((prev) => [...prev, newActivity]);
    setShowActivities(true);
  };

  const handleRemoveActivityDraft = (activityId: string) => {
    setActivityDrafts((prev) =>
      prev.filter((activity) => activity.id != activityId)
    );
  };

  const handleUpdateActivityDraft = (
    activityId: string,
    changes: Partial<DraftActivity>
  ) => {
    setActivityDrafts((prev) =>
      prev.map((activity) =>
        activity.id === activityId ? { ...activity, ...changes } : activity
      )
    );
  };

  const handleAddSubActivityDraft = (activityId: string) => {
    setActivityDrafts((prev) =>
      prev.map((activity) => {
        if (activity.id !== activityId) return activity;
        const newSub: DraftSubActivity = {
          id: nextDraftId(),
          name: t("erp.projects.defaults.subactivity", {
            index: activity.subactivities.length + 1,
          }),
          weight: 0,
          start_date: "",
          end_date: "",
          tasks: [],
        };
        return {
          ...activity,
          subactivities: [...activity.subactivities, newSub],
        };
      })
    );
  };

  const handleRemoveSubActivityDraft = (activityId: string, subId: string) => {
    setActivityDrafts((prev) =>
      prev.map((activity) => {
        if (activity.id !== activityId) return activity;
        return {
          ...activity,
          subactivities: activity.subactivities.filter(
            (sub) => sub.id != subId
          ),
        };
      })
    );
  };

  const handleUpdateSubActivityDraft = (
    activityId: string,
    subId: string,
    changes: Partial<DraftSubActivity>
  ) => {
    setActivityDrafts((prev) =>
      prev.map((activity) => {
        if (activity.id !== activityId) return activity;
        return {
          ...activity,
          subactivities: activity.subactivities.map((sub) =>
            sub.id === subId ? { ...sub, ...changes } : sub
          ),
        };
      })
    );
  };

  const handleAddTaskFromTemplate = (
    activityId: string,
    subId: string,
    templateId: number
  ) => {
    const template = taskTemplates?.find((item) => item.id === templateId);
    if (!template) return;
    const task: DraftTask = {
      id: nextDraftId(),
      type: "template",
      templateId,
      title: template.title,
    };
    setActivityDrafts((prev) =>
      prev.map((activity) => {
        if (activity.id !== activityId) return activity;
        return {
          ...activity,
          subactivities: activity.subactivities.map((sub) =>
            sub.id === subId ? { ...sub, tasks: [...sub.tasks, task] } : sub
          ),
        };
      })
    );
  };

  const handleAddManualTask = (activityId: string, subId: string) => {
    const task: DraftTask = {
      id: nextDraftId(),
      type: "manual",
      title: "",
    };
    setActivityDrafts((prev) =>
      prev.map((activity) => {
        if (activity.id !== activityId) return activity;
        return {
          ...activity,
          subactivities: activity.subactivities.map((sub) =>
            sub.id === subId ? { ...sub, tasks: [...sub.tasks, task] } : sub
          ),
        };
      })
    );
  };

  const handleRemoveTask = (
    activityId: string,
    subId: string,
    taskId: string
  ) => {
    setActivityDrafts((prev) =>
      prev.map((activity) => {
        if (activity.id !== activityId) return activity;
        return {
          ...activity,
          subactivities: activity.subactivities.map((sub) =>
            sub.id === subId
              ? { ...sub, tasks: sub.tasks.filter((task) => task.id != taskId) }
              : sub
          ),
        };
      })
    );
  };

  const handleUpdateTask = (
    activityId: string,
    subId: string,
    taskId: string,
    changes: Partial<DraftTask>
  ) => {
    setActivityDrafts((prev) =>
      prev.map((activity) => {
        if (activity.id !== activityId) return activity;
        return {
          ...activity,
          subactivities: activity.subactivities.map((sub) =>
            sub.id === subId
              ? {
                  ...sub,
                  tasks: sub.tasks.map((task) =>
                    task.id === taskId ? { ...task, ...changes } : task
                  ),
                }
              : sub
          ),
        };
      })
    );
  };

  const handleAddMilestoneDraft = () => {
    const milestone: DraftMilestone = {
      id: nextDraftId(),
      title: t("erp.projects.defaults.milestone", {
        index: milestoneDrafts.length + 1,
      }),
      due_date: "",
      allow_late: false,
      deliverables: [],
    };
    setMilestoneDrafts((prev) => [...prev, milestone]);
    setShowMilestones(true);
  };

  const handleRemoveMilestoneDraft = (milestoneId: string) => {
    setMilestoneDrafts((prev) =>
      prev.filter((milestone) => milestone.id != milestoneId)
    );
  };

  const handleUpdateMilestoneDraft = (
    milestoneId: string,
    changes: Partial<DraftMilestone>
  ) => {
    setMilestoneDrafts((prev) =>
      prev.map((milestone) =>
        milestone.id === milestoneId ? { ...milestone, ...changes } : milestone
      )
    );
  };

  const handleAddDeliverableDraft = (milestoneId: string) => {
    const deliverable: DraftDeliverable = {
      id: nextDraftId(),
      title: "",
      kind: "link",
      value: "",
    };
    setMilestoneDrafts((prev) =>
      prev.map((milestone) =>
        milestone.id === milestoneId
          ? {
              ...milestone,
              deliverables: [...milestone.deliverables, deliverable],
            }
          : milestone
      )
    );
  };

  const handleRemoveDeliverableDraft = (
    milestoneId: string,
    deliverableId: string
  ) => {
    setMilestoneDrafts((prev) =>
      prev.map((milestone) =>
        milestone.id === milestoneId
          ? {
              ...milestone,
              deliverables: milestone.deliverables.filter(
                (deliverable) => deliverable.id != deliverableId
              ),
            }
          : milestone
      )
    );
  };

  const handleUpdateDeliverableDraft = (
    milestoneId: string,
    deliverableId: string,
    changes: Partial<DraftDeliverable>
  ) => {
    setMilestoneDrafts((prev) =>
      prev.map((milestone) =>
        milestone.id === milestoneId
          ? {
              ...milestone,
              deliverables: milestone.deliverables.map((deliverable) =>
                deliverable.id === deliverableId
                  ? { ...deliverable, ...changes }
                  : deliverable
              ),
            }
          : milestone
      )
    );
  };

  const handleSaveProject = async () => {
    if (!projectName.trim()) {
      toast({
        title: t("erp.projects.validation.nameRequired"),
        status: "warning",
      });
      return;
    }
    if (totalActivityWeight !== 100) {
      toast({
        title: t("erp.projects.validation.activityWeightsTitle"),
        description: t("erp.projects.validation.activityWeightsDesc", {
          weight: totalActivityWeight,
        }),
        status: "warning",
      });
      return;
    }
    for (const activity of activityDrafts) {
      const subWeight = activity.subactivities.reduce(
        (acc, sub) => acc + (sub.weight || 0),
        0
      );
      if (subWeight !== activity.weight) {
        toast({
          title: t("erp.projects.validation.subactivityWeightsTitle"),
          description: t("erp.projects.validation.subactivityWeightsDesc", {
            activity: activity.name,
            activityWeight: activity.weight,
            subWeight,
          }),
          status: "warning",
        });
        return;
      }
    }
    setProjectSaving(true);
    try {
      const createdProject = await createErpProject({
        name: projectName.trim(),
        description: projectDescription.trim() || null,
        start_date: projectStartDate || null,
        end_date: projectEndDate || null,
      });

      for (const activity of activityDrafts) {
        const createdActivity = await createActivity({
          project_id: createdProject.id,
          name: activity.name.trim(),
          description: null,
          start_date: activity.start_date || null,
          end_date: activity.end_date || null,
        });

        for (const subactivity of activity.subactivities) {
          const createdSubactivity = await createSubActivity({
            activity_id: createdActivity.id,
            name: subactivity.name.trim(),
            description: null,
            start_date: subactivity.start_date || null,
            end_date: subactivity.end_date || null,
          });

          for (const task of subactivity.tasks) {
            const templateId =
              task.type === "template" ? task.templateId : undefined;
            const title = task.title.trim();
            if (!title) continue;
            await createErpTask({
              project_id: createdProject.id,
              subactivity_id: createdSubactivity.id,
              task_template_id: templateId,
              title,
              description: null,
              start_date: subactivity.start_date || null,
              end_date: subactivity.end_date || null,
            });
          }
        }
      }

      for (const milestone of milestoneDrafts) {
        const createdMilestone = await createMilestone({
          project_id: createdProject.id,
          title: milestone.title.trim(),
          description: null,
          due_date: milestone.due_date || null,
          allow_late_submission: milestone.allow_late,
        });

        for (const deliverable of milestone.deliverables) {
          const title = deliverable.title.trim();
          if (!title) continue;
          await createDeliverable({
            milestone_id: createdMilestone.id,
            title,
            notes: deliverable.kind === "text" ? deliverable.value : null,
            link_url: deliverable.kind === "link" ? deliverable.value : null,
          });
        }
      }

      setProjectName("");
      setProjectDescription("");
      setProjectStartDate("");
      setProjectEndDate("");
      setActivityDrafts(createInitialActivityDrafts());
      setMilestoneDrafts(createInitialMilestoneDrafts());
      setShowActivities(true);
      setShowMilestones(true);

      await queryClient.invalidateQueries({ queryKey: ["erp-projects"] });
      await queryClient.invalidateQueries({ queryKey: ["erp-tasks"] });
      toast({ title: t("erp.projects.messages.saveSuccess"), status: "success" });
    } catch (error: any) {
      toast({
        title: t("erp.projects.messages.saveErrorTitle"),
        description:
          error?.response?.data?.detail ??
          t("erp.projects.messages.saveErrorFallback"),
        status: "error",
      });
    } finally {
      setProjectSaving(false);
    }
  };

  // Normaliza el estado de tarea para el Gantt.

  const getTaskStatus = (task: ErpTask): "pending" | "in_progress" | "done" => {
    const raw = task.status?.toLowerCase();
    if (raw === "pending" || raw === "in_progress" || raw === "done") {
      return raw;
    }
    return task.is_completed ? "done" : "pending";
  };

  // Convierte fecha en Date valido, con fallback seguro.
  const parseDateOrFallback = (
    value?: string | null,
    fallback?: Date
  ): Date => {
    if (value) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return fallback ?? new Date();
  };

  // Mapea proyectos y tareas al formato del componente Gantt.
  // Construye la lista de barras para el componente Gantt.
  const ganttTasks = useMemo(() => {
    const taskEntries: GanttTask[] = (tasks ?? []).map((task) => {
      const start = parseDateOrFallback(task.start_date, new Date());
      const end = parseDateOrFallback(
        task.end_date,
        new Date(start.getTime() + 24 * 60 * 60 * 1000)
      );
      return {
        id: `task-${task.id}`,
        name: task.title,
        start,
        end,
        type: "task",
        progress: getTaskStatus(task) === "done" ? 100 : 0,
        project: task.project_id ? `project-${task.project_id}` : undefined,
        dependencies: [],
      };
    });

    const projectEntries: GanttTask[] = (projects ?? []).map((project) => {
      const projectTasks = taskEntries.filter(
        (entry) => entry.project === `project-${project.id}`
      );
      const taskStarts = projectTasks.map((entry) => entry.start.getTime());
      const taskEnds = projectTasks.map((entry) => entry.end.getTime());
      const defaultStart = parseDateOrFallback(project.start_date, new Date());
      const defaultEnd = parseDateOrFallback(
        project.end_date,
        new Date(defaultStart.getTime() + 7 * 24 * 60 * 60 * 1000)
      );
      const start =
        taskStarts.length > 0
          ? new Date(Math.min(...taskStarts))
          : defaultStart;
      const end =
        taskEnds.length > 0 ? new Date(Math.max(...taskEnds)) : defaultEnd;
      return {
        id: `project-${project.id}`,
        name: project.name,
        start,
        end,
        type: "project",
        progress:
          projectTasks.length === 0
            ? 0
            : Math.round(
                (projectTasks.filter((entry) => entry.progress === 100).length /
                  projectTasks.length) *
                  100
              ),
        dependencies: [],
      };
    });

    return [...projectEntries, ...taskEntries];
  }, [projects, tasks]);

  // Render principal de la pagina.
  return (
    <AppShell>
      <Box
        borderRadius="2xl"
        p={{ base: 6, md: 8 }}
        bgGradient="linear(120deg, #0f3d2e 0%, #0c6b3f 55%, #caa85b 110%)"
        color="white"
        boxShadow="lg"
        position="relative"
        overflow="hidden"
        animation={`${fadeUp} 0.6s ease-out`}
        mb={8}
      >
        <Box
          position="absolute"
          inset="0"
          opacity={0.2}
          bgImage="radial-gradient(circle at 20% 20%, rgba(255,255,255,0.4), transparent 55%)"
        />
        <Stack position="relative" spacing={4} maxW="680px">
          <Text textTransform="uppercase" fontSize="xs" letterSpacing="0.2em">
            {t("erp.projects.header.eyebrow")}
          </Text>
          <Heading size="lg">{t("erp.projects.header.title")}</Heading>
          <Text fontSize="sm" opacity={0.9}>
            {t("erp.projects.header.subtitle")}
          </Text>
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} pt={2}>
            <Box bg="rgba(255,255,255,0.12)" p={3} borderRadius="lg">
              <Text fontSize="xs" textTransform="uppercase" opacity={0.7}>
                {t("erp.projects.stats.activeProjects")}
              </Text>
              <Text fontSize="2xl" fontWeight="semibold">
                {projectCount}
              </Text>
            </Box>
            <Box bg="rgba(255,255,255,0.12)" p={3} borderRadius="lg">
              <Text fontSize="xs" textTransform="uppercase" opacity={0.7}>
                {t("erp.projects.stats.totalTasks")}
              </Text>
              <Text fontSize="2xl" fontWeight="semibold">
                {taskCount}
              </Text>
            </Box>
            <Box bg="rgba(255,255,255,0.12)" p={3} borderRadius="lg">
              <Text fontSize="xs" textTransform="uppercase" opacity={0.7}>
                {t("erp.projects.stats.assignedTasks")}
              </Text>
              <Text fontSize="2xl" fontWeight="semibold">
                {assignedCount}
              </Text>
            </Box>
          </SimpleGrid>
        </Stack>
      </Box>

      <Tabs variant="enclosed" colorScheme="green" isLazy>
        <TabList flexWrap="wrap" gap={2}>
          <Tab>{t("erp.projects.tabs.summary")}</Tab>
          <Tab>{t("erp.projects.tabs.projects")}</Tab>
          <Tab>{t("erp.projects.tabs.create")}</Tab>
          <Tab>{t("erp.projects.tabs.gantt")}</Tab>
        </TabList>
        <TabPanels mt={6}>
          <TabPanel px={0}>
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
              <Box
                as={Link}
                to="/erp/projects"
                borderWidth="1px"
                borderRadius="xl"
                p={4}
                bg={cardBg}
                _hover={{ shadow: "md", borderColor: accent }}
              >
                <Text
                  fontSize="xs"
                  textTransform="uppercase"
                  color={subtleText}
                >
                  {t("erp.projects.cards.projectsEyebrow")}
                </Text>
                <Heading size="sm" mb={1}>
                  {t("erp.projects.cards.projectsTitle")}
                </Heading>
                <Text fontSize="sm" color={subtleText}>
                  {t("erp.projects.cards.projectsDesc")}
                </Text>
              </Box>
              <Box
                as={Link}
                to="/erp/tasks"
                borderWidth="1px"
                borderRadius="xl"
                p={4}
                bg={cardBg}
                _hover={{ shadow: "md", borderColor: accent }}
              >
                <Text
                  fontSize="xs"
                  textTransform="uppercase"
                  color={subtleText}
                >
                  {t("erp.projects.cards.tasksEyebrow")}
                </Text>
                <Heading size="sm" mb={1}>
                  {t("erp.projects.cards.tasksTitle")}
                </Heading>
                <Text fontSize="sm" color={subtleText}>
                  {t("erp.projects.cards.tasksDesc")}
                </Text>
              </Box>
              <Box
                as={Link}
                to="/erp/time-report"
                borderWidth="1px"
                borderRadius="xl"
                p={4}
                bg={cardBg}
                _hover={{ shadow: "md", borderColor: accent }}
              >
                <Text
                  fontSize="xs"
                  textTransform="uppercase"
                  color={subtleText}
                >
                  {t("erp.projects.cards.timeReportEyebrow")}
                </Text>
                <Heading size="sm" mb={1}>
                  {t("erp.projects.cards.timeReportTitle")}
                </Heading>
                <Text fontSize="sm" color={subtleText}>
                  {t("erp.projects.cards.timeReportDesc")}
                </Text>
              </Box>
            </SimpleGrid>
          </TabPanel>
          <TabPanel px={0}>
            <Stack spacing={4}>
              <Heading size="md">{t("erp.projects.stats.activeProjects")}</Heading>
              {isLoading && <Text>{t("erp.projects.list.loading")}</Text>}
              {error && (
                <Text color="red.400">
                  {t("erp.projects.list.error")}
                </Text>
              )}
              {!isLoading && !error && projects && (
                <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                  {projects.map((project) => (
                    <Box
                      key={project.id}
                      as={Link}
                      to={`/erp/projects/${project.id}`}
                      borderWidth="1px"
                      borderRadius="xl"
                      p={4}
                      bg={cardBg}
                      position="relative"
                      _hover={{ borderColor: accent, shadow: "md" }}
                    >
                      <Box
                        position="absolute"
                        top={3}
                        right={3}
                        px={2}
                        py={1}
                        borderRadius="full"
                        fontSize="xs"
                        bg="rgba(15, 61, 46, 0.08)"
                        color={subtleText}
                      >
                        #{project.id}
                      </Box>
                      <Heading size="sm" mb={2}>
                        {project.name}
                      </Heading>
                      <Stack spacing={2}>
                        {project.description && (
                          <Text fontSize="sm" color={subtleText} noOfLines={2}>
                            {project.description}
                          </Text>
                        )}
                        <Stack
                          direction="row"
                          spacing={2}
                          align="center"
                          flexWrap="wrap"
                        >
                          <Box
                            px={2}
                            py={1}
                            borderRadius="full"
                            fontSize="xs"
                            bg="rgba(0, 102, 43, 0.12)"
                            color={subtleText}
                          >
                            {project.start_date ?? t("erp.projects.list.noStart")}
                          </Box>
                          <Text fontSize="xs" color={subtleText}>
                            {t("erp.projects.list.to")}
                          </Text>
                          <Box
                            px={2}
                            py={1}
                            borderRadius="full"
                            fontSize="xs"
                            bg="rgba(202, 168, 91, 0.18)"
                            color={subtleText}
                          >
                            {project.end_date ?? t("erp.projects.list.noEnd")}
                          </Box>
                        </Stack>
                      </Stack>
                    </Box>
                  ))}
                </SimpleGrid>
              )}
            </Stack>
          </TabPanel>
          <TabPanel px={0}>
            {canManageProjects ? (
              <Stack spacing={6}>
                <Box
                  borderWidth="1px"
                  borderRadius="xl"
                  p={{ base: 5, md: 6 }}
                  bg={panelBg}
                  borderColor={panelBorder}
                >
                  <Stack spacing={4}>
                    <Box>
                      <Heading size="sm">{t("erp.projects.create.title")}</Heading>
                      <Text fontSize="sm" color={subtleText}>
                        {t("erp.projects.create.helper")}
                      </Text>
                    </Box>
                    <Divider borderColor={panelBorder} />
                    <Box>
                      <Text
                        fontSize="xs"
                        textTransform="uppercase"
                        letterSpacing="0.08em"
                        fontWeight="semibold"
                        color={subtleText}
                        mb={2}
                      >
                        {t("erp.projects.create.general")}
                      </Text>
                      <Stack spacing={3}>
                        <FormControl>
                        <FormLabel>{t("erp.projects.fields.projectName")}</FormLabel>
                          <Input
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                          />
                        </FormControl>
                        <FormControl>
                          <FormLabel>{t("erp.projects.fields.description")}</FormLabel>
                          <Textarea
                            value={projectDescription}
                            onChange={(e) =>
                              setProjectDescription(e.target.value)
                            }
                            rows={2}
                          />
                        </FormControl>
                      </Stack>
                    </Box>
                    <Box>
                      <Text
                        fontSize="xs"
                        textTransform="uppercase"
                        letterSpacing="0.08em"
                        fontWeight="semibold"
                        color={subtleText}
                        mb={2}
                      >
                        {t("erp.projects.create.dates")}
                      </Text>
                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                        <FormControl>
                          <FormLabel>{t("erp.projects.fields.start")}</FormLabel>
                          <Input
                            type="date"
                            value={projectStartDate}
                            onChange={(e) =>
                              setProjectStartDate(e.target.value)
                            }
                          />
                        </FormControl>
                        <FormControl>
                          <FormLabel>{t("erp.projects.fields.end")}</FormLabel>
                          <Input
                            type="date"
                            value={projectEndDate}
                            onChange={(e) => setProjectEndDate(e.target.value)}
                          />
                        </FormControl>
                      </SimpleGrid>
                    </Box>
                  </Stack>
                </Box>

                {showActivities && (
                  <Box
                    borderWidth="1px"
                    borderRadius="xl"
                    p={{ base: 5, md: 6 }}
                    bg={panelBg}
                    borderColor={panelBorder}
                  >
                    <Heading size="sm" mb={2}>
                      {t("erp.projects.activities.title")}
                    </Heading>
                    <Text fontSize="xs" color={subtleText} mb={4}>
                      {t("erp.projects.activities.weightSum", {
                        weight: totalActivityWeight,
                      })}
                    </Text>
                    <Accordion
                      allowMultiple
                      index={activityDrafts.map((_, itemIndex) => itemIndex)}
                    >
                      {activityDrafts.map((activity, index) => (
                        <AccordionItem key={activity.id} border="none">
                          <AccordionButton px={0}>
                            <Box flex="1" textAlign="left">
                              <Text fontSize="sm" fontWeight="semibold">
                                {t("erp.projects.activities.itemLabel", {
                                  index: index + 1,
                                })}
                              </Text>
                            </Box>
                            <AccordionIcon />
                          </AccordionButton>
                          <AccordionPanel px={0} pt={3}>
                            <Stack spacing={3}>
                              <SimpleGrid
                                columns={{ base: 1, md: 2 }}
                                spacing={3}
                              >
                                <FormControl>
                                  <FormLabel>{t("erp.projects.fields.name")}</FormLabel>
                                  <Input
                                    value={activity.name}
                                    onChange={(e) =>
                                      handleUpdateActivityDraft(activity.id, {
                                        name: e.target.value,
                                      })
                                    }
                                  />
                                </FormControl>
                                <FormControl>
                                  <FormLabel>{t("erp.projects.fields.weight")}</FormLabel>
                                  <Input
                                    type="number"
                                    value={activity.weight}
                                    onChange={(e) =>
                                      handleUpdateActivityDraft(activity.id, {
                                        weight: Number(e.target.value || 0),
                                      })
                                    }
                                  />
                                </FormControl>
                              </SimpleGrid>
                              <SimpleGrid
                                columns={{ base: 1, md: 2 }}
                                spacing={3}
                              >
                                <FormControl>
                                  <FormLabel>{t("erp.projects.fields.start")}</FormLabel>
                                  <Input
                                    type="date"
                                    value={activity.start_date}
                                    onChange={(e) =>
                                      handleUpdateActivityDraft(activity.id, {
                                        start_date: e.target.value,
                                      })
                                    }
                                  />
                                </FormControl>
                                <FormControl>
                                  <FormLabel>{t("erp.projects.fields.end")}</FormLabel>
                                  <Input
                                    type="date"
                                    value={activity.end_date}
                                    onChange={(e) =>
                                      handleUpdateActivityDraft(activity.id, {
                                        end_date: e.target.value,
                                      })
                                    }
                                  />
                                </FormControl>
                              </SimpleGrid>
                              <Button
                                variant="outline"
                                alignSelf="flex-start"
                                onClick={() =>
                                  handleAddSubActivityDraft(activity.id)
                                }
                              >
                                {t("erp.projects.activities.addSubactivity")}
                              </Button>
                              {activity.subactivities.length === 0 ? (
                                <Text fontSize="sm" color={subtleText}>
                                  {t("erp.projects.activities.emptySubactivities")}
                                </Text>
                              ) : (
                                <Accordion
                                  allowMultiple
                                  index={activity.subactivities.map(
                                    (_, itemIndex) => itemIndex
                                  )}
                                >
                                  {activity.subactivities.map(
                                    (subactivity, subIndex) => (
                                      <AccordionItem
                                        key={subactivity.id}
                                        border="none"
                                      >
                                        <AccordionButton px={0}>
                                          <Box flex="1" textAlign="left">
                                            <Text
                                              fontSize="sm"
                                              fontWeight="semibold"
                                            >
                                              {t(
                                                "erp.projects.activities.subactivityLabel",
                                                { index: subIndex + 1 }
                                              )}
                                            </Text>
                                          </Box>
                                          <AccordionIcon />
                                        </AccordionButton>
                                        <AccordionPanel px={0} pt={3}>
                                          <Stack spacing={3}>
                                            <FormControl>
                                              <FormLabel>{t("erp.projects.fields.name")}</FormLabel>
                                              <Input
                                                value={subactivity.name}
                                                onChange={(e) =>
                                                  handleUpdateSubActivityDraft(
                                                    activity.id,
                                                    subactivity.id,
                                                    { name: e.target.value }
                                                  )
                                                }
                                              />
                                            </FormControl>
                                            <FormControl>
                                              <FormLabel>{t("erp.projects.fields.weight")}</FormLabel>
                                              <Input
                                                type="number"
                                                value={subactivity.weight}
                                                onChange={(e) =>
                                                  handleUpdateSubActivityDraft(
                                                    activity.id,
                                                    subactivity.id,
                                                    {
                                                      weight: Number(
                                                        e.target.value || 0
                                                      ),
                                                    }
                                                  )
                                                }
                                              />
                                            </FormControl>
                                            <Text
                                              fontSize="xs"
                                              color={subtleText}
                                            >
                                              {t(
                                                "erp.projects.activities.subactivityWeightSum",
                                                {
                                                  weight:
                                                    activity.subactivities.reduce(
                                                      (acc, sub) =>
                                                        acc + (sub.weight || 0),
                                                      0
                                                    ),
                                                  target: activity.weight,
                                                }
                                              )}
                                            </Text>
                                            <SimpleGrid
                                              columns={{ base: 1, md: 2 }}
                                              spacing={3}
                                            >
                                              <FormControl>
                                                <FormLabel>{t("erp.projects.fields.start")}</FormLabel>
                                                <Input
                                                  type="date"
                                                  value={subactivity.start_date}
                                                  onChange={(e) =>
                                                    handleUpdateSubActivityDraft(
                                                      activity.id,
                                                      subactivity.id,
                                                      {
                                                        start_date:
                                                          e.target.value,
                                                      }
                                                    )
                                                  }
                                                />
                                              </FormControl>
                                              <FormControl>
                                                <FormLabel>{t("erp.projects.fields.end")}</FormLabel>
                                                <Input
                                                  type="date"
                                                  value={subactivity.end_date}
                                                  onChange={(e) =>
                                                    handleUpdateSubActivityDraft(
                                                      activity.id,
                                                      subactivity.id,
                                                      {
                                                        end_date:
                                                          e.target.value,
                                                      }
                                                    )
                                                  }
                                                />
                                              </FormControl>
                                            </SimpleGrid>
                                            <FormControl>
                                              <FormLabel>
                                                {t(
                                                  "erp.projects.activities.taskCatalog"
                                                )}
                                              </FormLabel>
                                              <Select
                                                placeholder={t(
                                                  "erp.projects.activities.taskCatalogPlaceholder"
                                                )}
                                                value={
                                                  taskTemplateSelections[
                                                    subactivity.id
                                                  ] ?? ""
                                                }
                                                onChange={(e) =>
                                                  setTaskTemplateSelections(
                                                    (prev) => ({
                                                      ...prev,
                                                      [subactivity.id]:
                                                        e.target.value,
                                                    })
                                                  )
                                                }
                                              >
                                                {(taskTemplates ?? []).map(
                                                  (template) => (
                                                    <option
                                                      key={template.id}
                                                      value={String(
                                                        template.id
                                                      )}
                                                    >
                                                      {template.title}
                                                    </option>
                                                  )
                                                )}
                                              </Select>
                                            </FormControl>
                                            <Stack
                                              direction={{
                                                base: "column",
                                                md: "row",
                                              }}
                                              spacing={3}
                                            >
                                              <Button
                                                variant="outline"
                                                onClick={() => {
                                                  const selected =
                                                    taskTemplateSelections[
                                                      subactivity.id
                                                    ];
                                                  if (!selected) return;
                                                  handleAddTaskFromTemplate(
                                                    activity.id,
                                                    subactivity.id,
                                                    Number(selected)
                                                  );
                                                  setTaskTemplateSelections(
                                                    (prev) => ({
                                                      ...prev,
                                                      [subactivity.id]: "",
                                                    })
                                                  );
                                                }}
                                              >
                                                {t(
                                                  "erp.projects.activities.addTask"
                                                )}
                                              </Button>
                                              <Button
                                                variant="outline"
                                                onClick={() =>
                                                  handleAddManualTask(
                                                    activity.id,
                                                    subactivity.id
                                                  )
                                                }
                                              >
                                                {t(
                                                  "erp.projects.activities.addManualTask"
                                                )}
                                              </Button>
                                            </Stack>
                                            {subactivity.tasks.length === 0 ? (
                                              <Text
                                                fontSize="sm"
                                                color={subtleText}
                                              >
                                                {t(
                                                  "erp.projects.activities.emptyTasks"
                                                )}
                                              </Text>
                                            ) : (
                                              <Stack spacing={2}>
                                                {subactivity.tasks.map(
                                                  (task) => (
                                                    <Box
                                                      key={task.id}
                                                      borderWidth="1px"
                                                      borderRadius="md"
                                                      p={2}
                                                    >
                                                      <Stack spacing={2}>
                                                        {task.type ===
                                                        "manual" ? (
                                                          <Input
                                                            placeholder={t(
                                                              "erp.projects.activities.taskTitlePlaceholder"
                                                            )}
                                                            value={task.title}
                                                            onChange={(e) =>
                                                              handleUpdateTask(
                                                                activity.id,
                                                                subactivity.id,
                                                                task.id,
                                                                {
                                                                  title:
                                                                    e.target
                                                                      .value,
                                                                }
                                                              )
                                                            }
                                                          />
                                                        ) : (
                                                          <Text
                                                            fontSize="sm"
                                                            fontWeight="semibold"
                                                          >
                                                            {task.title}
                                                          </Text>
                                                        )}
                                                        <Button
                                                          size="xs"
                                                          variant="ghost"
                                                          alignSelf="flex-start"
                                                          onClick={() =>
                                                            handleRemoveTask(
                                                              activity.id,
                                                              subactivity.id,
                                                              task.id
                                                            )
                                                          }
                                                        >
                                                          {t(
                                                            "erp.projects.activities.removeTask"
                                                          )}
                                                        </Button>
                                                      </Stack>
                                                    </Box>
                                                  )
                                                )}
                                              </Stack>
                                            )}
                                            <Button
                                              size="xs"
                                              variant="ghost"
                                              alignSelf="flex-start"
                                              onClick={() =>
                                                handleRemoveSubActivityDraft(
                                                  activity.id,
                                                  subactivity.id
                                                )
                                              }
                                            >
                                              {t(
                                                "erp.projects.activities.removeSubactivity"
                                              )}
                                            </Button>
                                          </Stack>
                                        </AccordionPanel>
                                      </AccordionItem>
                                    )
                                  )}
                                </Accordion>
                              )}
                              <Button
                                size="xs"
                                variant="ghost"
                                alignSelf="flex-start"
                                onClick={() =>
                                  handleRemoveActivityDraft(activity.id)
                                }
                              >
                                {t("erp.projects.activities.removeActivity")}
                              </Button>
                            </Stack>
                          </AccordionPanel>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </Box>
                )}

                {showMilestones && (
                  <Box
                    borderWidth="1px"
                    borderRadius="xl"
                    p={{ base: 5, md: 6 }}
                    bg={panelBg}
                    borderColor={panelBorder}
                  >
                    <Heading size="sm" mb={3}>
                      {t("erp.projects.milestones.title")}
                    </Heading>
                    <Accordion
                      allowMultiple
                      index={milestoneDrafts.map((_, itemIndex) => itemIndex)}
                    >
                      {milestoneDrafts.map((milestone, index) => (
                        <AccordionItem key={milestone.id} border="none">
                          <AccordionButton px={0}>
                            <Box flex="1" textAlign="left">
                              <Text fontSize="sm" fontWeight="semibold">
                                {t("erp.projects.milestones.itemLabel", {
                                  index: index + 1,
                                })}
                              </Text>
                            </Box>
                            <AccordionIcon />
                          </AccordionButton>
                          <AccordionPanel px={0} pt={3}>
                            <Stack spacing={3}>
                              <FormControl>
                                <FormLabel>
                                  {t("erp.projects.milestones.nameLabel")}
                                </FormLabel>
                                <Input
                                  value={milestone.title}
                                  onChange={(e) =>
                                    handleUpdateMilestoneDraft(milestone.id, {
                                      title: e.target.value,
                                    })
                                  }
                                />
                              </FormControl>
                              <FormControl>
                                <FormLabel>{t("erp.projects.milestones.dueDate")}</FormLabel>
                                <Input
                                  type="date"
                                  value={milestone.due_date}
                                  onChange={(e) =>
                                    handleUpdateMilestoneDraft(milestone.id, {
                                      due_date: e.target.value,
                                    })
                                  }
                                />
                              </FormControl>
                              <Checkbox
                                isChecked={milestone.allow_late}
                                onChange={(e) =>
                                  handleUpdateMilestoneDraft(milestone.id, {
                                    allow_late: e.target.checked,
                                  })
                                }
                              >
                                {t("erp.projects.milestones.allowLate")}
                              </Checkbox>
                              <Text fontSize="sm" color={subtleText}>
                                {t("erp.projects.milestones.deliverables")}
                              </Text>
                              {milestone.deliverables.length === 0 ? (
                                <Text fontSize="sm" color={subtleText}>
                                  {t("erp.projects.milestones.emptyDeliverables")}
                                </Text>
                              ) : (
                                <Stack spacing={2}>
                                  {milestone.deliverables.map((deliverable) => (
                                    <Box
                                      key={deliverable.id}
                                      borderWidth="1px"
                                      borderRadius="md"
                                      p={2}
                                    >
                                      <Stack spacing={2}>
                                        <FormControl>
                                          <FormLabel>
                                            {t(
                                              "erp.projects.milestones.deliverableTitle"
                                            )}
                                          </FormLabel>
                                          <Input
                                            value={deliverable.title}
                                            onChange={(e) =>
                                              handleUpdateDeliverableDraft(
                                                milestone.id,
                                                deliverable.id,
                                                { title: e.target.value }
                                              )
                                            }
                                          />
                                        </FormControl>
                                        <FormControl>
                                          <FormLabel>{t("erp.projects.milestones.type")}</FormLabel>
                                          <Select
                                            value={deliverable.kind}
                                            onChange={(e) =>
                                              handleUpdateDeliverableDraft(
                                                milestone.id,
                                                deliverable.id,
                                                {
                                                  kind: e.target.value as
                                                    | "text"
                                                    | "link",
                                                }
                                              )
                                            }
                                          >
                                            <option value="link">
                                              {t(
                                                "erp.projects.milestones.typeLink"
                                              )}
                                            </option>
                                            <option value="text">
                                              {t(
                                                "erp.projects.milestones.typeText"
                                              )}
                                            </option>
                                          </Select>
                                        </FormControl>
                                        <FormControl>
                                          <FormLabel>{t("erp.projects.milestones.value")}</FormLabel>
                                          <Input
                                            value={deliverable.value}
                                            onChange={(e) =>
                                              handleUpdateDeliverableDraft(
                                                milestone.id,
                                                deliverable.id,
                                                { value: e.target.value }
                                              )
                                            }
                                          />
                                        </FormControl>
                                        <Button
                                          size="xs"
                                          variant="ghost"
                                          alignSelf="flex-start"
                                          onClick={() =>
                                            handleRemoveDeliverableDraft(
                                              milestone.id,
                                              deliverable.id
                                            )
                                          }
                                        >
                                          {t(
                                            "erp.projects.milestones.removeDeliverable"
                                          )}
                                        </Button>
                                      </Stack>
                                    </Box>
                                  ))}
                                </Stack>
                              )}
                              <Button
                                variant="outline"
                                alignSelf="flex-start"
                                onClick={() =>
                                  handleAddDeliverableDraft(milestone.id)
                                }
                              >
                                {t("erp.projects.milestones.addDeliverable")}
                              </Button>
                              <Button
                                size="xs"
                                variant="ghost"
                                alignSelf="flex-start"
                                onClick={() =>
                                  handleRemoveMilestoneDraft(milestone.id)
                                }
                              >
                                {t("erp.projects.milestones.removeMilestone")}
                              </Button>
                            </Stack>
                          </AccordionPanel>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </Box>
                )}
                <Button
                  colorScheme="green"
                  onClick={handleSaveProject}
                  isLoading={projectSaving}
                  alignSelf={{ base: "stretch", md: "flex-start" }}
                >
                  {t("erp.projects.actions.saveProject")}
                </Button>
              </Stack>
            ) : (
              <Text fontSize="sm" color={subtleText}>
                {t("erp.projects.permissions.noCreate")}
              </Text>
            )}
          </TabPanel>
          <TabPanel px={0}>
            <Heading size="md" mb={4}>
              {t("erp.projects.gantt.title")}
            </Heading>
            <Box
              borderWidth="1px"
              borderRadius="xl"
              bg={cardBg}
              p={4}
              sx={{
                ".today rect": {
                  fill: "#dc2626",
                  opacity: 0.9,
                  width: "1px",
                },
              }}
            >
              <Stack
                direction={{ base: "column", md: "row" }}
                justify="space-between"
                mb={4}
              >
                <Text fontSize="sm" color={subtleText}>
                  {t("erp.projects.gantt.subtitle")}
                </Text>
                <Tabs
                  variant="soft-rounded"
                  colorScheme="green"
                  onChange={(index) => {
                    const modes = [ViewMode.Week, ViewMode.Month];
                    setGanttView(modes[index] ?? ViewMode.Week);
                  }}
                >
                  <TabList>
                    <Tab>{t("erp.projects.gantt.week")}</Tab>
                    <Tab>{t("erp.projects.gantt.month")}</Tab>
                  </TabList>
                </Tabs>
              </Stack>
              {ganttTasks.length === 0 ? (
                <Text fontSize="sm" color={subtleText}>
                  {t("erp.projects.gantt.empty")}
                </Text>
              ) : (
                <Gantt
                  tasks={ganttTasks}
                  viewMode={ganttView}
                  listCellWidth="200px"
                  columnWidth={ganttView === ViewMode.Month ? 140 : 110}
                  rowHeight={42}
                  barCornerRadius={2}
                  todayColor="transparent"
                  locale={i18n.language}
                  TaskListHeader={(props) => (
                    <GanttTaskListHeader
                      {...props}
                      labels={ganttHeaderLabels}
                    />
                  )}
                />
              )}
            </Box>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </AppShell>
  );
};
