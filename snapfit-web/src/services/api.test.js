import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api, { setAccountSuspendedHandler, setSubscriptionRequiredHandler } from './api';

const SUSPENDED = 'This account has been suspended. Contact support.';

const SUBSCRIPTION_REQUIRED = 'An active subscription is required';

// Every request fails with this status and body, without touching the network.
function failWith(status, message, code) {
  api.defaults.adapter = async (config) => {
    throw Object.assign(new Error(`Request failed with status code ${status}`), {
      config,
      response: { status, data: { message, code }, config },
    });
  };
}

const onSuspended = vi.fn();
const onSubscriptionRequired = vi.fn();

beforeEach(() => {
  setAccountSuspendedHandler(onSuspended);
  setSubscriptionRequiredHandler(onSubscriptionRequired);
});

afterEach(() => {
  setAccountSuspendedHandler(null);
  setSubscriptionRequiredHandler(null);
  onSuspended.mockClear();
  onSubscriptionRequired.mockClear();
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

describe('api subscription-required interceptor', () => {
  it('reports a locked API and still rejects', async () => {
    failWith(403, SUBSCRIPTION_REQUIRED, 'SUBSCRIPTION_REQUIRED');
    await expect(api.get('/charts')).rejects.toMatchObject({ response: { status: 403 } });
    expect(onSubscriptionRequired).toHaveBeenCalledWith(SUBSCRIPTION_REQUIRED);
    expect(onSuspended).not.toHaveBeenCalled();
  });

  it('ignores a 403 without the code', async () => {
    failWith(403, SUBSCRIPTION_REQUIRED);
    await expect(api.get('/charts')).rejects.toBeTruthy();
    expect(onSubscriptionRequired).not.toHaveBeenCalled();
  });
});
