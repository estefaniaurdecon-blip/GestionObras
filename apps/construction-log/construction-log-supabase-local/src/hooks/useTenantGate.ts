import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import {
  listTenants,
  type ApiTenant,
  type ApiUser,
} from '@/integrations/api/client';
import {
  TENANT_REQUIRED_MESSAGE,
  getTenantResolutionState,
  setActiveTenantId as persistActiveTenantId,
} from '@/offline-db/tenantScope';
import { startupPerfEnd, startupPerfStart } from '@/utils/startupPerf';

export type TenantGateStatus = 'loading' | 'resolved' | 'picker' | 'error';

type UseTenantGateResult = {
  tenantGateStatus: TenantGateStatus;
  resolvedTenantId: string | null;
  tenantPickerOptions: ApiTenant[];
  tenantPickerSelection: string;
  tenantPickerLoading: boolean;
  tenantPickerSubmitting: boolean;
  tenantResolutionMessage: string | null;
  tenantResolving: boolean;
  tenantResolved: boolean;
  tenantUnavailable: boolean;
  tenantNeedsPicker: boolean;
  tenantErrorMessage: string;
  tenantPickerErrorMessage: string | null;
  setTenantPickerSelection: Dispatch<SetStateAction<string>>;
  handleRetryTenantResolution: () => void;
  handleConfirmTenantSelection: () => Promise<void>;
};

export const useTenantGate = (user: ApiUser | null): UseTenantGateResult => {
  const [tenantGateStatus, setTenantGateStatus] = useState<TenantGateStatus>('loading');
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(null);
  const [tenantPickerOptions, setTenantPickerOptions] = useState<ApiTenant[]>([]);
  const [tenantPickerSelection, setTenantPickerSelection] = useState('');
  const [tenantPickerLoading, setTenantPickerLoading] = useState(false);
  const [tenantPickerSubmitting, setTenantPickerSubmitting] = useState(false);
  const [tenantResolutionMessage, setTenantResolutionMessage] = useState<string | null>(null);

  const resolveTenantGate = useCallback(async () => {
    startupPerfStart('hook:useTenantGate.resolveTenantGate');
    if (!user) {
      setTenantGateStatus('loading');
      setResolvedTenantId(null);
      setTenantPickerOptions([]);
      setTenantPickerSelection('');
      setTenantResolutionMessage(null);
      startupPerfEnd('hook:useTenantGate.resolveTenantGate', 'no-user');
      return;
    }

    setTenantGateStatus('loading');
    setTenantResolutionMessage(null);

    try {
      startupPerfStart('hook:useTenantGate.getTenantResolutionState');
      const resolution = await getTenantResolutionState(user);
      startupPerfEnd('hook:useTenantGate.getTenantResolutionState');

      if (resolution.isResolved && resolution.tenantId) {
        setResolvedTenantId(resolution.tenantId);
        setTenantGateStatus('resolved');
        setTenantPickerOptions([]);
        setTenantPickerSelection('');
        setTenantResolutionMessage(null);
        startupPerfEnd('hook:useTenantGate.resolveTenantGate', 'resolved-direct');
        return;
      }

      setResolvedTenantId(null);

      if (resolution.requiresTenantPicker) {
        setTenantGateStatus('picker');
        setTenantPickerLoading(true);

        try {
          startupPerfStart('hook:useTenantGate.listTenants');
          const tenants = await listTenants();
          startupPerfEnd('hook:useTenantGate.listTenants', `count=${tenants.length}`);
          const activeTenants = tenants.filter((tenant) => tenant.is_active !== false);
          setTenantPickerOptions(activeTenants);
          setTenantPickerSelection((previous) => {
            if (previous && activeTenants.some((tenant) => String(tenant.id) === previous)) {
              return previous;
            }
            return activeTenants.length > 0 ? String(activeTenants[0].id) : '';
          });
          setTenantResolutionMessage(
            activeTenants.length > 0 ? null : 'No hay tenants accesibles para este usuario.',
          );
        } catch (pickerError) {
          console.error('[TenantPicker] Error loading tenants:', pickerError);
          startupPerfEnd('hook:useTenantGate.listTenants', 'error');
          setTenantPickerOptions([]);
          setTenantPickerSelection('');
          setTenantResolutionMessage('No se pudieron cargar tenants. Reintenta o vuelve a iniciar sesión.');
        } finally {
          setTenantPickerLoading(false);
        }

        startupPerfEnd('hook:useTenantGate.resolveTenantGate', 'requires-picker');
        return;
      }

      setTenantGateStatus('error');
      setTenantPickerOptions([]);
      setTenantPickerSelection('');
      setTenantResolutionMessage(resolution.errorMessage ?? TENANT_REQUIRED_MESSAGE);
      startupPerfEnd('hook:useTenantGate.resolveTenantGate', 'unresolved');
    } catch (resolutionError) {
      console.error('[TenantScope] Error resolving tenant:', resolutionError);
      setTenantGateStatus('error');
      setResolvedTenantId(null);
      setTenantPickerOptions([]);
      setTenantPickerSelection('');
      setTenantResolutionMessage(TENANT_REQUIRED_MESSAGE);
      startupPerfEnd('hook:useTenantGate.resolveTenantGate', 'error');
    }
  }, [user]);

  const handleRetryTenantResolution = useCallback(() => {
    void resolveTenantGate();
  }, [resolveTenantGate]);

  const handleConfirmTenantSelection = useCallback(async () => {
    if (!user) return;
    if (!tenantPickerSelection) {
      setTenantResolutionMessage('Selecciona un tenant para continuar.');
      return;
    }

    setTenantPickerSubmitting(true);
    try {
      const tenantId = await persistActiveTenantId(user, tenantPickerSelection);
      setResolvedTenantId(tenantId);
      setTenantGateStatus('resolved');
      setTenantResolutionMessage(null);
    } catch (error) {
      console.error('[TenantPicker] Error selecting tenant:', error);
      setTenantResolutionMessage('No se pudo guardar el tenant activo. Reintenta.');
    } finally {
      setTenantPickerSubmitting(false);
    }
  }, [tenantPickerSelection, user]);

  useEffect(() => {
    void resolveTenantGate();
  }, [resolveTenantGate]);

  const tenantResolving = tenantGateStatus === 'loading';
  const tenantResolved = tenantGateStatus === 'resolved' && Boolean(resolvedTenantId);
  const tenantUnavailable = !tenantResolved;
  const tenantNeedsPicker = tenantGateStatus === 'picker';
  const tenantErrorMessage = tenantResolutionMessage ?? TENANT_REQUIRED_MESSAGE;
  const tenantPickerErrorMessage = tenantResolutionMessage;

  return {
    tenantGateStatus,
    resolvedTenantId,
    tenantPickerOptions,
    tenantPickerSelection,
    tenantPickerLoading,
    tenantPickerSubmitting,
    tenantResolutionMessage,
    tenantResolving,
    tenantResolved,
    tenantUnavailable,
    tenantNeedsPicker,
    tenantErrorMessage,
    tenantPickerErrorMessage,
    setTenantPickerSelection,
    handleRetryTenantResolution,
    handleConfirmTenantSelection,
  };
};
