import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useWorks } from '@/hooks/useWorks';
import type { Work } from '@/types/work';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';

type WorkFormState = Pick<
  Work,
  'name' | 'number' | 'address' | 'city' | 'province' | 'country' | 'description'
>;

type ProjectsPanelProps = {
  title?: string;
  description?: string;
  createButtonLabel?: string;
  emptyMessage?: string;
};

const emptyForm: WorkFormState = {
  name: '',
  number: '',
  address: '',
  city: '',
  province: '',
  country: 'Espana',
  description: '',
};

export function ProjectsPanel({
  title = 'Obras',
  description = 'Datos de obras cargados desde la API FastAPI propia.',
  createButtonLabel = 'Nueva obra',
  emptyMessage = 'No hay obras todavia.',
}: ProjectsPanelProps) {
  const { works, loading, createWork, updateWork, deleteWork } = useWorks();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
  const [form, setForm] = useState<WorkFormState>(emptyForm);

  const sortedWorks = useMemo(() => {
    return [...works].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [works]);

  const openCreate = () => {
    setEditingWorkId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (work: Work) => {
    setEditingWorkId(work.id);
    setForm({
      name: work.name || '',
      number: work.number || '',
      address: work.address || work.street_address || '',
      city: work.city || '',
      province: work.province || '',
      country: work.country || 'Espana',
      description: work.description || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingWorkId) {
        await updateWork(editingWorkId, form);
      } else {
        await createWork(form);
      }
      setDialogOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (work: Work) => {
    const ok = window.confirm(`Eliminar la obra "${work.name}"?`);
    if (!ok) return;
    await deleteWork(work.id);
  };

  return (
    <>
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-semibold tracking-tight text-slate-800">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button className="bg-[#16365d] hover:bg-[#102a48]" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {createButtonLabel}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Cargando obras...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[200px] text-xs font-semibold text-slate-500">Numero de Obra</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500">Nombre</TableHead>
                  <TableHead className="w-[140px] text-right text-xs font-semibold text-slate-500">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedWorks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                      {emptyMessage}
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedWorks.map((work) => (
                    <TableRow key={work.id}>
                      <TableCell className="font-medium text-slate-700">{work.number || '-'}</TableCell>
                      <TableCell className="text-slate-700">{work.name || 'Sin nombre'}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(work)} aria-label="Editar obra">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(work)} aria-label="Eliminar obra">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingWorkId ? 'Editar obra' : 'Nueva obra'}</DialogTitle>
            <DialogDescription>Campos minimos: nombre (requerido) y codigo (opcional).</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="work-name">Nombre</Label>
              <Input
                id="work-name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Ej: Reforma Calle Mayor"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="work-number">Codigo</Label>
              <Input
                id="work-number"
                value={form.number}
                onChange={(e) => setForm((prev) => ({ ...prev, number: e.target.value }))}
                placeholder="Ej: OB-001"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="work-address">Direccion</Label>
              <Input
                id="work-address"
                value={form.address}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                placeholder="Calle, numero"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="work-city">Ciudad</Label>
                <Input
                  id="work-city"
                  value={form.city}
                  onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="work-province">Provincia</Label>
                <Input
                  id="work-province"
                  value={form.province}
                  onChange={(e) => setForm((prev) => ({ ...prev, province: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="work-country">Pais</Label>
                <Input
                  id="work-country"
                  value={form.country}
                  onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="work-description">Descripcion</Label>
              <Textarea
                id="work-description"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
