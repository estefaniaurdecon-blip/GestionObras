import { useCallback, type Dispatch, type SetStateAction, type ChangeEvent } from 'react';
import {
  createMaterialGroup,
  createMaterialRow,
  createServiceLine,
  createSubcontractAssignedWorker,
  createSubcontractRow,
  createSubcontractedMachineryRow,
  createSubcontractedMachineryGroup,
  createSubcontractGroup,
  createWorkforceGroup,
  createWorkforceRow,
  nonNegative,
  normalizeSubcontractUnit,
  sanitizeText,
} from '@/components/work-report/helpers';
import type {
  EditableRow,
  GalleryImage,
  MaterialGroup,
  MaterialRow,
  ServiceLine,
  SubcontractAssignedWorker,
  SubcontractGroup,
  SubcontractRow,
  SubcontractedMachineryGroup,
  SubcontractedMachineryRow,
  WorkforceGroup,
  WorkforceRow,
} from '@/components/work-report/types';

export interface UseWorkReportFormHandlersParams {
  workforceGroups: WorkforceGroup[];
  setWorkforceGroups: Dispatch<SetStateAction<WorkforceGroup[]>>;
  subcontractedMachineryGroups: SubcontractedMachineryGroup[];
  setSubcontractedMachineryGroups: Dispatch<SetStateAction<SubcontractedMachineryGroup[]>>;
  materialGroups: MaterialGroup[];
  setMaterialGroups: Dispatch<SetStateAction<MaterialGroup[]>>;
  openMaterialGroups: Record<string, boolean>;
  setOpenMaterialGroups: Dispatch<SetStateAction<Record<string, boolean>>>;
  activeMaterialGroupId: string | null;
  setActiveMaterialGroupId: Dispatch<SetStateAction<string | null>>;
  subcontractGroups: SubcontractGroup[];
  setSubcontractGroups: Dispatch<SetStateAction<SubcontractGroup[]>>;
  openSubcontractWorkers: Record<string, boolean>;
  setOpenSubcontractWorkers: Dispatch<SetStateAction<Record<string, boolean>>>;
  wasteRows: EditableRow[];
  setWasteRows: Dispatch<SetStateAction<EditableRow[]>>;
  galleryImages: GalleryImage[];
  setGalleryImages: Dispatch<SetStateAction<GalleryImage[]>>;
}

