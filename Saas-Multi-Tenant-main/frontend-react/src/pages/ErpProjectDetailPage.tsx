import React, { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Divider,
  FormControl,
  FormLabel,
  Heading,
  Input,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";
import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchErpProject, type ErpProject } from "../api/erpReports";
import { updateErpProject } from "../api/erpManagement";
import { fetchErpTasks, type ErpTask } from "../api/erpTimeTracking";
import {
  fetchActivities,
  fetchDeliverables,
  fetchMilestones,
  fetchSubActivities,
  type ErpActivity,
  type ErpDeliverable,
  type ErpMilestone,
  type ErpSubActivity,
} from "../api/erpStructure";
import { AppShell } from "../components/layout/AppShell";

// Vista detalle basica para proyectos ERP.
export const ErpProjectDetailPage: React.FC = () => {
  const { projectId } = useParams({ strict: false }) as { projectId?: string };
  const projectIdNumber = projectId ? Number(projectId) : null;
  const toast = useToast();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.500", "gray.300");
  const panelBg = useColorModeValue("gray.50", "gray.800");
  const panelBorder = useColorModeValue("gray.200", "gray.600");
  const badgeBg = useColorModeValue("green.100", "green.700");
  const badgeText = useColorModeValue("green.700", "green.200");
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftStartDate, setDraftStartDate] = useState("");
  const [draftEndDate, setDraftEndDate] = useState("");
  const [draftActive, setDraftActive] = useState(true);

  const { data: project, isLoading, error } = useQuery<ErpProject>({
    queryKey: ["erp-project", projectIdNumber],
    queryFn: () => fetchErpProject(projectIdNumber as number),
    enabled: Boolean(projectIdNumber),
  });

  useEffect(() => {
    if (!project) return;
    setDraftName(project.name ?? "");
    setDraftDescription(project.description ?? "");
    setDraftStartDate(project.start_date ?? "");
    setDraftEndDate(project.end_date ?? "");
    setDraftActive(project.is_active !== false);
  }, [project]);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateErpProject(projectIdNumber as number, {
        name: draftName.trim(),
        description: draftDescription.trim() || null,
        start_date: draftStartDate || null,
        end_date: draftEndDate || null,
        is_active: draftActive,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["erp-project", projectIdNumber],
      });
      await queryClient.invalidateQueries({ queryKey: ["erp-projects"] });
      toast({ title: "Proyecto actualizado", status: "success" });
    },
    onError: (err: any) => {
      toast({
        title: "No se pudo actualizar",
        description: err?.response?.data?.detail ?? "Revisa los datos.",
        status: "error",
      });
    },
  });

  const { data: tasks } = useQuery<ErpTask[]>({
    queryKey: ["erp-tasks"],
    queryFn: fetchErpTasks,
  });

  const {
    data: activities,
    isLoading: activitiesLoading,
    error: activitiesError,
  } = useQuery<ErpActivity[]>({
    queryKey: ["erp-activities", projectIdNumber],
    queryFn: () => fetchActivities(projectIdNumber),
    enabled: Boolean(projectIdNumber),
  });

  const {
    data: subactivities,
    isLoading: subactivitiesLoading,
    error: subactivitiesError,
  } = useQuery<ErpSubActivity[]>({
    queryKey: ["erp-subactivities", projectIdNumber],
    queryFn: () => fetchSubActivities({ projectId: projectIdNumber }),
    enabled: Boolean(projectIdNumber),
  });

  const {
    data: milestones,
    isLoading: milestonesLoading,
    error: milestonesError,
  } = useQuery<ErpMilestone[]>({
    queryKey: ["erp-milestones", projectIdNumber],
    queryFn: () => fetchMilestones({ projectId: projectIdNumber }),
    enabled: Boolean(projectIdNumber),
  });

  const milestoneIds = useMemo(
    () => (milestones ?? []).map((milestone) => milestone.id),
    [milestones],
  );

  const {
    data: deliverables,
    isLoading: deliverablesLoading,
    error: deliverablesError,
  } = useQuery<ErpDeliverable[]>({
    queryKey: ["erp-deliverables", milestoneIds],
    queryFn: async () => {
      if (milestoneIds.length === 0) return [];
      const results = await Promise.all(
        milestoneIds.map((milestoneId) => fetchDeliverables(milestoneId)),
      );
      return results.flat();
    },
    enabled: milestoneIds.length > 0,
  });

  const projectTasks = useMemo(() => {
    if (!projectIdNumber) return [];
    return (tasks ?? []).filter((task) => task.project_id === projectIdNumber);
  }, [tasks, projectIdNumber]);

  const subactivitiesByActivity = useMemo(() => {
    const map = new Map<number, ErpSubActivity[]>();
    (subactivities ?? []).forEach((subactivity) => {
      const existing = map.get(subactivity.activity_id) ?? [];
      existing.push(subactivity);
      map.set(subactivity.activity_id, existing);
    });
    return map;
  }, [subactivities]);

  const tasksBySubactivity = useMemo(() => {
    const map = new Map<number, ErpTask[]>();
    (tasks ?? []).forEach((task) => {
      if (!task.subactivity_id) return;
      const existing = map.get(task.subactivity_id) ?? [];
      existing.push(task);
      map.set(task.subactivity_id, existing);
    });
    return map;
  }, [tasks]);

  const milestonesByActivity = useMemo(() => {
    const map = new Map<number, ErpMilestone[]>();
    (milestones ?? []).forEach((milestone) => {
      if (!milestone.activity_id) return;
      const existing = map.get(milestone.activity_id) ?? [];
      existing.push(milestone);
      map.set(milestone.activity_id, existing);
    });
    return map;
  }, [milestones]);

  const projectMilestones = useMemo(
    () => (milestones ?? []).filter((milestone) => !milestone.activity_id),
    [milestones],
  );

  const deliverablesByMilestone = useMemo(() => {
    const map = new Map<number, ErpDeliverable[]>();
    (deliverables ?? []).forEach((deliverable) => {
      const existing = map.get(deliverable.milestone_id) ?? [];
      existing.push(deliverable);
      map.set(deliverable.milestone_id, existing);
    });
    return map;
  }, [deliverables]);

  const completedCount = projectTasks.filter(
    (task) => task.is_completed || task.status === "done",
  ).length;
  const totalTasks = projectTasks.length;
  const completion =
    totalTasks === 0 ? 0 : Math.round((completedCount / totalTasks) * 100);

  const statusLabel = (task: ErpTask) => {
    const raw = task.status?.toLowerCase();
    if (raw === "pending") return "Pendiente";
    if (raw === "in_progress") return "En progreso";
    if (raw === "done") return "Completada";
    return task.is_completed ? "Completada" : "Pendiente";
  };

  return (
    <AppShell>
      <Stack spacing={6}>
        <Button
          as={Link}
          to="/erp/projects"
          variant="ghost"
          alignSelf="flex-start"
          leftIcon={<span aria-hidden="true">←</span>}
        >
          Volver a proyectos
        </Button>
        <Box borderWidth="1px" borderRadius="xl" p={6} bg={cardBg}>
          <Stack spacing={2}>
            <Heading size="md">Detalle del proyecto</Heading>
            <Text fontSize="sm" color={subtleText}>
              Proyecto #{projectId ?? "sin id"}
            </Text>
            {isLoading && <Text fontSize="sm">Cargando informacion...</Text>}
            {error && (
              <Text fontSize="sm" color="red.400">
                No se pudo cargar el proyecto.
              </Text>
            )}
            {!isLoading && !error && project && (
              <Text fontSize="lg" fontWeight="semibold">
                {project.name}
              </Text>
            )}
          </Stack>
        </Box>

        {!isLoading && !error && project && (
          <Stack spacing={6}>
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
              <Box
                borderWidth="1px"
                borderRadius="xl"
                p={4}
                bg={panelBg}
                borderColor={panelBorder}
              >
                <Text fontSize="xs" textTransform="uppercase" color={subtleText}>
                  Tareas
                </Text>
                <Text fontSize="2xl" fontWeight="semibold">
                  {totalTasks}
                </Text>
              </Box>
              <Box
                borderWidth="1px"
                borderRadius="xl"
                p={4}
                bg={panelBg}
                borderColor={panelBorder}
              >
                <Text fontSize="xs" textTransform="uppercase" color={subtleText}>
                  Completadas
                </Text>
                <Text fontSize="2xl" fontWeight="semibold">
                  {completedCount}
                </Text>
              </Box>
              <Box
                borderWidth="1px"
                borderRadius="xl"
                p={4}
                bg={panelBg}
                borderColor={panelBorder}
              >
                <Text fontSize="xs" textTransform="uppercase" color={subtleText}>
                  Progreso
                </Text>
                <Text fontSize="2xl" fontWeight="semibold">
                  {completion}%
                </Text>
              </Box>
            </SimpleGrid>

            <Box
              borderWidth="1px"
              borderRadius="xl"
              p={6}
              bg={panelBg}
              borderColor={panelBorder}
            >
              <Stack spacing={4}>
                <Box>
                  <Text
                    fontSize="xs"
                    textTransform="uppercase"
                    letterSpacing="0.08em"
                    fontWeight="semibold"
                    color={subtleText}
                  >
                    Informacion general
                  </Text>
                  <Heading size="sm" mt={2}>
                    {project.name}
                  </Heading>
                  {project.description ? (
                    <Text fontSize="sm" color={subtleText} mt={2}>
                      {project.description}
                    </Text>
                  ) : (
                    <Text fontSize="sm" color={subtleText} mt={2}>
                      Sin descripcion.
                    </Text>
                  )}
                </Box>
                <Divider borderColor={panelBorder} />
                <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                  <Box>
                    <Text fontSize="xs" textTransform="uppercase" color={subtleText}>
                      Inicio
                    </Text>
                    <Text fontSize="sm" fontWeight="semibold">
                      {project.start_date ?? "Sin fecha"}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" textTransform="uppercase" color={subtleText}>
                      Fin
                    </Text>
                    <Text fontSize="sm" fontWeight="semibold">
                      {project.end_date ?? "Sin fecha"}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" textTransform="uppercase" color={subtleText}>
                      Estado
                    </Text>
                    <Badge mt={1} bg={badgeBg} color={badgeText}>
                      {project.is_active === false ? "Inactivo" : "Activo"}
                    </Badge>
                  </Box>
                </SimpleGrid>
              </Stack>
            </Box>

            <Box
              borderWidth="1px"
              borderRadius="xl"
              p={6}
              bg={panelBg}
              borderColor={panelBorder}
            >
              <Stack spacing={4}>
                <Heading size="sm">Editar proyecto</Heading>
                <FormControl>
                  <FormLabel>Nombre</FormLabel>
                  <Input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Descripcion</FormLabel>
                  <Textarea
                    value={draftDescription}
                    onChange={(e) => setDraftDescription(e.target.value)}
                    rows={3}
                  />
                </FormControl>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  <FormControl>
                    <FormLabel>Inicio</FormLabel>
                    <Input
                      type="date"
                      value={draftStartDate}
                      onChange={(e) => setDraftStartDate(e.target.value)}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Fin</FormLabel>
                    <Input
                      type="date"
                      value={draftEndDate}
                      onChange={(e) => setDraftEndDate(e.target.value)}
                    />
                  </FormControl>
                </SimpleGrid>
                <FormControl display="flex" alignItems="center">
                  <FormLabel mb="0">Proyecto activo</FormLabel>
                  <Switch
                    isChecked={draftActive}
                    onChange={(e) => setDraftActive(e.target.checked)}
                  />
                </FormControl>
                <Button
                  colorScheme="green"
                  alignSelf="flex-start"
                  onClick={() => updateMutation.mutate()}
                  isLoading={updateMutation.isLoading}
                  isDisabled={!draftName.trim()}
                >
                  Guardar cambios
                </Button>
              </Stack>
            </Box>

            <Box
              borderWidth="1px"
              borderRadius="xl"
              p={6}
              bg={panelBg}
              borderColor={panelBorder}
            >
              <Stack spacing={3}>
                <Heading size="sm">Tareas del proyecto</Heading>
                {totalTasks === 0 ? (
                  <Text fontSize="sm" color={subtleText}>
                    No hay tareas registradas para este proyecto.
                  </Text>
                ) : (
                  <Stack spacing={3}>
                    {projectTasks.map((task) => (
                      <Box
                        key={task.id}
                        borderWidth="1px"
                        borderRadius="lg"
                        p={3}
                        bg={cardBg}
                      >
                        <Stack spacing={1}>
                          <Stack
                            direction={{ base: "column", md: "row" }}
                            justify="space-between"
                            align={{ base: "flex-start", md: "center" }}
                          >
                            <Text fontWeight="semibold">{task.title}</Text>
                            <Badge bg={badgeBg} color={badgeText}>
                              {statusLabel(task)}
                            </Badge>
                          </Stack>
                          {task.description ? (
                            <Text fontSize="sm" color={subtleText}>
                              {task.description}
                            </Text>
                          ) : (
                            <Text fontSize="sm" color={subtleText}>
                              Sin descripcion.
                            </Text>
                          )}
                          <Stack direction="row" spacing={3}>
                            <Text fontSize="xs" color={subtleText}>
                              Inicio: {task.start_date ?? "Sin fecha"}
                            </Text>
                            <Text fontSize="xs" color={subtleText}>
                              Fin: {task.end_date ?? "Sin fecha"}
                            </Text>
                          </Stack>
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Stack>
            </Box>

            <Box
              borderWidth="1px"
              borderRadius="xl"
              p={6}
              bg={panelBg}
              borderColor={panelBorder}
            >
              <Stack spacing={4}>
                <Heading size="sm">Actividades y subactividades</Heading>
                {(activitiesLoading ||
                  subactivitiesLoading ||
                  milestonesLoading ||
                  deliverablesLoading) && (
                  <Text fontSize="sm" color={subtleText}>
                    Cargando estructura del proyecto...
                  </Text>
                )}
                {(activitiesError ||
                  subactivitiesError ||
                  milestonesError ||
                  deliverablesError) && (
                  <Text fontSize="sm" color="red.400">
                    No se pudo cargar la estructura del proyecto.
                  </Text>
                )}
                {!activitiesLoading &&
                  !subactivitiesLoading &&
                  !milestonesLoading &&
                  !deliverablesLoading &&
                  !activitiesError &&
                  !subactivitiesError &&
                  !milestonesError &&
                  !deliverablesError && (
                    <Stack spacing={4}>
                      {(activities ?? []).length === 0 ? (
                        <Text fontSize="sm" color={subtleText}>
                          No hay actividades registradas.
                        </Text>
                      ) : (
                        activities?.map((activity) => {
                          const activitySubactivities =
                            subactivitiesByActivity.get(activity.id) ?? [];
                          const activityMilestones =
                            milestonesByActivity.get(activity.id) ?? [];
                          return (
                            <Box
                              key={activity.id}
                              borderWidth="1px"
                              borderRadius="lg"
                              p={4}
                              bg={cardBg}
                            >
                              <Stack spacing={3}>
                                <Box>
                                  <Text fontWeight="semibold">{activity.name}</Text>
                                  {activity.description ? (
                                    <Text fontSize="sm" color={subtleText}>
                                      {activity.description}
                                    </Text>
                                  ) : (
                                    <Text fontSize="sm" color={subtleText}>
                                      Sin descripcion.
                                    </Text>
                                  )}
                                  <Stack direction="row" spacing={3} mt={2}>
                                    <Text fontSize="xs" color={subtleText}>
                                      Inicio: {activity.start_date ?? "Sin fecha"}
                                    </Text>
                                    <Text fontSize="xs" color={subtleText}>
                                      Fin: {activity.end_date ?? "Sin fecha"}
                                    </Text>
                                  </Stack>
                                </Box>
                                <Divider borderColor={panelBorder} />
                                <Box>
                                  <Text fontSize="sm" fontWeight="semibold">
                                    Subactividades
                                  </Text>
                                  {activitySubactivities.length === 0 ? (
                                    <Text fontSize="sm" color={subtleText}>
                                      Sin subactividades.
                                    </Text>
                                  ) : (
                                    <Stack spacing={3} mt={2}>
                                      {activitySubactivities.map((subactivity) => {
                                        const subTasks =
                                          tasksBySubactivity.get(subactivity.id) ??
                                          [];
                                        return (
                                          <Box
                                            key={subactivity.id}
                                            borderWidth="1px"
                                            borderRadius="md"
                                            p={3}
                                            bg={panelBg}
                                            borderColor={panelBorder}
                                          >
                                            <Stack spacing={2}>
                                              <Text fontWeight="semibold">
                                                {subactivity.name}
                                              </Text>
                                              {subactivity.description ? (
                                                <Text fontSize="sm" color={subtleText}>
                                                  {subactivity.description}
                                                </Text>
                                              ) : (
                                                <Text fontSize="sm" color={subtleText}>
                                                  Sin descripcion.
                                                </Text>
                                              )}
                                              <Stack direction="row" spacing={3}>
                                                <Text fontSize="xs" color={subtleText}>
                                                  Inicio:{" "}
                                                  {subactivity.start_date ?? "Sin fecha"}
                                                </Text>
                                                <Text fontSize="xs" color={subtleText}>
                                                  Fin:{" "}
                                                  {subactivity.end_date ?? "Sin fecha"}
                                                </Text>
                                              </Stack>
                                              <Box>
                                                <Text fontSize="sm" fontWeight="semibold">
                                                  Tareas
                                                </Text>
                                                {subTasks.length === 0 ? (
                                                  <Text fontSize="sm" color={subtleText}>
                                                    Sin tareas.
                                                  </Text>
                                                ) : (
                                                  <Stack spacing={2} mt={2}>
                                                    {subTasks.map((task) => (
                                                      <Box
                                                        key={task.id}
                                                        borderWidth="1px"
                                                        borderRadius="md"
                                                        p={2}
                                                        bg={cardBg}
                                                      >
                                                        <Stack
                                                          direction="row"
                                                          justify="space-between"
                                                          align="center"
                                                        >
                                                          <Text fontSize="sm">
                                                            {task.title}
                                                          </Text>
                                                          <Badge
                                                            bg={badgeBg}
                                                            color={badgeText}
                                                          >
                                                            {statusLabel(task)}
                                                          </Badge>
                                                        </Stack>
                                                      </Box>
                                                    ))}
                                                  </Stack>
                                                )}
                                              </Box>
                                            </Stack>
                                          </Box>
                                        );
                                      })}
                                    </Stack>
                                  )}
                                </Box>
                                {activityMilestones.length > 0 && (
                                  <Box>
                                    <Divider borderColor={panelBorder} mb={3} />
                                    <Text fontSize="sm" fontWeight="semibold">
                                      Hitos asociados
                                    </Text>
                                    <Stack spacing={3} mt={2}>
                                      {activityMilestones.map((milestone) => {
                                        const milestoneDeliverables =
                                          deliverablesByMilestone.get(
                                            milestone.id,
                                          ) ?? [];
                                        return (
                                          <Box
                                            key={milestone.id}
                                            borderWidth="1px"
                                            borderRadius="md"
                                            p={3}
                                            bg={panelBg}
                                            borderColor={panelBorder}
                                          >
                                            <Stack spacing={2}>
                                              <Text fontWeight="semibold">
                                                {milestone.title}
                                              </Text>
                                              <Text fontSize="sm" color={subtleText}>
                                                Fecha limite:{" "}
                                                {milestone.due_date ?? "Sin fecha"}
                                              </Text>
                                              {milestone.description ? (
                                                <Text fontSize="sm" color={subtleText}>
                                                  {milestone.description}
                                                </Text>
                                              ) : (
                                                <Text fontSize="sm" color={subtleText}>
                                                  Sin descripcion.
                                                </Text>
                                              )}
                                              <Box>
                                                <Text fontSize="sm" fontWeight="semibold">
                                                  Entregables
                                                </Text>
                                                {milestoneDeliverables.length === 0 ? (
                                                  <Text fontSize="sm" color={subtleText}>
                                                    Sin entregables.
                                                  </Text>
                                                ) : (
                                                  <Stack spacing={2} mt={2}>
                                                    {milestoneDeliverables.map(
                                                      (deliverable) => (
                                                        <Box
                                                          key={deliverable.id}
                                                          borderWidth="1px"
                                                          borderRadius="md"
                                                          p={2}
                                                          bg={cardBg}
                                                        >
                                                          <Text fontSize="sm">
                                                            {deliverable.title}
                                                          </Text>
                                                        </Box>
                                                      ),
                                                    )}
                                                  </Stack>
                                                )}
                                              </Box>
                                            </Stack>
                                          </Box>
                                        );
                                      })}
                                    </Stack>
                                  </Box>
                                )}
                              </Stack>
                            </Box>
                          );
                        })
                      )}
                      {projectMilestones.length > 0 && (
                        <Box>
                          <Heading size="sm" mb={3}>
                            Hitos del proyecto
                          </Heading>
                          <Stack spacing={3}>
                            {projectMilestones.map((milestone) => {
                              const milestoneDeliverables =
                                deliverablesByMilestone.get(milestone.id) ?? [];
                              return (
                                <Box
                                  key={milestone.id}
                                  borderWidth="1px"
                                  borderRadius="md"
                                  p={3}
                                  bg={cardBg}
                                >
                                  <Stack spacing={2}>
                                    <Text fontWeight="semibold">{milestone.title}</Text>
                                    <Text fontSize="sm" color={subtleText}>
                                      Fecha limite: {milestone.due_date ?? "Sin fecha"}
                                    </Text>
                                    {milestone.description ? (
                                      <Text fontSize="sm" color={subtleText}>
                                        {milestone.description}
                                      </Text>
                                    ) : (
                                      <Text fontSize="sm" color={subtleText}>
                                        Sin descripcion.
                                      </Text>
                                    )}
                                    <Box>
                                      <Text fontSize="sm" fontWeight="semibold">
                                        Entregables
                                      </Text>
                                      {milestoneDeliverables.length === 0 ? (
                                        <Text fontSize="sm" color={subtleText}>
                                          Sin entregables.
                                        </Text>
                                      ) : (
                                        <Stack spacing={2} mt={2}>
                                          {milestoneDeliverables.map((deliverable) => (
                                            <Box
                                              key={deliverable.id}
                                              borderWidth="1px"
                                              borderRadius="md"
                                              p={2}
                                              bg={panelBg}
                                              borderColor={panelBorder}
                                            >
                                              <Text fontSize="sm">
                                                {deliverable.title}
                                              </Text>
                                            </Box>
                                          ))}
                                        </Stack>
                                      )}
                                    </Box>
                                  </Stack>
                                </Box>
                              );
                            })}
                          </Stack>
                        </Box>
                      )}
                    </Stack>
                  )}
              </Stack>
            </Box>
          </Stack>
        )}
      </Stack>
    </AppShell>
  );
};
