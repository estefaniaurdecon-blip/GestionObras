import { useState } from 'react';
import { MoreVertical, Languages, MessageSquare, Calendar, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LanguageSelector } from './LanguageSelector';
import { useNavigate } from 'react-router-dom';

interface MobileActionsMenuProps {
  onOpenCalendar?: () => void;
}

export const MobileActionsMenu = ({ onOpenCalendar }: MobileActionsMenuProps) => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground rounded-md"
          title="Más opciones"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="w-auto bg-background border border-border shadow-lg z-[100] p-0"
      >
        <div className="flex flex-col gap-0.5 p-1">
          {/* Radar de Obras */}
          <button
            className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent rounded-md text-left"
            onClick={() => { navigate('/radar'); setOpen(false); }}
          >
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span>Radar de Obras</span>
          </button>

          {/* Language Selector */}
          <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent rounded-md" onClick={() => setOpen(false)}>
            <Languages className="h-4 w-4 text-muted-foreground" />
            <LanguageSelector />
          </div>
          
          {/* Chat Center */}
          <button
            className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent rounded-md text-left"
            onClick={() => { document.dispatchEvent(new Event('open-chat-center')); setOpen(false); }}
          >
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span>Chat</span>
          </button>
          
          {/* Calendar Tasks */}
          {onOpenCalendar && (
            <button
              className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent rounded-md text-left"
              onClick={() => { onOpenCalendar(); setOpen(false); }}
            >
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Calendario</span>
            </button>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
