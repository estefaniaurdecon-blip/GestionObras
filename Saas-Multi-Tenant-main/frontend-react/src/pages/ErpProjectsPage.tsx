import React, { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Divider,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchErpProjects, type ErpProject } from "../api/erpReports";
import { createErpProject, createErpTask, type ErpTaskCreate } from "../api/erpManagement";
import { fetchErpTasks, type ErpTask } from "../api/erpTimeTracking";
import { fetchUsersByTenant, type TenantUserSummary } from "../api/users";
import { AppShell } from "../components/layout/AppShell";

export const ErpProjectsPage: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.500", "gray.300");
  const panelBg = useColorModeValue("gray.50", "gray.800");
  const accent = useColorModeValue("brand.500", "brand.300");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskProjectId, setTaskProjectId] = useState<string>("");
  const [taskAssigneeId, setTaskAssigneeId] = useState<string>("");

  let tenantId = 1;
  let isSuperAdmin = false;
  try {
    const raw = localStorage.getItem("current_user");
    if (raw) {
      const me = JSON.parse(raw) as { tenant_id?: number | null; is_super_admin?: boolean };
      if (me.tenant_id) {
        tenantId = me.tenant_id;
      }
      isSuperAdmin = Boolean(me.is_super_admin);
    }
  } catch {
    tenantId = 1;
    isSuperAdmin = false;
  }

  const { data: projects, isLoading, error } = useQuery<ErpProject[]>({
    queryKey: ["erp-projects"],
    queryFn: fetchErpProjects,
  });

  const { data: tasks } = useQuery<ErpTask[]>({
    queryKey: ["erp-tasks"],
    queryFn: fetchErpTasks,
  });

  const { data: users } = useQuery<TenantUserSummary[]>({
    queryKey: ["tenant-users", tenantId],
    queryFn: () => fetchUsersByTenant(tenantId),
  });

  const userMap = useMemo(() => {
    const map = new Map<number, string>();
    (users ?? []).forEach((user) => {
      map.set(user.id, user.full_name || user.email);
    });
    return map;
  }, [users]);

  const projectCount = projects?.length ?? 0;
  const taskCount = tasks?.length ?? 0;
  const assignedCount = tasks?.filter((task) => task.assigned_to_id).length ?? 0;

  const createProjectMutation = useMutation({
    mutationFn: () =>
      createErpProject({
        name: projectName.trim(),
        description: projectDescription.trim() || null,
      }),
    onSuccess: async () => {
      setProjectName("");
      setProjectDescription("");
      await queryClient.invalidateQueries({ queryKey: ["erp-projects"] });
      toast({ title: "Proyecto creado", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "No se pudo crear el proyecto",
        description: error?.response?.data?.detail ?? "Revisa los datos.",
        status: "error",
      });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: (payload: ErpTaskCreate) => createErpTask(payload),
    onSuccess: async () => {
      setTaskTitle("");
      setTaskDescription("");
      setTaskProjectId("");
      setTaskAssigneeId("");
      await queryClient.invalidateQueries({ queryKey: ["erp-tasks"] });
      toast({ title: "Tarea creada", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "No se pudo crear la tarea",
        description: error?.response?.data?.detail ?? "Revisa los datos.",
        status: "error",
      });
    },
  });

  const handleCreateProject = () => {
    if (!projectName.trim()) {
      toast({ title: "Nombre requerido", status: "warning" });
      return;
    }
    createProjectMutation.mutate();
  };

  const handleCreateTask = () => {
    if (!taskTitle.trim()) {
      toast({ title: "Titulo requerido", status: "warning" });
      return;
    }

    const payload: ErpTaskCreate = {
      title: taskTitle.trim(),
      description: taskDescription.trim() || null,
      project_id: taskProjectId ? Number(taskProjectId) : null,
      assigned_to_id: taskAssigneeId ? Number(taskAssigneeId) : null,
    };

    createTaskMutation.mutate(payload);
  };

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
            ERP Interno
          </Text>
          <Heading size="lg">Proyectos, tareas y tiempo en un solo panel</Heading>
          <Text fontSize="sm" opacity={0.9}>
            Crea proyectos, asigna tareas y mide el tiempo sin salir del dashboard.
          </Text>
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} pt={2}>
            <Box bg="rgba(255,255,255,0.12)" p={3} borderRadius="lg">
              <Text fontSize="xs" textTransform="uppercase" opacity={0.7}>
                Proyectos activos
              </Text>
              <Text fontSize="2xl" fontWeight="semibold">
                {projectCount}
              </Text>
            </Box>
            <Box bg="rgba(255,255,255,0.12)" p={3} borderRadius="lg">
              <Text fontSize="xs" textTransform="uppercase" opacity={0.7}>
                Tareas totales
              </Text>
              <Text fontSize="2xl" fontWeight="semibold">
                {taskCount}
              </Text>
            </Box>
            <Box bg="rgba(255,255,255,0.12)" p={3} borderRadius="lg">
              <Text fontSize="xs" textTransform="uppercase" opacity={0.7}>
                Tareas asignadas
              </Text>
              <Text fontSize="2xl" fontWeight="semibold">
                {assignedCount}
              </Text>
            </Box>
          </SimpleGrid>
        </Stack>
      </Box>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={10}>
        <Box
          as={Link}
          to="/erp/projects"
          borderWidth="1px"
          borderRadius="xl"
          p={4}
          bg={cardBg}
          _hover={{ shadow: "md", borderColor: accent }}
        >
          <Text fontSize="xs" textTransform="uppercase" color={subtleText}>
            Gestión
          </Text>
          <Heading size="sm" mb={1}>
            Proyectos y tareas
          </Heading>
          <Text fontSize="sm" color={subtleText}>
            Organiza trabajo por equipos y prioridades.
          </Text>
        </Box>
        <Box
          as={Link}
          to="/erp/time-control"
          borderWidth="1px"
          borderRadius="xl"
          p={4}
          bg={cardBg}
          _hover={{ shadow: "md", borderColor: accent }}
        >
          <Text fontSize="xs" textTransform="uppercase" color={subtleText}>
            Tiempo en vivo
          </Text>
          <Heading size="sm" mb={1}>
            Control de tiempo
          </Heading>
          <Text fontSize="sm" color={subtleText}>
            Inicia y detén tareas con un solo clic.
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
          <Text fontSize="xs" textTransform="uppercase" color={subtleText}>
            Analítica
          </Text>
          <Heading size="sm" mb={1}>
            Informe de horas
          </Heading>
          <Text fontSize="sm" color={subtleText}>
            Analiza productividad por proyecto y usuario.
          </Text>
        </Box>
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6} mb={10}>
        <Box borderWidth="1px" borderRadius="xl" p={6} bg={panelBg}>
          <Heading size="sm" mb={4}>
            Crear proyecto
          </Heading>
          <Stack spacing={3}>
            <FormControl>
              <FormLabel>Nombre del proyecto</FormLabel>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            </FormControl>
            <FormControl>
              <FormLabel>Descripcion</FormLabel>
              <Textarea
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                rows={3}
              />
            </FormControl>
            <Button
              colorScheme="green"
              onClick={handleCreateProject}
              isLoading={createProjectMutation.isPending}
              alignSelf="flex-start"
            >
              Crear proyecto
            </Button>
          </Stack>
        </Box>

        <Box borderWidth="1px" borderRadius="xl" p={6} bg={panelBg}>
          <Heading size="sm" mb={4}>
            Crear tarea
          </Heading>
          <Stack spacing={3}>
            <FormControl>
              <FormLabel>Titulo de la tarea</FormLabel>
              <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
            </FormControl>
            <FormControl>
              <FormLabel>Descripcion</FormLabel>
              <Textarea
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                rows={3}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Proyecto</FormLabel>
              <Select
                placeholder="Sin proyecto"
                value={taskProjectId}
                onChange={(e) => setTaskProjectId(e.target.value)}
              >
                {(projects ?? []).map((project) => (
                  <option key={project.id} value={String(project.id)}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>Asignar a</FormLabel>
              <Select
                placeholder={isSuperAdmin ? "Selecciona usuario" : "Usuarios del tenant"}
                value={taskAssigneeId}
                onChange={(e) => setTaskAssigneeId(e.target.value)}
              >
                {(users ?? []).map((user) => (
                  <option key={user.id} value={String(user.id)}>
                    {user.full_name || user.email}
                  </option>
                ))}
              </Select>
            </FormControl>
            <Button
              colorScheme="green"
              onClick={handleCreateTask}
              isLoading={createTaskMutation.isPending}
              alignSelf="flex-start"
            >
              Crear tarea
            </Button>
          </Stack>
        </Box>
      </SimpleGrid>

      <Divider mb={6} />

      <Heading size="md" mb={4}>
        Proyectos activos
      </Heading>

      {isLoading && <Text>Cargando proyectos...</Text>}
      {error && (
        <Text color="red.400">No se pudieron cargar los proyectos del ERP.</Text>
      )}

      {!isLoading && !error && projects && (
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4} mb={10}>
          {projects.map((project) => (
            <Box
              key={project.id}
              borderWidth="1px"
              borderRadius="xl"
              p={4}
              bg={cardBg}
              _hover={{ borderColor: accent, shadow: "md" }}
            >
              <Heading size="sm" mb={1}>
                {project.name}
              </Heading>
              <Text fontSize="xs" color={subtleText}>
                ID: {project.id}
              </Text>
            </Box>
          ))}
        </SimpleGrid>
      )}

      <Heading size="md" mb={4}>
        Tareas
      </Heading>
      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
        {(tasks ?? []).map((task) => (
          <Box
            key={task.id}
            borderWidth="1px"
            borderRadius="xl"
            p={4}
            bg={cardBg}
            _hover={{ borderColor: accent, shadow: "md" }}
          >
            <Stack spacing={2}>
              <Box>
                <Heading size="sm">{task.title}</Heading>
                <Text fontSize="xs" color={subtleText}>
                  Tarea #{task.id}
                </Text>
              </Box>
              <Stack direction="row" spacing={2} align="center">
                <Badge colorScheme={task.is_completed ? "green" : "orange"}>
                  {task.is_completed ? "Completada" : "Pendiente"}
                </Badge>
                {task.project_id && (
                  <Badge variant="subtle" colorScheme="blue">
                    Proyecto #{task.project_id}
                  </Badge>
                )}
              </Stack>
              {task.assigned_to_id && (
                <Text fontSize="xs" color={subtleText}>
                  Asignado: {userMap.get(task.assigned_to_id) ?? task.assigned_to_id}
                </Text>
              )}
            </Stack>
          </Box>
        ))}
      </SimpleGrid>
    </AppShell>
  );
};
