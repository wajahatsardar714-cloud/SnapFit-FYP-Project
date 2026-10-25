import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTO_CAPTURE_COUNTDOWN_S, EXTRA_CAPTURE_FRAMES, FRAME_INTERVAL_MS } from '../../config/poseConfig';
import LiveCapture from './LiveCapture';

const { STREAM, PASSING } = vi.hoisted(() => ({ STREAM: { id: 'stream-1' }, PASSING: { ok: true, checks: [] } }));

vi.mock('../../hooks/useCameraStream', () => ({
  useCameraStream: () => ({ stream: STREAM, status: 'granted', error: '', switchCamera: () => {}, canSwitch: false }),
}));
vi.mock('../../hooks/useLivePoseDetection', () => ({
  useLivePoseDetection: () => ({ isModelReady: true, validation: PASSING, error: null, checkFrame: () => PASSING }),
}));

const BURST_MS = EXTRA_CAPTURE_FRAMES * FRAME_INTERVAL_MS;

let drawImage;
let toBlob;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(640);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(480);
  drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage });
  toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => {
    callback(new Blob(['jpeg'], { type }));
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderCamera(props = {}) {
  const onCapture = vi.fn();
  const view = render(
    <LiveCapture onCapture={onCapture} onRetake={() => {}} onSwitchToUpload={() => {}} autoCapture={false} {...props} />
  );
  return { onCapture, ...view };
}

const capture = () => fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
const advance = (ms) => act(() => vi.advanceTimersByTimeAsync(ms));

describe('LiveCapture burst', () => {
  it('captures the main photo plus the extra frames, holding still in between', async () => {
    const { onCapture } = renderCamera();
    capture();

    expect(screen.getByText('Hold still…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Capture' }).disabled).toBe(true);
    await advance(BURST_MS - 1);
    expect(onCapture).not.toHaveBeenCalled();

    await advance(1);
    expect(drawImage).toHaveBeenCalledTimes(1 + EXTRA_CAPTURE_FRAMES);
    expect(onCapture).toHaveBeenCalledTimes(1);
    const [main, frames] = onCapture.mock.calls[0];
    expect(main).toBeInstanceOf(File);
    expect(main.type).toBe('image/jpeg');
    expect(frames).toHaveLength(EXTRA_CAPTURE_FRAMES);
    frames.forEach((frame) => expect(frame.type).toBe('image/jpeg'));
    expect(screen.queryByText('Hold still…')).toBeNull();
  });

  it('auto-captures a burst after the countdown', async () => {
    const { onCapture } = renderCamera({ autoCapture: true });

    await advance(AUTO_CAPTURE_COUNTDOWN_S * 1000 + BURST_MS);
    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onCapture.mock.calls[0][1]).toHaveLength(EXTRA_CAPTURE_FRAMES);
  });

  it('drops a frame that fails to encode', async () => {
    // Call 1 encodes the main photo; call 2 (the first extra frame) fails.
    const encode = toBlob.getMockImplementation();
    toBlob.mockImplementationOnce(encode).mockImplementationOnce((callback) => callback(null));
    const { onCapture } = renderCamera();
    capture();

    await advance(BURST_MS);
    expect(onCapture.mock.calls[0][1]).toHaveLength(EXTRA_CAPTURE_FRAMES - 1);
  });

  it('starts only one burst on a double click', async () => {
    const { onCapture } = renderCamera();
    capture();
    capture();

    await advance(BURST_MS * 2);
    expect(drawImage).toHaveBeenCalledTimes(1 + EXTRA_CAPTURE_FRAMES);
    expect(onCapture).toHaveBeenCalledTimes(1);
  });

  it('leaves no timers behind when unmounted mid-burst', async () => {
    const { onCapture, unmount } = renderCamera();
    capture();
    await advance(FRAME_INTERVAL_MS);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await advance(BURST_MS);
    expect(onCapture).not.toHaveBeenCalled();
  });
});
