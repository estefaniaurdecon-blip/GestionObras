
import React from "react";

import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";

import type { ProjectActivityForm, ProjectMilestoneForm } from "../../../utils/erp";
import type { TenantOption } from "../../../api/users";

interface CreateProjectSectionProps {
  isSuperAdmin: boolean;
  selectedTenantId: string;
  activeTenants: TenantOption[];
  onTenantChange: (value: string) => void;
  projectName: string;
  onProjectNameChange: (value: string) => void;
  projectDescription: string;
  onProjectDescriptionChange: (value: string) => void;
  projectType: "regional" | "nacional" | "internacional";
  onProjectTypeChange: (value: "regional" | "nacional" | "internacional") => void;
  projectStart: string;
  onProjectStartChange: (value: string) => void;
  projectEnd: string;
  onProjectEndChange: (value: string) => void;
  projectLoanPercent: string;
  onProjectLoanPercentChange: (value: string) => void;
  projectSubsidyPercent: string;
  onProjectSubsidyPercentChange: (value: string) => void;
  projectActivities: ProjectActivityForm[];
  setProjectActivities: React.Dispatch<React.SetStateAction<ProjectActivityForm[]>>;
  onAddActivity: () => void;
  onAddSubactivity: (activityId: string) => void;
  projectMilestones: ProjectMilestoneForm[];
  setProjectMilestones: React.Dispatch<React.SetStateAction<ProjectMilestoneForm[]>>;
  onAddMilestone: () => void;
  onSaveProject: () => void;
  isSaving: boolean;
  subtleText: string;
  cardBg: string;
}

