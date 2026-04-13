import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Work } from '@/types/work';

interface AssignableUser {
  id: string;
  full_name: string;
}

interface WorkAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  work: Work | null;
  assignableUsers: AssignableUser[];
  assignedUserIds: string[];
  loading: boolean;
  onToggleUser: (userId: string) => void;
  onClose: () => void;
}

export function WorkAssignDialog({
  open,
  onOpenChange,
  work,
  assignableUsers,
  assignedUserIds,
  loading,
  onToggleUser,
  onClose,
}: WorkAssignDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Asignar Usuarios a la Obra</DialogTitle>
          <DialogDescription>
            {work && `${work.number} - ${work.name}`}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {assignableUsers.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  No hay usuarios disponibles para asignar
                </p>
              ) : (
                assignableUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center space-x-2 p-2 hover:bg-accent rounded-md"
                  >
                    <Checkbox
                      id={user.id}
                      checked={assignedUserIds.includes(user.id)}
                      onCheckedChange={() => onToggleUser(user.id)}
                    />
                    <label htmlFor={user.id} className="flex-1 cursor-pointer text-sm">
                      {user.full_name}
                    </label>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
