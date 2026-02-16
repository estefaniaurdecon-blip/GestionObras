import { useState, useEffect } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
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

export const WorkReportComments = ({ workReportId }: WorkReportCommentsProps) => {
  const [comments, setComments] = useState<WorkReportComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const { user } = useAuth();

  const loadComments = async () => {
    try {
      const { data, error } = await supabase
        .from('work_report_comments')
        .select(`
          *,
          user:profiles(full_name)
        `)
        .eq('work_report_id', workReportId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (data) {
        setComments(data as any);
      }
    } catch (error: any) {
      console.error('Error loading comments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComments();

    // Subscribe to realtime comments
    const channel = supabase
      .channel(`comments-${workReportId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'work_report_comments',
          filter: `work_report_id=eq.${workReportId}`
        },
        async (payload) => {
          // Fetch user details for new comment
          const { data: userData } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', payload.new.user_id)
            .single();

          const newCommentData = {
            ...payload.new,
            user: userData
          } as any;

          setComments(prev => [...prev, newCommentData]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workReportId]);

  const handleSendComment = async () => {
    if (!user || !newComment.trim()) return;

    setSending(true);
    try {
      const { error } = await supabase
        .from('work_report_comments')
        .insert({
          work_report_id: workReportId,
          user_id: user.id,
          comment: newComment.trim()
        });

      if (error) throw error;

      setNewComment('');
      toast({
        title: "Comentario agregado",
        description: "Tu comentario ha sido publicado.",
      });
    } catch (error: any) {
      console.error('Error sending comment:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
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
          Comparte información o preguntas sobre este parte
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
              <p className="text-muted-foreground">No hay comentarios aún</p>
              <p className="text-sm text-muted-foreground">Sé el primero en comentar</p>
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
                        locale: es
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
