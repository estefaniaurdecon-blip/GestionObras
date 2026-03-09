import { useState, useEffect } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  createWorkReportComment,
  listWorkReportComments,
  type ApiWorkReportComment,
} from '@/integrations/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface WorkReportComment {
  id: string;
  work_report_id: string;
  user_id: string;
  comment: string;
  created_at: string;
  user: {
    full_name: string;
  };
}

interface WorkReportCommentsProps {
  workReportId: string;
}

const mapComment = (comment: ApiWorkReportComment): WorkReportComment => ({
  id: String(comment.id),
  work_report_id: comment.work_report_id,
  user_id: String(comment.user_id),
  comment: comment.comment,
  created_at: comment.created_at,
  user: {
    full_name: comment.user?.full_name || 'Usuario',
  },
});

export const WorkReportComments = ({ workReportId }: WorkReportCommentsProps) => {
  const [comments, setComments] = useState<WorkReportComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const { user } = useAuth();

  const loadComments = async () => {
    try {
      const data = await listWorkReportComments(workReportId);
      setComments((data || []).map(mapComment));
    } catch (error: unknown) {
      console.error('Error loading comments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const run = async () => {
      if (!mounted) return;
      await loadComments();
    };

    void run();
    intervalId = setInterval(() => {
      void run();
    }, 10000);

    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [workReportId]);

  const handleSendComment = async () => {
    if (!user || !newComment.trim()) return;

    setSending(true);
    try {
      await createWorkReportComment(workReportId, {
        comment: newComment.trim(),
      });

      setNewComment('');
      await loadComments();
      toast({
        title: 'Comentario agregado',
        description: 'Tu comentario ha sido publicado.',
      });
    } catch (error: unknown) {
      console.error('Error sending comment:', error);
      const message = error instanceof Error ? error.message : 'No se pudo publicar el comentario';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          Comentarios
        </CardTitle>
        <CardDescription>
          Comparte informacion o preguntas sobre este parte
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Comments list */}
        <ScrollArea className="h-64 pr-4">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No hay comentarios aun</p>
              <p className="text-sm text-muted-foreground">Se el primero en comentar</p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="border-l-2 border-primary pl-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm">{comment.user.full_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(comment.created_at), {
                        addSuffix: true,
                        locale: es,
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{comment.comment}</p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* New comment form */}
        <div className="space-y-2">
          <Textarea
            placeholder="Escribe un comentario..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            rows={3}
          />
          <Button
            onClick={handleSendComment}
            disabled={!newComment.trim() || sending}
            className="w-full"
          >
            <Send className="h-4 w-4 mr-2" />
            Publicar comentario
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
