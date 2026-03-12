import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ProjectsPanel } from '@/components/ProjectsPanel';
import { useAuth } from '@/contexts/AuthContext';
import { useWorks } from '@/hooks/useWorks';
import { ArrowLeft, Loader2, LogOut, RefreshCw } from 'lucide-react';

export default function Projects() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { loading, loadWorks } = useWorks();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-blue-700 text-white shadow-sm border-b border-blue-800">
        <div className="mx-auto max-w-5xl px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Obras / Projects</h1>
            <p className="text-sm text-blue-100">{user?.email ? `Sesion: ${user.email}` : 'Sesion activa'}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
            <Button variant="secondary" onClick={() => loadWorks()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Recargar
            </Button>
            <Button variant="secondary" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 space-y-4">
        <ProjectsPanel title="Listado" />
      </main>
    </div>
  );
}
