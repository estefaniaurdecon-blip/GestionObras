import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Upload, CheckCircle2, AlertCircle, File, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UploadFile {
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'success' | 'error';
  type?: string;
  error?: string;
}

interface UploadProgressProps {
  files: UploadFile[];
  className?: string;
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

export const UploadProgress: React.FC<UploadProgressProps> = ({ files, className }) => {
  if (files.length === 0) return null;

  return (
    <Card className={cn('animate-fade-in', className)}>
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Upload className="h-4 w-4 text-primary" />
          <span>
            Subiendo archivos ({files.filter(f => f.status === 'success').length}/{files.length})
          </span>
        </div>

        <div className="space-y-3">
          {files.map((file, index) => {
            const isImage = file.type?.startsWith('image/');
            
            return (
              <div
                key={index}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border transition-all duration-300',
                  file.status === 'uploading' && 'bg-accent/30 animate-pulse',
                  file.status === 'success' && 'bg-green-50 dark:bg-green-950/20 animate-scale-in',
                  file.status === 'error' && 'bg-destructive/10'
                )}
              >
                {/* Ícono de archivo */}
                <div className={cn(
                  'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
                  file.status === 'uploading' && 'bg-primary/10',
                  file.status === 'success' && 'bg-green-500/20',
                  file.status === 'error' && 'bg-destructive/20'
                )}>
                  {isImage ? (
                    <ImageIcon className={cn(
                      'h-5 w-5',
                      file.status === 'uploading' && 'text-primary',
                      file.status === 'success' && 'text-green-600',
                      file.status === 'error' && 'text-destructive'
                    )} />
                  ) : (
                    <File className={cn(
                      'h-5 w-5',
                      file.status === 'uploading' && 'text-primary',
                      file.status === 'success' && 'text-green-600',
                      file.status === 'error' && 'text-destructive'
                    )} />
                  )}
                </div>

                {/* Información del archivo */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-medium truncate">
                      {file.name}
                    </p>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {formatFileSize(file.size)}
                    </span>
                  </div>

                  {file.status === 'uploading' && (
                    <div className="space-y-1">
                      <Progress value={file.progress} className="h-1.5" />
                      <p className="text-xs text-muted-foreground">
                        {Math.round(file.progress)}% completado
                      </p>
                    </div>
                  )}

                  {file.status === 'success' && (
                    <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Subida completada
                    </p>
                  )}

                  {file.status === 'error' && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {file.error || 'Error al subir'}
                    </p>
                  )}
                </div>

                {/* Estado final */}
                {file.status === 'success' && (
                  <div className="flex-shrink-0 animate-scale-in">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                )}
                {file.status === 'error' && (
                  <div className="flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
