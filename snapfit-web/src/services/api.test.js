import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api, { setAccountSuspendedHandler } from './api';

const SUSPENDED = 'This account has been suspended. Contact support.';

// Every request fails with this status and body, without touching the network.
function failWith(status, message) {
  api.defaults.adapter = async (config) => {
    throw Object.assign(new Error(`Request failed with status code ${status}`), {
      config,
      response: { status, data: { message }, config },
    });
  };
}

const onSuspended = vi.fn();

beforeEach(() => {
  setAccountSuspendedHandler(onSuspended);
});

afterEach(() => {
  setAccountSuspendedHandler(null);
  onSuspended.mockClear();
  delete api.defaults.adapter;
});

describe('api suspended-account interceptor', () => {
  it('reports a suspension on any call and still rejects', async () => {
    failWith(403, SUSPENDED);
    await expect(api.get('/charts')).rejects.toMatchObject({ response: { status: 403 } });
    expect(onSuspended).toHaveBeenCalledWith(SUSPENDED);
  });

  it('leaves the login call to show the message on its form', async () => {
    failWith(403, SUSPENDED);
    await expect(api.post('/auth/login', {})).rejects.toBeTruthy();
    expect(onSuspended).not.toHaveBeenCalled();
  });

  it('ignores other 403s, such as the wrong role', async () => {
    failWith(403, 'Super admin access required');
    await expect(api.get('/admin/overview')).rejects.toBeTruthy();
    expect(onSuspended).not.toHaveBeenCalled();
  });
});
