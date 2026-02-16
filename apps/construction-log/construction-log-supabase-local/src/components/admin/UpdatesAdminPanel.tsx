import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { 
  Upload, 
  Loader2, 
  Package, 
  Trash2, 
  Download,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Monitor,
  Globe,
  FileUp,
  Clock,
  HardDrive,
  TrendingUp
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';

interface StorageFile {
  name: string;
  size: number;
  created_at: string;
  platform: 'android' | 'windows' | 'web';
  fullPath: string;
}

interface PublishedVersion {
  id: string;
  version: string;
  platform: string;
  file_url: string | null;
  file_size: number | null;
  release_notes: string | null;
  is_mandatory: boolean | null;
  published_by: string | null;
  created_at: string | null;
}

interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

const PLATFORMS = [
  { id: 'windows', label: 'Windows', icon: Monitor, accept: '.exe,.msi', colorClass: 'text-blue-500', bgClass: 'bg-blue-500/20' },
  { id: 'android', label: 'Android', icon: Smartphone, accept: '.apk,.aab', colorClass: 'text-green-500', bgClass: 'bg-green-500/20' },
  { id: 'web', label: 'Web', icon: Globe, accept: '.zip', colorClass: 'text-purple-500', bgClass: 'bg-purple-500/20' },
] as const;

export const UpdatesAdminPanel = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('upload');
  const [storageFiles, setStorageFiles] = useState<StorageFile[]>([]);
  const [publishedVersions, setPublishedVersions] = useState<PublishedVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<typeof PLATFORMS[number]['id']>('windows');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  
  // Publish state
  const [publishing, setPublishing] = useState(false);
  const [selectedStorageFile, setSelectedStorageFile] = useState<StorageFile | null>(null);
  const [version, setVersion] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [isMandatory, setIsMandatory] = useState(false);
  
  // Delete state
  const [versionToDelete, setVersionToDelete] = useState<PublishedVersion | null>(null);
  const [fileToDelete, setFileToDelete] = useState<StorageFile | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    totalVersions: 0,
    totalStorageSize: 0,
    latestVersion: '',
    platforms: { windows: 0, android: 0, web: 0 }
  });

  const loadData = useCallback(async () => {
    try {
      await Promise.all([loadStorageFiles(), loadPublishedVersions()]);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadStorageFiles = async () => {
    const platforms = ['android', 'windows', 'web'];
    const allFiles: StorageFile[] = [];
    let totalSize = 0;

    for (const platform of platforms) {
      const { data, error } = await supabase.storage
        .from('app-updates')
        .list(platform);

      if (error) {
        console.error(`Error loading ${platform} files:`, error);
        continue;
      }

      if (data) {
        const files = data
          .filter(file => file.name !== '.emptyFolderPlaceholder')
          .map(file => {
            const size = file.metadata?.size || 0;
            totalSize += size;
            return {
              name: file.name,
              size,
              created_at: file.created_at,
              platform: platform as 'android' | 'windows' | 'web',
              fullPath: `${platform}/${file.name}`,
            };
          });
        allFiles.push(...files);
      }
    }

    setStorageFiles(allFiles.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ));
    
    setStats(prev => ({ ...prev, totalStorageSize: totalSize }));
  };

  const loadPublishedVersions = async () => {
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading versions:', error);
      return;
    }

    setPublishedVersions(data || []);
    
    // Calculate stats
    const platformCounts = { windows: 0, android: 0, web: 0 };
    data?.forEach(v => {
      if (v.platform in platformCounts) {
        platformCounts[v.platform as keyof typeof platformCounts]++;
      }
    });
    
    setStats(prev => ({
      ...prev,
      totalVersions: data?.length || 0,
      latestVersion: data?.[0]?.version || 'N/A',
      platforms: platformCounts
    }));
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
    toast({ title: 'Datos actualizados' });
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: 'Error',
        description: 'Selecciona un archivo para subir',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    setUploadProgress({ loaded: 0, total: file.size, percentage: 0 });

    try {
      const fileName = `${Date.now()}-${file.name}`;
      const filePath = `${selectedPlatform}/${fileName}`;

      // Simulate progress (Supabase doesn't provide upload progress directly)
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (!prev) return null;
          const newPercentage = Math.min(prev.percentage + 10, 90);
          return { ...prev, percentage: newPercentage, loaded: (newPercentage / 100) * prev.total };
        });
      }, 200);

      const { error } = await supabase.storage
        .from('app-updates')
        .upload(filePath, file, { upsert: true });

      clearInterval(progressInterval);

      if (error) throw error;

      setUploadProgress({ loaded: file.size, total: file.size, percentage: 100 });
      
      toast({
        title: '✅ Archivo subido',
        description: `${file.name} subido correctamente`,
      });

      setFile(null);
      await loadStorageFiles();
      
      // Switch to publish tab and pre-select the file
      setTimeout(() => {
        setActiveTab('publish');
        setUploadProgress(null);
      }, 1000);

    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: 'Error al subir',
        description: error.message || 'No se pudo subir el archivo',
        variant: 'destructive',
      });
      setUploadProgress(null);
    } finally {
      setUploading(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedStorageFile || !version) {
      toast({
        title: 'Error',
        description: 'Selecciona un archivo y especifica una versión',
        variant: 'destructive',
      });
      return;
    }

    setPublishing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No hay sesión activa');
      }

      const { error } = await supabase.functions.invoke('publish-update', {
        body: {
          version,
          platform: selectedStorageFile.platform,
          fileName: selectedStorageFile.name,
          releaseNotes,
          isMandatory,
        },
      });

      if (error) throw error;

      toast({
        title: '🎉 Actualización publicada',
        description: `v${version} para ${selectedStorageFile.platform} está disponible`,
      });

      // Reset form
      setSelectedStorageFile(null);
      setVersion('');
      setReleaseNotes('');
      setIsMandatory(false);

      await loadPublishedVersions();
      setActiveTab('versions');

    } catch (error: any) {
      console.error('Publish error:', error);
      toast({
        title: 'Error al publicar',
        description: error.message || 'No se pudo publicar la actualización',
        variant: 'destructive',
      });
    } finally {
      setPublishing(false);
    }
  };

  const handleDeleteVersion = async () => {
    if (!versionToDelete) return;
    setDeleting(true);

    try {
      const { error } = await supabase
        .from('app_versions')
        .delete()
        .eq('id', versionToDelete.id);

      if (error) throw error;

      toast({
        title: 'Versión eliminada',
        description: `v${versionToDelete.version} eliminada`,
      });

      await loadPublishedVersions();
    } catch (error) {
      console.error('Error deleting version:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la versión',
        variant: 'destructive',
      });
    } finally {
      setVersionToDelete(null);
      setDeleting(false);
    }
  };

  const handleDeleteStorageFile = async () => {
    if (!fileToDelete) return;
    setDeleting(true);

    try {
      const { error } = await supabase.storage
        .from('app-updates')
        .remove([fileToDelete.fullPath]);

      if (error) throw error;

      toast({
        title: 'Archivo eliminado',
        description: `${fileToDelete.name} eliminado del storage`,
      });

      if (selectedStorageFile?.fullPath === fileToDelete.fullPath) {
        setSelectedStorageFile(null);
      }

      await loadStorageFiles();
    } catch (error) {
      console.error('Error deleting file:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el archivo',
        variant: 'destructive',
      });
    } finally {
      setFileToDelete(null);
      setDeleting(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getPlatformConfig = (platform: string) => {
    return PLATFORMS.find(p => p.id === platform) || PLATFORMS[0];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalVersions}</p>
                <p className="text-xs text-muted-foreground">Versiones</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-blue-500/5 to-blue-500/10 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <HardDrive className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatFileSize(stats.totalStorageSize)}</p>
                <p className="text-xs text-muted-foreground">Storage usado</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-green-500/5 to-green-500/10 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <TrendingUp className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">v{stats.latestVersion}</p>
                <p className="text-xs text-muted-foreground">Última versión</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-500/5 to-purple-500/10 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Clock className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{storageFiles.length}</p>
                <p className="text-xs text-muted-foreground">Archivos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-xl">Gestión de Actualizaciones</CardTitle>
            <CardDescription>Sube, publica y gestiona versiones de la aplicación</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="upload" className="flex items-center gap-2">
                <FileUp className="h-4 w-4" />
                <span className="hidden sm:inline">Subir</span>
              </TabsTrigger>
              <TabsTrigger value="publish" className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">Publicar</span>
              </TabsTrigger>
              <TabsTrigger value="versions" className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                <span className="hidden sm:inline">Versiones</span>
              </TabsTrigger>
            </TabsList>

            {/* Upload Tab */}
            <TabsContent value="upload" className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-3 block">Plataforma</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {PLATFORMS.map((platform) => {
                      const Icon = platform.icon;
                      return (
                        <button
                          key={platform.id}
                          onClick={() => setSelectedPlatform(platform.id)}
                          className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                            selectedPlatform === platform.id
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          <div className={`p-2 rounded-lg ${platform.bgClass}`}>
                            <Icon className={`h-5 w-5 ${platform.colorClass}`} />
                          </div>
                          <span className="text-sm font-medium">{platform.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                    dragActive
                      ? 'border-primary bg-primary/5'
                      : file
                      ? 'border-green-500 bg-green-500/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <input
                    type="file"
                    accept={getPlatformConfig(selectedPlatform).accept}
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  
                  {file ? (
                    <div className="flex flex-col items-center gap-2">
                      <CheckCircle2 className="h-10 w-10 text-green-500" />
                      <p className="font-medium">{file.name}</p>
                      <p className="text-sm text-muted-foreground">{formatFileSize(file.size)}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                        }}
                      >
                        Cambiar archivo
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <FileUp className="h-10 w-10 text-muted-foreground" />
                      <p className="font-medium">Arrastra un archivo aquí</p>
                      <p className="text-sm text-muted-foreground">
                        o haz clic para seleccionar ({getPlatformConfig(selectedPlatform).accept})
                      </p>
                    </div>
                  )}
                </div>

                {uploadProgress && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Subiendo...</span>
                      <span>{uploadProgress.percentage.toFixed(0)}%</span>
                    </div>
                    <Progress value={uploadProgress.percentage} className="h-2" />
                    <p className="text-xs text-muted-foreground text-center">
                      {formatFileSize(uploadProgress.loaded)} / {formatFileSize(uploadProgress.total)}
                    </p>
                  </div>
                )}

                <Button
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  className="w-full"
                  size="lg"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Subiendo...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Subir archivo
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            {/* Publish Tab */}
            <TabsContent value="publish" className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-3 block">Seleccionar archivo del storage</Label>
                  {storageFiles.length === 0 ? (
                    <div className="text-center py-8 border rounded-xl bg-muted/30">
                      <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No hay archivos en el storage</p>
                      <Button variant="link" onClick={() => setActiveTab('upload')}>
                        Subir un archivo
                      </Button>
                    </div>
                  ) : (
                    <div className="grid gap-2 max-h-64 overflow-y-auto">
                      {storageFiles.map((storageFile) => {
                        const platformConfig = getPlatformConfig(storageFile.platform);
                        const Icon = platformConfig.icon;
                        return (
                          <div
                            key={storageFile.fullPath}
                            role="button"
                            tabIndex={0}
                            className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
                              selectedStorageFile?.fullPath === storageFile.fullPath
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/50'
                            }`}
                            onClick={() => setSelectedStorageFile(storageFile)}
                            onKeyDown={(e) => e.key === 'Enter' && setSelectedStorageFile(storageFile)}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className={`p-1.5 rounded ${platformConfig.bgClass}`}>
                                <Icon className={`h-4 w-4 ${platformConfig.colorClass}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{storageFile.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatFileSize(storageFile.size)} • {new Date(storageFile.created_at).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFileToDelete(storageFile);
                              }}
                              className="h-8 w-8 p-0"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selectedStorageFile && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="version">Versión *</Label>
                        <Input
                          id="version"
                          placeholder="2.0.7"
                          value={version}
                          onChange={(e) => setVersion(e.target.value)}
                        />
                      </div>
                      <div className="flex items-center space-x-3 pt-6">
                        <Switch
                          id="mandatory"
                          checked={isMandatory}
                          onCheckedChange={setIsMandatory}
                        />
                        <Label htmlFor="mandatory" className="cursor-pointer">
                          Actualización obligatoria
                        </Label>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="releaseNotes">Notas de la versión</Label>
                      <Textarea
                        id="releaseNotes"
                        placeholder="Describe los cambios y mejoras de esta versión..."
                        value={releaseNotes}
                        onChange={(e) => setReleaseNotes(e.target.value)}
                        rows={4}
                      />
                    </div>

                    <Button
                      onClick={handlePublish}
                      disabled={publishing || !version}
                      className="w-full"
                      size="lg"
                    >
                      {publishing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Publicando...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Publicar v{version} para {selectedStorageFile.platform}
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </TabsContent>

            {/* Versions Tab */}
            <TabsContent value="versions" className="space-y-4">
              {publishedVersions.length === 0 ? (
                <div className="text-center py-12 border rounded-xl bg-muted/30">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium">No hay versiones publicadas</p>
                  <p className="text-sm text-muted-foreground">Sube y publica tu primera versión</p>
                </div>
              ) : (
                <div className="rounded-xl border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Versión</TableHead>
                        <TableHead>Plataforma</TableHead>
                        <TableHead className="hidden md:table-cell">Tamaño</TableHead>
                        <TableHead className="hidden sm:table-cell">Estado</TableHead>
                        <TableHead className="hidden lg:table-cell">Fecha</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {publishedVersions.map((ver) => {
                        const platformConfig = getPlatformConfig(ver.platform);
                        const Icon = platformConfig.icon;
                        return (
                          <TableRow key={ver.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <span>v{ver.version}</span>
                                {ver.release_notes && (
                                  <Badge variant="outline" className="text-xs">
                                    📝
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Icon className={`h-4 w-4 ${platformConfig.colorClass}`} />
                                <span className="hidden sm:inline">{platformConfig.label}</span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-muted-foreground">
                              {ver.file_size ? formatFileSize(ver.file_size) : 'N/A'}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              {ver.is_mandatory ? (
                                <Badge variant="destructive" className="text-xs">Obligatoria</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">Opcional</Badge>
                              )}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                              {ver.created_at ? new Date(ver.created_at).toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric'
                              }) : 'N/A'}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {ver.file_url && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => window.open(ver.file_url!, '_blank')}
                                    className="h-8 w-8 p-0"
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setVersionToDelete(ver)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Delete Version Dialog */}
      <AlertDialog open={!!versionToDelete} onOpenChange={(open) => !open && setVersionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar versión?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la versión <strong>v{versionToDelete?.version}</strong> de{' '}
              <strong>{versionToDelete?.platform}</strong>. Los usuarios ya no podrán ver esta actualización.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteVersion} 
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Storage File Dialog */}
      <AlertDialog open={!!fileToDelete} onOpenChange={(open) => !open && setFileToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar archivo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente <strong>{fileToDelete?.name}</strong> del storage.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteStorageFile} 
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
