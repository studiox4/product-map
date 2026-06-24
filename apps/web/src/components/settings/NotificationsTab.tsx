import type { NotificationPrefs } from '@productmap/shared';
import { useNotificationPrefs, useUpdateNotificationPref } from '@/lib/api';

const ROWS: { kind: keyof NotificationPrefs; label: string }[] = [
  { kind: 'mention', label: 'When someone @mentions me' },
  { kind: 'comment', label: 'Comments on my work' },
  { kind: 'reply', label: 'Replies to my threads' },
  { kind: 'project_invite', label: 'Project invites' },
];

export function NotificationsTab() {
  const { data: prefs } = useNotificationPrefs();
  const update = useUpdateNotificationPref();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">In-app notifications</h2>
      <ul className="space-y-3">
        {ROWS.map(({ kind, label }) => {
          const enabled = prefs?.[kind] ?? true;
          return (
            <li key={kind} className="flex items-center justify-between">
              <label htmlFor={`notif-${kind}`} className="text-sm">{label}</label>
              <input
                id={`notif-${kind}`}
                type="checkbox"
                aria-label={label}
                checked={enabled}
                onChange={(e) => update.mutate({ kind, enabled: e.target.checked })}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default NotificationsTab;
