
import React from "react";

import {
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
} from "@chakra-ui/react";

import type { ErpProject as ErpProjectApi } from "../../../api/erpReports";
import type { ErpActivity, ErpMilestone, ErpSubActivity } from "../../../api/erpStructure";
import type { ErpTask as ErpTaskApi } from "../../../api/erpTimeTracking";

interface ProjectDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProject: ErpProjectApi | null;
  subtleText: string;
  selectedProjectActivities: ErpActivity[];
  selectedProjectSubactivities: ErpSubActivity[];
  selectedProjectMilestones: ErpMilestone[];
  selectedProjectTasks: ErpTaskApi[];
  editName: string;
  setEditName: (value: string) => void;
  editActive: boolean;
  setEditActive: (value: boolean) => void;
  editDescription: string;
  setEditDescription: (value: string) => void;
  editStart: string;
  setEditStart: (value: string) => void;
  editEnd: string;
  setEditEnd: (value: string) => void;
  activityEdits: Record<number, { name: string; start: string; end: string; description: string }>;
  setActivityEdits: React.Dispatch<React.SetStateAction<Record<number, { name: string; start: string; end: string; description: string }>>>;
  subactivityEdits: Record<number, { name: string; start: string; end: string; description: string }>;
  setSubactivityEdits: React.Dispatch<React.SetStateAction<Record<number, { name: string; start: string; end: string; description: string }>>>;
  milestoneEdits: Record<number, { title: string; due: string; description: string }>;
  setMilestoneEdits: React.Dispatch<React.SetStateAction<Record<number, { title: string; due: string; description: string }>>>;
  onUpdateActivity: (activityId: number) => void;
  onUpdateSubactivity: (subactivityId: number) => void;
  onUpdateMilestone: (milestoneId: number) => void;
  updateActivityPending: boolean;
  updateSubActivityPending: boolean;
  updateMilestonePending: boolean;
  onDeleteProject: () => void;
  deleteProjectPending: boolean;
  onUpdateProject: () => void;
  updateProjectPending: boolean;
}

