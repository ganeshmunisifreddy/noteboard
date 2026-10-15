import { describe, expect, it, vi } from 'vitest';
import { openFromNotification } from './notificationClick';

const ORIGIN = 'https://noteboard.example';

describe('openFromNotification', () => {
  it('focuses an open Noteboard window and asks it to open the reminder', async () => {
    const window = { url: `${ORIGIN}/`, focus: vi.fn(async () => {}), postMessage: vi.fn() };
    const clients = { matchAll: vi.fn(async () => [{ url: 'https://other.example/', focus: vi.fn(), postMessage: vi.fn() }, window]), openWindow: vi.fn() };
    await openFromNotification(clients, ORIGIN, '/note?id=n1');
    expect(window.focus).toHaveBeenCalled();
    expect(window.postMessage).toHaveBeenCalledWith({ type: 'open-reminder', url: '/note?id=n1' });
    expect(clients.openWindow).not.toHaveBeenCalled();
  });

  it('opens a new window when none is open', async () => {
    const clients = { matchAll: vi.fn(async () => []), openWindow: vi.fn(async () => null) };
    await openFromNotification(clients, ORIGIN, '/?view=upcoming');
    expect(clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/?view=upcoming`);
  });

  it('still opens the reminder when focusing the window fails', async () => {
    const window = { url: `${ORIGIN}/`, focus: vi.fn(async () => Promise.reject(new Error('not allowed'))), postMessage: vi.fn() };
    const clients = { matchAll: vi.fn(async () => [window]), openWindow: vi.fn() };
    await openFromNotification(clients, ORIGIN, '/note?id=n1');
    expect(window.postMessage).toHaveBeenCalledWith({ type: 'open-reminder', url: '/note?id=n1' });
  });
});