export const useWorkReportFormHandlers = ({
  setWorkforceGroups,
  setSubcontractedMachineryGroups,
  setMaterialGroups,
  setOpenMaterialGroups,
  setActiveMaterialGroupId,
  setSubcontractGroups,
  setOpenSubcontractWorkers,
  setGalleryImages,
}: UseWorkReportFormHandlersParams) => {
  // ─── Gallery ────────────────────────────────────────────────────────────────

  const handleGalleryUpload = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result !== 'string') return;
          setGalleryImages((current) => [
            ...current,
            { id: crypto.randomUUID(), name: file.name, dataUrl: reader.result as string },
          ]);
        };
        reader.readAsDataURL(file);
      });
      event.target.value = '';
    },
    [setGalleryImages],
  );

  // ─── Workforce ───────────────────────────────────────────────────────────────

  const updateWorkforceGroup = useCallback(
    (groupId: string, patch: Partial<WorkforceGroup>) => {
      setWorkforceGroups((current) =>
        current.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
      );
    },
    [setWorkforceGroups],
  );

  const updateWorkforceRow = useCallback(
    (groupId: string, rowId: string, patch: Partial<WorkforceRow>) => {
      setWorkforceGroups((current) =>
        current.map((group) => {
          if (group.id !== groupId) return group;
          const rows = group.rows.map((row) => {
            if (row.id !== rowId) return row;
            const nextHours = patch.hours ?? row.hours;
            return {
              ...row,
              ...patch,
              hours: nextHours,
              total: nextHours,
            };
          });
          return { ...group, rows };
        }),
      );
    },
    [setWorkforceGroups],
  );

  const addWorkforceGroup = useCallback(() => {
    setWorkforceGroups((current) => [...current, createWorkforceGroup()]);
  }, [setWorkforceGroups]);

  const removeWorkforceGroup = useCallback(
    (groupId: string) => {
      setWorkforceGroups((current) =>
        current.length > 1 ? current.filter((group) => group.id !== groupId) : current,
      );
    },
    [setWorkforceGroups],
  );

  const addWorkforceRow = useCallback(
    (groupId: string) => {
      setWorkforceGroups((current) =>
        current.map((group) =>
          group.id === groupId ? { ...group, rows: [...group.rows, createWorkforceRow()] } : group,
        ),
      );
    },
    [setWorkforceGroups],
  );

  const removeWorkforceRow = useCallback(
    (groupId: string, rowId: string) => {
      setWorkforceGroups((current) =>
        current.map((group) => {
          if (group.id !== groupId) return group;
          if (group.rows.length === 1) return group;
          return { ...group, rows: group.rows.filter((row) => row.id !== rowId) };
        }),
      );
    },
    [setWorkforceGroups],
  );

  // ─── Subcontracted Machinery ─────────────────────────────────────────────────

  const updateSubcontractedMachineryGroup = useCallback(
    (groupId: string, patch: Partial<SubcontractedMachineryGroup>) => {
      setSubcontractedMachineryGroups((current) =>
        current.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
      );
    },
    [setSubcontractedMachineryGroups],
  );

  const updateSubcontractedMachineryRow = useCallback(
    (groupId: string, rowId: string, patch: Partial<SubcontractedMachineryRow>) => {
      setSubcontractedMachineryGroups((current) =>
        current.map((group) => {
          if (group.id !== groupId) return group;
          const rows = group.rows.map((row) => {
            if (row.id !== rowId) return row;
            const nextHours = patch.hours ?? row.hours;
            const nextTotal = patch.total ?? nextHours;
            return {
              ...row,
              ...patch,
              hours: nextHours,
              total: nextTotal,
            };
          });
          return { ...group, rows };
        }),
      );
    },
    [setSubcontractedMachineryGroups],
  );

  const addSubcontractedMachineryGroup = useCallback(() => {
    setSubcontractedMachineryGroups((current) => [...current, createSubcontractedMachineryGroup()]);
  }, [setSubcontractedMachineryGroups]);

  const removeSubcontractedMachineryGroup = useCallback(
    (groupId: string) => {
      setSubcontractedMachineryGroups((current) =>
        current.length === 1 ? current : current.filter((group) => group.id !== groupId),
      );
    },
    [setSubcontractedMachineryGroups],
  );

  const addSubcontractedMachineryRow = useCallback(
    (groupId: string) => {
      setSubcontractedMachineryGroups((current) =>
        current.map((group) =>
          group.id === groupId
            ? { ...group, rows: [...group.rows, createSubcontractedMachineryRow()] }
            : group,
        ),
      );
    },
    [setSubcontractedMachineryGroups],
  );

  const removeSubcontractedMachineryRow = useCallback(
    (groupId: string, rowId: string) => {
      setSubcontractedMachineryGroups((current) =>
        current.map((group) => {
          if (group.id !== groupId) return group;
          if (group.rows.length === 1) return group;
          return { ...group, rows: group.rows.filter((row) => row.id !== rowId) };
        }),
      );
    },
    [setSubcontractedMachineryGroups],
  );

  const handleSubcontractedMachineryUpload = useCallback(
    (groupId: string, event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') return;
        setSubcontractedMachineryGroups((current) =>
          current.map((group) =>
            group.id === groupId ? { ...group, documentImage: reader.result as string } : group,
          ),
        );
      };
      reader.readAsDataURL(file);
      event.target.value = '';
    },
    [setSubcontractedMachineryGroups],
  );

  // ─── Materials ───────────────────────────────────────────────────────────────

  const scrollToMaterialGroup = useCallback((groupId: string) => {
    if (typeof document === 'undefined') return;
    window.setTimeout(() => {
      document.getElementById(`material-group-${groupId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }, 90);
  }, []);

  const updateMaterialGroup = useCallback(
    (groupId: string, patch: Partial<MaterialGroup>) => {
      const normalizedPatch: Partial<MaterialGroup> = { ...patch };
      if (patch.supplier !== undefined) {
        normalizedPatch.supplier = sanitizeText(patch.supplier);
      }
      if (patch.invoiceNumber !== undefined) {
        normalizedPatch.invoiceNumber = sanitizeText(patch.invoiceNumber);
      }
      setMaterialGroups((current) =>
        current.map((group) => (group.id === groupId ? { ...group, ...normalizedPatch } : group)),
      );
    },
    [setMaterialGroups],
  );

  const updateMaterialRow = useCallback(
    (groupId: string, rowId: string, patch: Partial<MaterialRow>) => {
      setMaterialGroups((current) =>
        current.map((group) => {
          if (group.id !== groupId) return group;
          const rows = group.rows.map((row) => {
            if (row.id !== rowId) return row;
            const nextQuantity = patch.quantity ?? row.quantity;
            const nextUnitPrice = patch.unitPrice ?? row.unitPrice;
            const nextTotal =
              typeof patch.total === 'number' ? patch.total : nextQuantity * nextUnitPrice;
            const hasCostInputsChanged =
              patch.quantity !== undefined || patch.unitPrice !== undefined;
            return {
              ...row,
              ...patch,
              quantity: nextQuantity,
              unitPrice: nextUnitPrice,
              total: nextTotal,
              costWarningDelta: hasCostInputsChanged
                ? null
                : (patch.costWarningDelta ?? row.costWarningDelta),
              costDocValue:
                patch.costDocValue !== undefined ? patch.costDocValue : row.costDocValue,
            };
          });
          return { ...group, rows };
        }),
      );
    },
    [setMaterialGroups],
  );

  const updateServiceLine = useCallback(
    (groupId: string, lineId: string, patch: Partial<ServiceLine>) => {
      setMaterialGroups((current) =>
        current.map((group) => {
          if (group.id !== groupId) return group;
          const serviceLines = (group.serviceLines || []).map((line) => {
            if (line.id !== lineId) return line;
            return {
              ...line,
              ...patch,
              description:
                patch.description === undefined ? line.description : sanitizeText(patch.description),
              hours:
                patch.hours === undefined
                  ? line.hours
                  : typeof patch.hours === 'number' && Number.isFinite(patch.hours)
                    ? nonNegative(patch.hours)
                    : null,
              trips:
                patch.trips === undefined
                  ? line.trips
                  : typeof patch.trips === 'number' && Number.isFinite(patch.trips)
                    ? nonNegative(patch.trips)
                    : null,
              tons:
                patch.tons === undefined
                  ? line.tons
                  : typeof patch.tons === 'number' && Number.isFinite(patch.tons)
                    ? nonNegative(patch.tons)
                    : null,
              m3:
                patch.m3 === undefined
                  ? line.m3
                  : typeof patch.m3 === 'number' && Number.isFinite(patch.m3)
                    ? nonNegative(patch.m3)
                    : null,
            };
          });
          return { ...group, serviceLines };
        }),
      );
    },
    [setMaterialGroups],
  );

  const addMaterialGroup = useCallback(() => {
    const newGroup = createMaterialGroup();
    setMaterialGroups((current) => [...current, newGroup]);
    setOpenMaterialGroups((current) => ({ ...current, [newGroup.id]: true }));
    setActiveMaterialGroupId(newGroup.id);
    scrollToMaterialGroup(newGroup.id);
  }, [setMaterialGroups, setOpenMaterialGroups, setActiveMaterialGroupId, scrollToMaterialGroup]);

  const removeMaterialGroup = useCallback(
    (groupId: string) => {
      setMaterialGroups((current) =>
        current.length === 1 ? current : current.filter((group) => group.id !== groupId),
      );
      setOpenMaterialGroups((current) => {
        if (!(groupId in current)) return current;
        const next = { ...current };
        delete next[groupId];
        return next;
      });
      setActiveMaterialGroupId((current) => (current === groupId ? null : current));
    },
    [setMaterialGroups, setOpenMaterialGroups, setActiveMaterialGroupId],
  );

  const addMaterialRow = useCallback(
    (groupId: string) => {
      setMaterialGroups((current) =>
        current.map((group) =>
          group.id === groupId
            ? { ...group, rows: [...group.rows, createMaterialRow()] }
            : group,
        ),
      );
    },
    [setMaterialGroups],
  );

  const addServiceLine = useCallback(
    (groupId: string) => {
      setMaterialGroups((current) =>
        current.map((group) =>
          group.id === groupId
            ? { ...group, serviceLines: [...(group.serviceLines || []), createServiceLine()] }
            : group,
        ),
      );
    },
    [setMaterialGroups],
  );

  const removeMaterialRow = useCallback(
    (groupId: string, rowId: string) => {
      setMaterialGroups((current) =>
        current.map((group) => {
          if (group.id !== groupId) return group;
          if (group.rows.length === 1) return group;
          return { ...group, rows: group.rows.filter((row) => row.id !== rowId) };
        }),
      );
    },
    [setMaterialGroups],
  );

  const removeServiceLine = useCallback(
    (groupId: string, lineId: string) => {
      setMaterialGroups((current) =>
        current.map((group) => {
          if (group.id !== groupId) return group;
          const serviceLines = group.serviceLines || [];
          if (serviceLines.length <= 1) return group;
          return { ...group, serviceLines: serviceLines.filter((line) => line.id !== lineId) };
        }),
      );
    },
    [setMaterialGroups],
  );

  const setMaterialGroupOpen = useCallback(
    (groupId: string, isOpen: boolean) => {
      setOpenMaterialGroups((current) => ({ ...current, [groupId]: isOpen }));
      setActiveMaterialGroupId(groupId);
    },
    [setOpenMaterialGroups, setActiveMaterialGroupId],
  );

  // ─── Subcontracts ────────────────────────────────────────────────────────────

  const updateSubcontractGroup = useCallback(
    (groupId: string, patch: Partial<SubcontractGroup>) => {
      setSubcontractGroups((current) =>
        current.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
      );
    },
    [setSubcontractGroups],
  );

  const updateSubcontractRow = useCallback(
    (groupId: string, rowId: string, patch: Partial<SubcontractRow>) => {
      setSubcontractGroups((current) =>
        current.map((group) => {
          if (group.id !== groupId) return group;
          const rows = group.rows.map((row) => {
            if (row.id !== rowId) return row;
            return {
              ...row,
              ...patch,
              unit: normalizeSubcontractUnit(patch.unit ?? row.unit),
              cantPerWorker:
                patch.cantPerWorker === undefined
                  ? row.cantPerWorker
                  : nonNegative(patch.cantPerWorker),
              hours:
                patch.hours === undefined ? row.hours : nonNegative(patch.hours),
              unitPrice:
                patch.unitPrice === undefined
                  ? row.unitPrice
                  : typeof patch.unitPrice === 'number'
                    ? nonNegative(patch.unitPrice)
                    : null,
            };
          });
          return { ...group, rows };
        }),
      );
    },
    [setSubcontractGroups],
  );

  const addSubcontractGroup = useCallback(() => {
    setSubcontractGroups((current) => [...current, createSubcontractGroup()]);
  }, [setSubcontractGroups]);

  const removeSubcontractGroup = useCallback(
    (groupId: string) => {
      setSubcontractGroups((current) =>
        current.length === 1 ? current : current.filter((group) => group.id !== groupId),
      );
    },
    [setSubcontractGroups],
  );

  const addSubcontractRow = useCallback(
    (groupId: string) => {
      const newRow = createSubcontractRow();
      setSubcontractGroups((current) =>
        current.map((group) =>
          group.id === groupId ? { ...group, rows: [...group.rows, newRow] } : group,
        ),
      );
      setOpenSubcontractWorkers((current) => ({ ...current, [newRow.id]: false }));
    },
    [setSubcontractGroups, setOpenSubcontractWorkers],
  );

  const removeSubcontractRow = useCallback(
    (groupId: string, rowId: string) => {
      setSubcontractGroups((current) =>
        current.map((group) => {
          if (group.id !== groupId) return group;
          if (group.rows.length === 1) return group;
          return { ...group, rows: group.rows.filter((row) => row.id !== rowId) };
        }),
      );
      setOpenSubcontractWorkers((current) => {
        if (!(rowId in current)) return current;
        const next = { ...current };
        delete next[rowId];
        return next;
      });
    },
    [setSubcontractGroups, setOpenSubcontractWorkers],
  );

  const addSubcontractWorker = useCallback(
    (groupId: string, rowId: string) => {
      const newWorker = createSubcontractAssignedWorker();
      setSubcontractGroups((current) =>
        current.map((group) => {
          if (group.id !== groupId) return group;
          return {
            ...group,
            rows: group.rows.map((row) =>
              row.id === rowId
                ? { ...row, workersAssigned: [...row.workersAssigned, newWorker] }
                : row,
            ),
          };
        }),
      );
      setOpenSubcontractWorkers((current) => ({ ...current, [rowId]: true }));
    },
    [setSubcontractGroups, setOpenSubcontractWorkers],
  );

  const updateSubcontractWorker = useCallback(
    (
      groupId: string,
      rowId: string,
      workerId: string,
      patch: Partial<SubcontractAssignedWorker>,
    ) => {
      setSubcontractGroups((current) =>
        current.map((group) => {
          if (group.id !== groupId) return group;
          return {
            ...group,
            rows: group.rows.map((row) => {
              if (row.id !== rowId) return row;
              return {
                ...row,
                workersAssigned: row.workersAssigned.map((worker) =>
                  worker.id === workerId
                    ? {
                        ...worker,
                        ...patch,
                        hours:
                          patch.hours === undefined
                            ? worker.hours
                            : nonNegative(patch.hours),
                      }
                    : worker,
                ),
              };
            }),
          };
        }),
      );
    },
    [setSubcontractGroups],
  );

  const removeSubcontractWorker = useCallback(
    (groupId: string, rowId: string, workerId: string) => {
      setSubcontractGroups((current) =>
        current.map((group) => {
          if (group.id !== groupId) return group;
          return {
            ...group,
            rows: group.rows.map((row) =>
              row.id === rowId
                ? {
                    ...row,
                    workersAssigned: row.workersAssigned.filter(
                      (worker) => worker.id !== workerId,
                    ),
                  }
                : row,
            ),
          };
        }),
      );
    },
    [setSubcontractGroups],
  );

  const setSubcontractWorkersOpen = useCallback(
    (rowId: string, isOpen: boolean) => {
      setOpenSubcontractWorkers((current) => ({ ...current, [rowId]: isOpen }));
    },
    [setOpenSubcontractWorkers],
  );

  const handleSubcontractUpload = useCallback(
    (groupId: string, event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') return;
        setSubcontractGroups((current) =>
          current.map((group) =>
            group.id === groupId
              ? { ...group, documentImage: reader.result as string }
              : group,
          ),
        );
      };
      reader.readAsDataURL(file);
      event.target.value = '';
    },
    [setSubcontractGroups],
  );

  return {
    // Gallery
    handleGalleryUpload,
    // Workforce
    updateWorkforceGroup,
    updateWorkforceRow,
    addWorkforceGroup,
    removeWorkforceGroup,
    addWorkforceRow,
    removeWorkforceRow,
    // Subcontracted Machinery
    updateSubcontractedMachineryGroup,
    updateSubcontractedMachineryRow,
    addSubcontractedMachineryGroup,
    removeSubcontractedMachineryGroup,
    addSubcontractedMachineryRow,
    removeSubcontractedMachineryRow,
    handleSubcontractedMachineryUpload,
    // Materials
    scrollToMaterialGroup,
    updateMaterialGroup,
    updateMaterialRow,
    updateServiceLine,
    addMaterialGroup,
    removeMaterialGroup,
    addMaterialRow,
    addServiceLine,
    removeMaterialRow,
    removeServiceLine,
    setMaterialGroupOpen,
    // Subcontracts
    updateSubcontractGroup,
    updateSubcontractRow,
    addSubcontractGroup,
    removeSubcontractGroup,
    addSubcontractRow,
    removeSubcontractRow,
    addSubcontractWorker,
    updateSubcontractWorker,
    removeSubcontractWorker,
    setSubcontractWorkersOpen,
    handleSubcontractUpload,
  };
};
