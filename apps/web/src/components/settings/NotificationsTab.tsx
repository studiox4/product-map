import { NOTIFICATION_KINDS, type NotificationKind, type NotificationPrefs } from '@productmap/shared';
import { useNotificationPrefs, useUpdateNotificationPref } from '@/lib/api';

const ROWS: Record<NotificationKind, string> = {
  mention: 'When someone @mentions me',
  comment: 'Comments on my work',
  reply: 'Replies to my threads',
  project_invite: 'Project invites',
};

export function NotificationsTab() {
  const { data: prefs } = useNotificationPrefs();
  const update = useUpdateNotificationPref();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">In-app notifications</h2>
      <ul className="space-y-3">
        {NOTIFICATION_KINDS.map((kind) => {
          const label = ROWS[kind];
          const enabled = (prefs as NotificationPrefs | undefined)?.[kind] ?? true;
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
