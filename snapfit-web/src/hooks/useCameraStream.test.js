import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCameraStream } from './useCameraStream';

const CAMERAS = [
  { kind: 'videoinput', deviceId: 'front-cam' },
  { kind: 'videoinput', deviceId: 'back-cam' },
  { kind: 'audioinput', deviceId: 'mic' },
];

function fakeStream(deviceId) {
  const track = { stop: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), getSettings: () => ({ deviceId }) };
  return { id: `stream-${deviceId}`, track, getTracks: () => [track], getVideoTracks: () => [track] };
}

const DEVICE_FOR_FACING = { user: 'front-cam', environment: 'back-cam' };

let getUserMedia;
let enumerateDevices;
let calls;

beforeEach(() => {
  calls = [];
  getUserMedia = vi.fn(async (constraints) => {
    const { deviceId, facingMode } = constraints.video;
    const stream = fakeStream(deviceId?.exact ?? DEVICE_FOR_FACING[facingMode.exact ?? facingMode.ideal]);
    calls.push({ constraints, stream });
    return stream;
  });
  enumerateDevices = vi.fn(async () => CAMERAS);
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia, enumerateDevices }, configurable: true });
});

afterEach(() => {
  delete navigator.mediaDevices;
});

describe('useCameraStream', () => {
  it('opens the requested camera loosely and reports canSwitch when 2+ cameras exist', async () => {
    const { result } = renderHook(() => useCameraStream({ enabled: true, initialFacingMode: 'environment' }));

    await waitFor(() => expect(result.current.status).toBe('granted'));
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    expect(result.current.facingMode).toBe('environment');
    await waitFor(() => expect(result.current.canSwitch).toBe(true));
  });

  it('reports canSwitch false with a single camera', async () => {
    enumerateDevices.mockResolvedValue([CAMERAS[0]]);
    const { result } = renderHook(() => useCameraStream({ enabled: true }));

    await waitFor(() => expect(result.current.status).toBe('granted'));
    await waitFor(() => expect(enumerateDevices).toHaveBeenCalled());
    expect(result.current.canSwitch).toBe(false);
  });

  it('stops the current tracks before requesting the other camera exactly', async () => {
    const { result } = renderHook(() => useCameraStream({ enabled: true, initialFacingMode: 'user' }));
    await waitFor(() => expect(result.current.status).toBe('granted'));
    const first = calls[0].stream;

    getUserMedia.mockImplementationOnce(async (constraints) => {
      // The old camera must already be released when the new one is requested.
      expect(first.track.stop).toHaveBeenCalled();
      const stream = fakeStream('back-cam');
      calls.push({ constraints, stream });
      return stream;
    });
    act(() => result.current.switchCamera());

    await waitFor(() => expect(result.current.stream?.id).toBe('stream-back-cam'));
    expect(result.current.facingMode).toBe('environment');
    expect(calls[1].constraints).toEqual({ video: { facingMode: { exact: 'environment' } }, audio: false });
  });

  it('falls back to another deviceId when the exact facingMode is overconstrained', async () => {
    const { result } = renderHook(() => useCameraStream({ enabled: true, initialFacingMode: 'user' }));
    await waitFor(() => expect(result.current.status).toBe('granted'));

    getUserMedia.mockImplementationOnce(async () => {
      throw Object.assign(new Error('facingMode not supported'), { name: 'OverconstrainedError' });
    });
    act(() => result.current.switchCamera());

    await waitFor(() => expect(result.current.stream?.id).toBe('stream-back-cam'));
    expect(getUserMedia).toHaveBeenLastCalledWith({ video: { deviceId: { exact: 'back-cam' } }, audio: false });
    expect(result.current.status).toBe('granted');
  });

  it('reports a denied permission', async () => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
    const { result } = renderHook(() => useCameraStream({ enabled: true }));

    await waitFor(() => expect(result.current.status).toBe('denied'));
    expect(result.current.error).toBe('Permission denied');
  });

  it('releases the camera on unmount', async () => {
    const { result, unmount } = renderHook(() => useCameraStream({ enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('granted'));

    unmount();
    expect(calls[0].stream.track.stop).toHaveBeenCalled();
  });
});