export const CreateProjectSection: React.FC<CreateProjectSectionProps> = ({
  isSuperAdmin,
  selectedTenantId,
  activeTenants,
  onTenantChange,
  projectName,
  onProjectNameChange,
  projectDescription,
  onProjectDescriptionChange,
  projectType,
  onProjectTypeChange,
  projectStart,
  onProjectStartChange,
  projectEnd,
  onProjectEndChange,
  projectLoanPercent,
  onProjectLoanPercentChange,
  projectSubsidyPercent,
  onProjectSubsidyPercentChange,
  projectActivities,
  setProjectActivities,
  onAddActivity,
  onAddSubactivity,
  projectMilestones,
  setProjectMilestones,
  onAddMilestone,
  onSaveProject,
  isSaving,
  subtleText,
  cardBg,
}) => (
  <Stack spacing={4}>
    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
      {isSuperAdmin && (
        <FormControl isRequired>
          <FormLabel>Tenant</FormLabel>
          <Select
            placeholder="Selecciona un tenant"
            value={selectedTenantId}
            onChange={(e) => onTenantChange(e.target.value)}
          >
            {activeTenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </Select>
        </FormControl>
      )}

      <FormControl isRequired>
        <FormLabel>Nombre del proyecto</FormLabel>
        <Input value={projectName} onChange={(e) => onProjectNameChange(e.target.value)} />
      </FormControl>

      <FormControl>
        <FormLabel>Descripcion</FormLabel>
        <Input value={projectDescription} onChange={(e) => onProjectDescriptionChange(e.target.value)} />
      </FormControl>

      <FormControl>
        <FormLabel>Tipo de proyecto</FormLabel>
        <Select
          value={projectType}
          onChange={(e) =>
            onProjectTypeChange(
              e.target.value as "regional" | "nacional" | "internacional",
            )
          }
        >
          <option value="regional">Regional</option>
          <option value="nacional">Nacional</option>
          <option value="internacional">Internacional</option>
        </Select>
      </FormControl>

      <FormControl>
        <FormLabel>Inicio</FormLabel>
        <Input type="date" value={projectStart} onChange={(e) => onProjectStartChange(e.target.value)} />
      </FormControl>

      <FormControl>
        <FormLabel>Fin</FormLabel>
        <Input type="date" value={projectEnd} onChange={(e) => onProjectEndChange(e.target.value)} />
      </FormControl>

      <FormControl>
        <FormLabel>% Préstamo</FormLabel>
        <Input
          type="text"
          inputMode="decimal"
          value={projectLoanPercent}
          onChange={(e) => onProjectLoanPercentChange(e.target.value)}
        />
      </FormControl>

      <FormControl>
        <FormLabel>% Subvención no reembolsable</FormLabel>
        <Input
          type="text"
          inputMode="decimal"
          value={projectSubsidyPercent}
          onChange={(e) => onProjectSubsidyPercentChange(e.target.value)}
        />
      </FormControl>
    </SimpleGrid>

    <Flex justify="space-between" align="center">
      <Heading size="sm">Actividades</Heading>
      <Button size="sm" onClick={onAddActivity}>
        + Anadir actividad
      </Button>
    </Flex>

    <Stack spacing={3}>
      {projectActivities.length === 0 && (
        <Text fontSize="sm" color={subtleText}>
          Anade actividades con peso y fechas.
        </Text>
      )}

      {projectActivities.map((act, idx) => (
        <Box key={act.id} borderWidth="1px" borderRadius="md" p={3} bg={cardBg}>
          <SimpleGrid columns={{ base: 1, md: 5 }} spacing={3}>
            <FormControl>
              <FormLabel fontSize="sm">Actividad #{idx + 1}</FormLabel>
              <Input
                value={act.name}
                onChange={(e) =>
                  setProjectActivities((prev) =>
                    prev.map((item) =>
                      item.id === act.id ? { ...item, name: e.target.value } : item,
                    ),
                  )
                }
              />
            </FormControl>

            <FormControl>
              <FormLabel fontSize="sm">Peso %</FormLabel>
              <Input
                type="number"
                value={act.weight}
                onChange={(e) =>
                  setProjectActivities((prev) =>
                    prev.map((item) =>
                      item.id === act.id
                        ? { ...item, weight: Number(e.target.value) }
                        : item,
                    ),
                  )
                }
              />
            </FormControl>

            <FormControl>
              <FormLabel fontSize="sm">Inicio</FormLabel>
              <Input
                type="date"
                value={act.start}
                onChange={(e) =>
                  setProjectActivities((prev) =>
                    prev.map((item) =>
                      item.id === act.id ? { ...item, start: e.target.value } : item,
                    ),
                  )
                }
              />
            </FormControl>

            <FormControl>
              <FormLabel fontSize="sm">Fin</FormLabel>
              <Input
                type="date"
                value={act.end}
                onChange={(e) =>
                  setProjectActivities((prev) =>
                    prev.map((item) =>
                      item.id === act.id ? { ...item, end: e.target.value } : item,
                    ),
                  )
                }
              />
            </FormControl>

            <Button
              size="xs"
              variant="ghost"
              colorScheme="red"
              alignSelf="flex-end"
              onClick={() =>
                setProjectActivities((prev) =>
                  prev.filter((item) => item.id !== act.id),
                )
              }
            >
              Eliminar
            </Button>
          </SimpleGrid>

          <Button size="xs" mt={2} onClick={() => onAddSubactivity(act.id)}>
            + Anadir subactividad
          </Button>

          <Stack mt={2} spacing={2}>
            {act.subactivities.length === 0 ? (
              <Text fontSize="xs" color={subtleText}>
                Sin subactividades.
              </Text>
            ) : (
              act.subactivities.map((sub, sidx) => (
                <SimpleGrid
                  key={sub.id}
                  columns={{ base: 1, md: 4 }}
                  spacing={2}
                  alignItems="center"
                >
                  <FormControl>
                    <FormLabel fontSize="xs">Subactividad #{sidx + 1}</FormLabel>
                    <Input
                      value={sub.name}
                      onChange={(e) =>
                        setProjectActivities((prev) =>
                          prev.map((item) =>
                            item.id === act.id
                              ? {
                                  ...item,
                                  subactivities: item.subactivities.map((s) =>
                                    s.id === sub.id
                                      ? { ...s, name: e.target.value }
                                      : s,
                                  ),
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel fontSize="xs">Peso %</FormLabel>
                    <Input
                      type="number"
                      value={sub.weight}
                      onChange={(e) =>
                        setProjectActivities((prev) =>
                          prev.map((item) =>
                            item.id === act.id
                              ? {
                                  ...item,
                                  subactivities: item.subactivities.map((s) =>
                                    s.id === sub.id
                                      ? {
                                          ...s,
                                          weight: Number(e.target.value),
                                        }
                                      : s,
                                  ),
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel fontSize="xs">Inicio</FormLabel>
                    <Input
                      type="date"
                      value={sub.start}
                      onChange={(e) =>
                        setProjectActivities((prev) =>
                          prev.map((item) =>
                            item.id === act.id
                              ? {
                                  ...item,
                                  subactivities: item.subactivities.map((s) =>
                                    s.id === sub.id
                                      ? { ...s, start: e.target.value }
                                      : s,
                                  ),
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel fontSize="xs">Fin</FormLabel>
                    <Input
                      type="date"
                      value={sub.end}
                      onChange={(e) =>
                        setProjectActivities((prev) =>
                          prev.map((item) =>
                            item.id === act.id
                              ? {
                                  ...item,
                                  subactivities: item.subactivities.map((s) =>
                                    s.id === sub.id
                                      ? { ...s, end: e.target.value }
                                      : s,
                                  ),
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </FormControl>
                </SimpleGrid>
              ))
            )}
          </Stack>
        </Box>
      ))}
    </Stack>

    <Flex justify="space-between" align="center">
      <Heading size="sm">Hitos</Heading>
      <Button size="sm" onClick={onAddMilestone}>
        + Anadir hito
      </Button>
    </Flex>

    <Stack spacing={3}>
      {projectMilestones.length === 0 ? (
        <Text fontSize="sm" color={subtleText}>
          Anade hitos con fechas.
        </Text>
      ) : (
        projectMilestones.map((mil, idx) => (
          <SimpleGrid key={mil.id} columns={{ base: 1, md: 4 }} spacing={3}>
            <FormControl>
              <FormLabel fontSize="sm">Hito #{idx + 1}</FormLabel>
              <Input
                value={mil.name}
                onChange={(e) =>
                  setProjectMilestones((prev) =>
                    prev.map((m) =>
                      m.id === mil.id ? { ...m, name: e.target.value } : m,
                    ),
                  )
                }
              />
            </FormControl>

            <FormControl>
              <FormLabel fontSize="sm">Inicio</FormLabel>
              <Input
                type="date"
                value={mil.start}
                onChange={(e) =>
                  setProjectMilestones((prev) =>
                    prev.map((m) =>
                      m.id === mil.id ? { ...m, start: e.target.value } : m,
                    ),
                  )
                }
              />
            </FormControl>

            <FormControl>
              <FormLabel fontSize="sm">Fin</FormLabel>
              <Input
                type="date"
                value={mil.end}
                onChange={(e) =>
                  setProjectMilestones((prev) =>
                    prev.map((m) =>
                      m.id === mil.id ? { ...m, end: e.target.value } : m,
                    ),
                  )
                }
              />
            </FormControl>

            <Button
              size="xs"
              variant="ghost"
              colorScheme="red"
              alignSelf="flex-end"
              onClick={() =>
                setProjectMilestones((prev) =>
                  prev.filter((m) => m.id !== mil.id),
                )
              }
            >
              Eliminar
            </Button>
          </SimpleGrid>
        ))
      )}
    </Stack>

    <Button alignSelf="flex-start" colorScheme="green" onClick={onSaveProject} isLoading={isSaving}>
      Guardar proyecto
    </Button>
  </Stack>
);
