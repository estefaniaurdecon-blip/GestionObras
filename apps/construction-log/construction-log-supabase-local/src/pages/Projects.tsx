import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useWorks } from '@/hooks/useWorks';
import type { Work } from '@/types/work';
import { ArrowLeft, Loader2, LogOut, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';

type WorkFormState = Pick<
  Work,
  'name' | 'number' | 'address' | 'city' | 'province' | 'country' | 'description'
>;

const emptyForm: WorkFormState = {
  name: '',
  number: '',
  address: '',
  city: '',
  province: '',
  country: 'Espana',
  description: '',
};

export default function Projects() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { works, loading, loadWorks, createWork, updateWork, deleteWork } = useWorks();
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
    <div className="min-h-screen bg-slate-50">
      <header className="bg-blue-700 text-white shadow-sm border-b border-blue-800">
        <div className="mx-auto max-w-5xl px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Obras / Projects</h1>
            <p className="text-sm text-blue-100">{user?.email ? `Sesion: ${user.email}` : 'Sesion activa'}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Dashboard
            </Button>
            <Button variant="secondary" onClick={() => loadWorks()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Recargar
            </Button>
            <Button variant="secondary" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 space-y-4">
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle>Listado</CardTitle>
              <CardDescription>Datos de obras cargados desde la API FastAPI propia.</CardDescription>
            </div>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva obra
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-10 text-sm text-muted-foreground flex items-center justify-center">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Cargando obras...
              </div>
            ) : sortedWorks.length === 0 ? (
              <div className="py-10 text-sm text-muted-foreground text-center">No hay obras todavia.</div>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Codigo</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="hidden md:table-cell">Ciudad</TableHead>
                      <TableHead className="w-[120px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedWorks.map((w) => (
                      <TableRow key={w.id}>
                        <TableCell className="font-mono text-xs">{w.number}</TableCell>
                        <TableCell className="font-medium">{w.name}</TableCell>
                        <TableCell className="hidden md:table-cell">{w.city || '-'}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(w)} aria-label="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(w)} aria-label="Eliminar">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
