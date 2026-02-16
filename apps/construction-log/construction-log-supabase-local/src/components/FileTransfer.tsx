import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Send, Trash2, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useSharedFiles } from "@/hooks/useSharedFiles";
import { useUsers } from "@/hooks/useUsers";
import { useUserPresence } from "@/hooks/useUserPresence";
import { useAuth } from "@/contexts/AuthContext";
import { Directory } from "@capacitor/filesystem";
import { isNative } from "@/utils/nativeFile";

export const FileTransfer = () => {
  const { user } = useAuth();
  const { sentFiles, receivedFiles, loading, shareFile, downloadFile, deleteFile } = useSharedFiles();
  const { users } = useUsers();
  const { isUserOnline } = useUserPresence();

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [message, setMessage] = useState("");
  const [downDir, setDownDir] = useState<Directory>(Directory.Documents);
  const [customFolder, setCustomFolder] = useState("");
  const [sending, setSending] = useState(false);

  // Allow external triggers to open the drawer
  useEffect(() => {
    const openHandler = () => setOpen(true);
    document.addEventListener('open-file-transfer', openHandler as EventListener);
    return () => document.removeEventListener('open-file-transfer', openHandler as EventListener);
  }, []);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      const prev = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      return () => {
        document.documentElement.style.overflow = prev;
      };
    }
  }, [open]);

  const unread = useMemo(() => receivedFiles.filter((f) => !f.downloaded).length, [receivedFiles]);

  const handleShare = async () => {
    if (!file || !selectedUser) return;
    setSending(true);
    await shareFile(file, selectedUser, message || undefined);
    setSending(false);
    setFile(null);
    setSelectedUser("");
    setMessage("");
  };

  const formatSize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        onClick={() => setOpen(true)}
        className="relative h-9 w-9 text-primary-foreground hover:bg-primary-foreground/20"
        title="Archivos"
      >
        <FileText className="h-4 w-4" />
        {unread > 0 && (
          <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center">{unread}</Badge>
        )}
      </Button>

      <DrawerContent className="mt-0 md:mt-0 h-[100svh] max-h-[100svh] flex flex-col overflow-x-hidden overflow-y-hidden">
        <DrawerHeader className="pb-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DrawerTitle>Compartir archivos</DrawerTitle>
              <DrawerDescription>Envía y recibe documentos con tu equipo</DrawerDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              className="h-8 w-8"
              title="Cerrar"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DrawerHeader>

        {/* Send Section - Outside ScrollArea */}
        <div className="px-4 pb-3 flex-shrink-0 border-b">
          <div className="border rounded-lg">
            <div className="p-3 border-b font-medium bg-muted/50">Enviar archivo</div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Seleccionar archivo</label>
                <Input 
                  type="file" 
                  accept=".pdf,.xlsx,.xls,.doc,.docx,.jpg,.jpeg,.png" 
                  onChange={(e) => setFile(e.target.files?.[0] || null)} 
                />
                {file && (
                  <p className="text-xs text-muted-foreground">
                    📎 {file.name} ({formatSize(file.size)})
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Destinatario</label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un usuario" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.filter((u) => u.id !== user?.id).map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${isUserOnline(u.id) ? "bg-green-500" : "bg-muted-foreground"}`} />
                          <span>{u.full_name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium block">Mensaje (opcional)</label>
                <Textarea 
                  placeholder="Escribe un mensaje aquí..." 
                  value={message} 
                  onChange={(e) => setMessage(e.target.value)} 
                  rows={3}
                  className="w-full min-h-[80px] border-2"
                />
              </div>

              {isNative() && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Configuración de descarga</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Select value={downDir} onValueChange={(v) => setDownDir(v as Directory)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Carpeta de descarga" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={Directory.Documents}>Documentos</SelectItem>
                        <SelectItem value={Directory.Data}>Datos de la app</SelectItem>
                        <SelectItem value={Directory.Cache}>Caché</SelectItem>
                        <SelectItem value={Directory.External}>Almacenamiento externo</SelectItem>
                        <SelectItem value={Directory.ExternalStorage}>Almacenamiento público</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input placeholder="Carpeta personalizada" value={customFolder} onChange={(e) => setCustomFolder(e.target.value)} />
                  </div>
                </div>
              )}
              
              <Button 
                onClick={handleShare} 
                disabled={!file || !selectedUser || sending} 
                className="w-full"
                size="lg"
              >
                <Send className="h-4 w-4 mr-2" /> 
                {sending ? "Enviando..." : "Enviar archivo"}
              </Button>
            </div>
          </div>
        </div>

        {/* Scrollable Section for Received and Sent Files */}
        <div className="flex-1 px-4 pb-4 overflow-y-auto overflow-x-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3">
            {/* Received Files */}
            <div className="border rounded-lg">
              <div className="p-3 border-b font-medium bg-muted/50">
                Archivos recibidos {unread > 0 && <Badge className="ml-2">{unread}</Badge>}
              </div>
              <div className="max-h-[250px] overflow-y-auto">
                <div className="p-2 space-y-2">
                  {loading && <div className="text-sm text-muted-foreground p-3">Cargando...</div>}
                  {!loading && receivedFiles.length === 0 && (
                    <div className="text-sm text-muted-foreground p-3">No hay archivos recibidos</div>
                  )}
                  {receivedFiles.map((f) => (
                    <div key={f.id} className="border rounded-md p-3">
                      <div className="flex items-start gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{f.file_name}</span>
                            {!f.downloaded && <Badge>Nuevo</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">De: {f.from_user?.full_name}</p>
                          {f.message && <p className="text-xs mt-1 break-words italic">&quot;{f.message}&quot;</p>}
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                            <span>{formatSize(f.file_size || 0)}</span>
                            <span>
                              {formatDistanceToNow(new Date(f.created_at), { addSuffix: true, locale: es }).replace("hace ", "")}
                            </span>
                          </div>
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" onClick={() => downloadFile(f, isNative() ? downDir : undefined, customFolder || undefined)}>
                              <Download className="h-4 w-4 mr-1" /> Descargar
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => deleteFile(f.id, f.file_path)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sent Files */}
            <div className="border rounded-lg">
              <div className="p-3 border-b font-medium bg-muted/50">Archivos enviados</div>
              <div className="max-h-[250px] overflow-y-auto">
                <div className="p-2 space-y-2">
                  {loading && <div className="text-sm text-muted-foreground p-3">Cargando...</div>}
                  {!loading && sentFiles.length === 0 && (
                    <div className="text-sm text-muted-foreground p-3">Aún no has enviado archivos</div>
                  )}
                  {sentFiles.map((f) => (
                    <div key={f.id} className="border rounded-md p-3">
                      <div className="flex items-start gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{f.file_name}</span>
                            {f.downloaded ? (
                              <Badge variant="outline" className="text-green-600 border-green-600">Recibido</Badge>
                            ) : (
                              <Badge variant="outline">Pendiente</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">Para: {f.to_user?.full_name}</p>
                          {f.message && <p className="text-xs mt-1 break-words italic">&quot;{f.message}&quot;</p>}
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                            <span>{formatSize(f.file_size || 0)}</span>
                            <span>
                              {formatDistanceToNow(new Date(f.created_at), { addSuffix: true, locale: es }).replace("hace ", "")}
                            </span>
                          </div>
                          <div className="mt-2">
                            <Button size="sm" variant="destructive" onClick={() => deleteFile(f.id, f.file_path)}>
                              <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};