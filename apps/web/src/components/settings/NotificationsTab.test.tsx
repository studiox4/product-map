import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationsTab } from './NotificationsTab';

const update = vi.fn();
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  useNotificationPrefs: () => ({ data: { mention: true, comment: true, reply: true, project_invite: true } }),
  useUpdateNotificationPref: () => ({ mutate: update }),
}));

describe('NotificationsTab', () => {
  it('toggles a preference off', async () => {
    render(<NotificationsTab />);
    const mention = screen.getByLabelText(/mention/i);
    await userEvent.click(mention);
    expect(update).toHaveBeenCalledWith({ kind: 'mention', enabled: false });
  });
});