export const ProjectDetailsModal: React.FC<ProjectDetailsModalProps> = ({
  isOpen,
  onClose,
  selectedProject,
  subtleText,
  selectedProjectActivities,
  selectedProjectSubactivities,
  selectedProjectMilestones,
  selectedProjectTasks,
  editName,
  setEditName,
  editActive,
  setEditActive,
  editDescription,
  setEditDescription,
  editStart,
  setEditStart,
  editEnd,
  setEditEnd,
  activityEdits,
  setActivityEdits,
  subactivityEdits,
  setSubactivityEdits,
  milestoneEdits,
  setMilestoneEdits,
  onUpdateActivity,
  onUpdateSubactivity,
  onUpdateMilestone,
  updateActivityPending,
  updateSubActivityPending,
  updateMilestonePending,
  onDeleteProject,
  deleteProjectPending,
  onUpdateProject,
  updateProjectPending,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    size="6xl"
    scrollBehavior="inside"
    isCentered
  >
    <ModalOverlay />
    <ModalContent>
      <ModalHeader borderBottomWidth="1px">
        {selectedProject ? `Proyecto: ${selectedProject.name}` : "Proyecto"}
      </ModalHeader>
      <ModalCloseButton />
      <ModalBody>
        {selectedProject ? (
          <Stack spacing={4}>
            <Stack spacing={1} fontSize="sm" color={subtleText}>
              <Text>ID: {selectedProject.id}</Text>
              {selectedProject.created_at && (
                <Text>Creado: {selectedProject.created_at}</Text>
              )}
            </Stack>

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              <Box borderWidth="1px" borderRadius="md" p={3}>
                <Text fontSize="xs" color={subtleText}>
                  Inicio
                </Text>
                <Text fontWeight="semibold">
                  {selectedProject.start_date || "Sin inicio"}
                </Text>
              </Box>

              <Box borderWidth="1px" borderRadius="md" p={3}>
                <Text fontSize="xs" color={subtleText}>
                  Fin
                </Text>
                <Text fontWeight="semibold">
                  {selectedProject.end_date || "Sin fin"}
                </Text>
              </Box>

              <Box borderWidth="1px" borderRadius="md" p={3}>
                <Text fontSize="xs" color={subtleText}>
                  Actividades
                </Text>
                <Text fontWeight="semibold">
                  {selectedProjectActivities.length}
                </Text>
              </Box>

              <Box borderWidth="1px" borderRadius="md" p={3}>
                <Text fontSize="xs" color={subtleText}>
                  Hitos
                </Text>
                <Text fontWeight="semibold">
                  {selectedProjectMilestones.length}
                </Text>
              </Box>
            </SimpleGrid>

            <Divider />

            <Heading size="sm">Editar datos</Heading>

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              <FormControl isRequired>
                <FormLabel>Nombre</FormLabel>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </FormControl>

              <FormControl>
                <FormLabel>Activo</FormLabel>
                <Switch
                  isChecked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  colorScheme="green"
                />
              </FormControl>

              <FormControl gridColumn={{ base: "auto", md: "1 / -1" }}>
                <FormLabel>Descripcion</FormLabel>
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                />
              </FormControl>

              <FormControl>
                <FormLabel>Inicio</FormLabel>
                <Input type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
              </FormControl>

              <FormControl>
                <FormLabel>Fin</FormLabel>
                <Input type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
              </FormControl>
            </SimpleGrid>

            <Divider />

            <Heading size="sm">Actividades</Heading>

            <Stack spacing={3}>
              {selectedProjectActivities.length === 0 ? (
                <Text fontSize="sm" color={subtleText}>
                  Sin actividades vinculadas.
                </Text>
              ) : (
                selectedProjectActivities.map((act) => {
                  const form = activityEdits[act.id] || {
                    name: "",
                    start: "",
                    end: "",
                    description: "",
                  };

                  return (
                    <Box key={act.id} borderWidth="1px" borderRadius="md" p={3}>
                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2} mb={2}>
                        <FormControl>
                          <FormLabel fontSize="xs">Nombre</FormLabel>
                          <Input
                            value={form.name}
                            onChange={(e) =>
                              setActivityEdits((prev) => ({
                                ...prev,
                                [act.id]: { ...form, name: e.target.value },
                              }))
                            }
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel fontSize="xs">Descripcion</FormLabel>
                          <Input
                            value={form.description}
                            onChange={(e) =>
                              setActivityEdits((prev) => ({
                                ...prev,
                                [act.id]: {
                                  ...form,
                                  description: e.target.value,
                                },
                              }))
                            }
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel fontSize="xs">Inicio</FormLabel>
                          <Input
                            type="date"
                            value={form.start}
                            onChange={(e) =>
                              setActivityEdits((prev) => ({
                                ...prev,
                                [act.id]: { ...form, start: e.target.value },
                              }))
                            }
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel fontSize="xs">Fin</FormLabel>
                          <Input
                            type="date"
                            value={form.end}
                            onChange={(e) =>
                              setActivityEdits((prev) => ({
                                ...prev,
                                [act.id]: { ...form, end: e.target.value },
                              }))
                            }
                          />
                        </FormControl>
                      </SimpleGrid>

                      <HStack justify="space-between">
                        <Text fontSize="xs" color={subtleText}>
                          Subactividades:{" "}
                          {
                            selectedProjectSubactivities.filter(
                              (sub) => sub.activity_id === act.id,
                            ).length
                          }
                        </Text>
                        <Button
                          size="sm"
                          colorScheme="green"
                          onClick={() => onUpdateActivity(act.id)}
                          isLoading={updateActivityPending}
                        >
                          Guardar actividad
                        </Button>
                      </HStack>
                    </Box>
                  );
                })
              )}
            </Stack>

            <Heading size="sm">Subactividades</Heading>
            <Stack spacing={3}>
              {selectedProjectSubactivities.length === 0 ? (
                <Text fontSize="sm" color={subtleText}>
                  Sin subactividades.
                </Text>
              ) : (
                selectedProjectSubactivities.map((sub) => {
                  const form = subactivityEdits[sub.id] || {
                    name: "",
                    start: "",
                    end: "",
                    description: "",
                  };

                  const parentActivity = selectedProjectActivities.find(
                    (act) => act.id === sub.activity_id,
                  );

                  return (
                    <Box key={sub.id} borderWidth="1px" borderRadius="md" p={3}>
                      <Text fontSize="xs" color={subtleText} mb={1}>
                        Actividad: {parentActivity?.name ?? "-"}
                      </Text>

                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2} mb={2}>
                        <FormControl>
                          <FormLabel fontSize="xs">Nombre</FormLabel>
                          <Input
                            value={form.name}
                            onChange={(e) =>
                              setSubactivityEdits((prev) => ({
                                ...prev,
                                [sub.id]: { ...form, name: e.target.value },
                              }))
                            }
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel fontSize="xs">Descripcion</FormLabel>
                          <Input
                            value={form.description}
                            onChange={(e) =>
                              setSubactivityEdits((prev) => ({
                                ...prev,
                                [sub.id]: {
                                  ...form,
                                  description: e.target.value,
                                },
                              }))
                            }
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel fontSize="xs">Inicio</FormLabel>
                          <Input
                            type="date"
                            value={form.start}
                            onChange={(e) =>
                              setSubactivityEdits((prev) => ({
                                ...prev,
                                [sub.id]: { ...form, start: e.target.value },
                              }))
                            }
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel fontSize="xs">Fin</FormLabel>
                          <Input
                            type="date"
                            value={form.end}
                            onChange={(e) =>
                              setSubactivityEdits((prev) => ({
                                ...prev,
                                [sub.id]: { ...form, end: e.target.value },
                              }))
                            }
                          />
                        </FormControl>
                      </SimpleGrid>

                      <Flex justify="flex-end">
                        <Button
                          size="sm"
                          colorScheme="green"
                          onClick={() => onUpdateSubactivity(sub.id)}
                          isLoading={updateSubActivityPending}
                        >
                          Guardar subactividad
                        </Button>
                      </Flex>
                    </Box>
                  );
                })
              )}
            </Stack>

            <Heading size="sm">Hitos</Heading>

            <Stack spacing={3}>
              {selectedProjectMilestones.length === 0 ? (
                <Text fontSize="sm" color={subtleText}>
                  Sin hitos.
                </Text>
              ) : (
                selectedProjectMilestones.map((milestone) => {
                  const form = milestoneEdits[milestone.id] || {
                    title: "",
                    due: "",
                    description: "",
                  };

                  return (
                    <Box key={milestone.id} borderWidth="1px" borderRadius="md" p={3}>
                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2} mb={2}>
                        <FormControl>
                          <FormLabel fontSize="xs">Titulo</FormLabel>
                          <Input
                            value={form.title}
                            onChange={(e) =>
                              setMilestoneEdits((prev) => ({
                                ...prev,
                                [milestone.id]: {
                                  ...form,
                                  title: e.target.value,
                                },
                              }))
                            }
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel fontSize="xs">Descripcion</FormLabel>
                          <Input
                            value={form.description}
                            onChange={(e) =>
                              setMilestoneEdits((prev) => ({
                                ...prev,
                                [milestone.id]: {
                                  ...form,
                                  description: e.target.value,
                                },
                              }))
                            }
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel fontSize="xs">Fecha</FormLabel>
                          <Input
                            type="date"
                            value={form.due}
                            onChange={(e) =>
                              setMilestoneEdits((prev) => ({
                                ...prev,
                                [milestone.id]: { ...form, due: e.target.value },
                              }))
                            }
                          />
                        </FormControl>
                      </SimpleGrid>

                      <Flex justify="flex-end">
                        <Button
                          size="sm"
                          colorScheme="green"
                          onClick={() => onUpdateMilestone(milestone.id)}
                          isLoading={updateMilestonePending}
                        >
                          Guardar hito
                        </Button>
                      </Flex>
                    </Box>
                  );
                })
              )}
            </Stack>

            <Heading size="sm">Tareas</Heading>

            <Stack spacing={3}>
              {selectedProjectTasks.length === 0 ? (
                <Text fontSize="sm" color={subtleText}>
                  Sin tareas.
                </Text>
              ) : (
                selectedProjectTasks.map((task) => (
                  <Box key={task.id} borderWidth="1px" borderRadius="md" p={3}>
                    <Flex justify="space-between" align="center" mb={1}>
                      <Text fontWeight="semibold">{task.title}</Text>
                      <Badge colorScheme={task.is_completed ? "green" : "yellow"}>
                        {task.status || (task.is_completed ? "completed" : "pendiente")}
                      </Badge>
                    </Flex>

                    <Text fontSize="xs" color={subtleText}>
                      {task.start_date || "Sin inicio"} OCo{" "}
                      {task.end_date || "Sin fin"}
                    </Text>

                    {task.description && (
                      <Text mt={1} fontSize="xs" color={subtleText}>
                        {task.description}
                      </Text>
                    )}
                  </Box>
                ))
              )}
            </Stack>
          </Stack>
        ) : (
          <Text fontSize="sm" color={subtleText}>
            Selecciona un proyecto para ver los detalles.
          </Text>
        )}
      </ModalBody>

      <ModalFooter borderTopWidth="1px">
        <Button variant="ghost" mr={3} onClick={onClose}>
          Cerrar
        </Button>

        <Button
          variant="outline"
          colorScheme="red"
          mr={3}
          onClick={onDeleteProject}
          isLoading={deleteProjectPending}
          isDisabled={!selectedProject}
        >
          Eliminar proyecto
        </Button>

        <Button
          colorScheme="green"
          onClick={onUpdateProject}
          isLoading={updateProjectPending}
          isDisabled={!selectedProject}
        >
          Guardar cambios
        </Button>
      </ModalFooter>
    </ModalContent>
  </Modal>
);
