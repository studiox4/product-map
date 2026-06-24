import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useUnreadCount } from '@/lib/api';
import { NotificationPanel } from './NotificationPanel';

export function NotificationBell() {
  const { data } = useUnreadCount();
  const count = data?.count ?? 0;
  const [open, setOpen] = useState(false);
  const prev = useRef<number | null>(null);

  // Toast when the unread count increases between polls (not on first load).
  useEffect(() => {
    if (prev.current !== null && count > prev.current) {
      toast('You have a new notification');
    }
    prev.current = count;
  }, [count]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label="Notifications"
        className="relative flex items-center rounded-full px-3 py-1.5 text-muted-ink outline-none transition-colors hover:bg-surface/60 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="p-0">
        <NotificationPanel onNavigate={() => setOpen(false)} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
