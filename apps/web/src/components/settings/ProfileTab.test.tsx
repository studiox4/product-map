import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { USER_COLORS, type User } from '@productmap/shared';
import ProfileTab from './ProfileTab';

// Node's experimental webstorage shadows jsdom's localStorage in this env
// (methods are undefined) — install a working in-memory Storage.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}
Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
});

const ada: User = {
  id: 'u1',
  name: 'Ada Lovelace',
  color: USER_COLORS[0],
  role: 'member',
  createdAt: '2026-06-09T00:00:00Z',
};

let userPatch: unknown = null;
let changePasswordBody: unknown = null;

const server = setupServer(
  http.get('/api/auth/me', () => HttpResponse.json(ada)),
  http.patch('/api/users/:id', async ({ request, params }) => {
    userPatch = { id: params.id, body: await request.json() };
    const body = (userPatch as { body: Record<string, unknown> }).body;
    return HttpResponse.json({ ...ada, ...body });
  }),
  http.post('/api/auth/change-password', async ({ request }) => {
    changePasswordBody = await request.json();
    return HttpResponse.json(ada);
  }),
  http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  userPatch = null;
  changePasswordBody = null;
  localStorage.clear();
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProfileTab />
    </QueryClientProvider>,
  );
}

describe('ProfileTab', () => {
  it('shows my name, a live avatar preview, and saves a rename', async () => {
    renderTab();
    const name = await screen.findByRole('textbox', { name: 'Your name' });
    expect((name as HTMLInputElement).value).toBe('Ada Lovelace');

    // Live preview: initials update as the draft changes, before saving.
    expect(screen.getByLabelText('Avatar preview').textContent).toBe('AL');
    await userEvent.clear(name);
    await userEvent.type(name, 'Grace Hopper');
    expect(screen.getByLabelText('Avatar preview').textContent).toBe('GH');

    await userEvent.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() =>
      expect(userPatch).toEqual({ id: 'u1', body: { name: 'Grace Hopper' } }),
    );
  });

  it('renders a swatch per USER_COLORS and PATCHes color on pick', async () => {
    renderTab();
    await screen.findByRole('textbox', { name: 'Your name' });
    const group = screen.getByRole('group', { name: 'Avatar color' });
    const swatches = group.querySelectorAll('button');
    expect(swatches.length).toBe(USER_COLORS.length);

    // Current color is marked pressed.
    expect(swatches[0].getAttribute('aria-pressed')).toBe('true');

    await userEvent.click(swatches[2]);
    await waitFor(() =>
      expect(userPatch).toEqual({ id: 'u1', body: { color: USER_COLORS[2] } }),
    );
  });

  it('disables Save name when unchanged or empty', async () => {
    renderTab();
    const name = await screen.findByRole('textbox', { name: 'Your name' });
    const save = screen.getByRole('button', { name: 'Save name' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await userEvent.clear(name);
    expect(save.disabled).toBe(true);
  });

  it('submits change-password form and shows success message', async () => {
    renderTab();
    // Wait for the profile to load first.
    await screen.findByRole('textbox', { name: 'Your name' });

    const currentPwInput = screen.getByLabelText('Current password');
    const newPwInput = screen.getByLabelText('New password');

    await userEvent.type(currentPwInput, 'oldpassword');
    await userEvent.type(newPwInput, 'newpassword123');
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }));

    await waitFor(() =>
      expect(changePasswordBody).toEqual({
        currentPassword: 'oldpassword',
        newPassword: 'newpassword123',
      }),
    );
    await screen.findByText('Password updated.');
  });

  it('shows error message on change-password failure', async () => {
    server.use(
      http.post('/api/auth/change-password', () =>
        HttpResponse.json({ message: 'Current password is wrong.' }, { status: 400 }),
      ),
    );
    renderTab();
    await screen.findByRole('textbox', { name: 'Your name' });

    await userEvent.type(screen.getByLabelText('Current password'), 'wrongpass');
    await userEvent.type(screen.getByLabelText('New password'), 'newpassword123');
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }));

    await screen.findByText('Current password is wrong.');
  });

  it('renders a Sign out button', async () => {
    renderTab();
    await screen.findByRole('textbox', { name: 'Your name' });
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('calls logout endpoint when sign out clicked', async () => {
    let logoutCalled = false;
    server.use(
      http.post('/api/auth/logout', () => {
        logoutCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderTab();
    await screen.findByRole('textbox', { name: 'Your name' });

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(logoutCalled).toBe(true));
  });
});
