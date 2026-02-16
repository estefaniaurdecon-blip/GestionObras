import { AlertCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ApiTenant } from '@/integrations/api/client';

type TenantPickerProps = {
  tenants: ApiTenant[];
  selectedTenantId: string;
  loading: boolean;
  submitting: boolean;
  error: string | null;
  onSelectTenant: (tenantId: string) => void;
  onContinue: () => void;
  onRetry: () => void;
  onLogout: () => void;
};

export function TenantPicker({
  tenants,
  selectedTenantId,
  loading,
  submitting,
  error,
  onSelectTenant,
  onContinue,
  onRetry,
  onLogout,
}: TenantPickerProps) {
  const hasTenants = tenants.length > 0;
  const canContinue = hasTenants && selectedTenantId.length > 0 && !loading && !submitting;

  return (
    <Card className="bg-white">
      <CardHeader>
        <CardTitle>Seleccionar tenant activo</CardTitle>
        <CardDescription>Este usuario no tiene tenant fijo. Selecciona uno para continuar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Tenant no resuelto</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {!hasTenants && !loading ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Sin tenants disponibles</AlertTitle>
            <AlertDescription>No hay tenants asignados para este usuario.</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="tenant-picker-select">
            Tenant
          </label>
          <Select value={selectedTenantId} onValueChange={onSelectTenant} disabled={loading || submitting || !hasTenants}>
            <SelectTrigger id="tenant-picker-select">
              <SelectValue placeholder={loading ? 'Cargando tenants...' : 'Selecciona un tenant'} />
            </SelectTrigger>
            <SelectContent>
              {tenants.map((tenant) => (
                <SelectItem key={tenant.id} value={String(tenant.id)}>
                  {tenant.name} ({tenant.subdomain})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onContinue} disabled={!canContinue}>
            {submitting ? 'Aplicando...' : 'Continuar'}
          </Button>
          <Button variant="outline" onClick={onRetry} disabled={loading || submitting}>
            Reintentar
          </Button>
          <Button variant="ghost" onClick={onLogout} disabled={submitting}>
            Cerrar sesión
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
