import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SnapFitWidget from './SnapFitWidget';

const { CAMERA_PHOTO, CAMERA_FRAMES } = vi.hoisted(() => ({
  CAMERA_PHOTO: new File(['main'], 'capture.jpg', { type: 'image/jpeg' }),
  CAMERA_FRAMES: [1, 2].map((n) => new File([`frame ${n}`], `frame-${n}.jpg`, { type: 'image/jpeg' })),
}));

// Stand-in camera: one click "captures" a photo plus its extra frames.
vi.mock('./LiveCapture', () => ({
  default: ({ file, onCapture, onRetake, onSwitchToUpload }) =>
    file ? (
      <>
        <button type="button" onClick={onRetake}>
          Retake
        </button>
        <button type="button" onClick={onSwitchToUpload}>
          Or upload a photo instead
        </button>
      </>
    ) : (
      <button type="button" onClick={() => onCapture(CAMERA_PHOTO, CAMERA_FRAMES)}>
        Capture
      </button>
    ),
}));

const RECOMMENDATION = { size: 'M', confidence: 0.9, notes: 'M fits.', fitNotes: [] };
const HEIGHT_RANGE_ERROR = 'Height must be between 100 and 230 cm (3 ft 4 in – 7 ft 6 in).';

function respondWith(body, recommendation = RECOMMENDATION) {
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ success: true, recommendation, ...body }) }));
}

function openWidget() {
  render(<SnapFitWidget apiKey="sk_live_test" productId="SKU-1" apiUrl="https://api.test/api" />);
  fireEvent.click(screen.getByRole('button', { name: 'Check My Size' }));
}

function uploadPhoto() {
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [new File(['photo'], 'me.jpg', { type: 'image/jpeg' })] } });
}

// Opens the widget and picks a photo, leaving the form ready to submit.
function choosePhoto() {
  openWidget();
  fireEvent.click(screen.getByRole('button', { name: /Upload a Photo/ }));
  uploadPhoto();
}

async function captureFromCamera() {
  openWidget();
  fireEvent.click(screen.getByRole('button', { name: /Take a Photo/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Capture' }));
}

const enterHeightCm = (value) => fireEvent.change(screen.getByLabelText('Height in cm'), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Get My Size' }));

async function submitForm() {
  enterHeightCm('178');
  submit();
  await screen.findByText('M fits.');
}

async function getMySize() {
  choosePhoto();
  await submitForm();
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:photo');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  delete globalThis.fetch;
});

describe('SnapFitWidget result', () => {
  it('asks for size and try-on in one request', async () => {
    respondWith({ tryOn: { status: 'unavailable' } });
    await getMySize();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.test/api/recommend');
    expect(init.body.get('includeTryOn')).toBe('true');
    expect(init.body.get('userHeight')).toBe('178');
  });

  it('shows the try-on view for a try-on-ready product', async () => {
    respondWith({ tryOn: { status: 'success', image: 'data:image/jpeg;base64,X' } });
    await getMySize();

    expect(screen.getByText('See it on you')).toBeTruthy();
    expect(screen.getByAltText('You wearing size M')).toBeTruthy();
  });

  it('hides the try-on view when the product is not try-on ready', async () => {
    respondWith({ tryOn: { status: 'unavailable' } });
    await getMySize();

    expect(screen.queryByText('See it on you')).toBeNull();
  });

  it('still shows the size when the try-on fails', async () => {
    respondWith({ tryOn: { status: 'failed', message: 'Please try again in a moment.' } });
    await getMySize();

    expect(screen.getByText('M', { selector: 'div' })).toBeTruthy();
    expect(screen.getByText(/couldn.t create a preview/)).toBeTruthy();
  });

  it('offers a retake when the server has photo tips', async () => {
    respondWith({}, { ...RECOMMENDATION, photoTips: [{ id: 'dim_light', message: 'Find brighter light.' }] });
    await getMySize();

    expect(screen.getByText('Find brighter light.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retake photo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check another photo' })).toBeNull();
  });

  it('offers another photo when there are no photo tips', async () => {
    respondWith({}, { ...RECOMMENDATION, photoTips: [], warnings: [] });
    await getMySize();

    expect(screen.getByRole('button', { name: 'Check another photo' })).toBeTruthy();
  });
});

describe('SnapFitWidget camera frames', () => {
  it('sends each extra camera frame as a repeated frames field', async () => {
    respondWith({});
    await captureFromCamera();
    await submitForm();

    const { body } = fetch.mock.calls[0][1];
    expect(body.get('image').name).toBe('capture.jpg');
    expect(body.getAll('frames').map((frame) => frame.name)).toEqual(['frame-1.jpg', 'frame-2.jpg']);
  });

  it('sends no frames with an uploaded photo', async () => {
    respondWith({});
    await getMySize();

    const { body } = fetch.mock.calls[0][1];
    expect(body.get('image').name).toBe('me.jpg');
    expect(body.getAll('frames')).toEqual([]);
  });

  it('drops the frames on retake and when switching to upload', async () => {
    respondWith({});
    await captureFromCamera();
    fireEvent.click(screen.getByRole('button', { name: 'Retake' }));
    expect(screen.getByRole('button', { name: 'Get My Size' }).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    fireEvent.click(screen.getByRole('button', { name: 'Or upload a photo instead' }));
    uploadPhoto();
    await submitForm();

    const { body } = fetch.mock.calls[0][1];
    expect(body.get('image').name).toBe('me.jpg');
    expect(body.getAll('frames')).toEqual([]);
  });
});

describe('SnapFitWidget height', () => {
  it('labels the height as required', () => {
    choosePhoto();
    expect(screen.getByRole('group', { name: 'Height' })).toBeTruthy();
    expect(screen.queryByText(/optional/i)).toBeNull();
  });

  it('blocks the request until a height is entered', () => {
    globalThis.fetch = vi.fn();
    choosePhoto();
    submit();

    expect(screen.getByText('Please enter your height.')).toBeTruthy();
    expect(screen.getByLabelText('Height in cm').getAttribute('aria-invalid')).toBe('true');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a height outside 100–230 cm', () => {
    globalThis.fetch = vi.fn();
    choosePhoto();
    enterHeightCm('250');
    submit();

    expect(screen.getByText(HEIGHT_RANGE_ERROR)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows the error once the field is left and clears it when the height is valid', () => {
    choosePhoto();
    const input = screen.getByLabelText('Height in cm');
    enterHeightCm('90');
    fireEvent.blur(input);
    expect(screen.getByText(HEIGHT_RANGE_ERROR)).toBeTruthy();

    enterHeightCm('170');
    expect(screen.queryByText(HEIGHT_RANGE_ERROR)).toBeNull();
  });

  it('checks the range after converting feet and inches', () => {
    globalThis.fetch = vi.fn();
    choosePhoto();
    fireEvent.click(screen.getByRole('button', { name: 'ft/in' }));
    fireEvent.change(screen.getByLabelText('Height, feet'), { target: { value: '3' } });
    submit();

    expect(screen.getByText(HEIGHT_RANGE_ERROR)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends a feet-and-inches height in cm', async () => {
    respondWith({});
    choosePhoto();
    fireEvent.click(screen.getByRole('button', { name: 'ft/in' }));
    fireEvent.change(screen.getByLabelText('Height, feet'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Height, inches'), { target: { value: '10' } });
    submit();
    await screen.findByText('M fits.');

    expect(fetch.mock.calls[0][1].body.get('userHeight')).toBe('177.8');
  });
});

describe('SnapFitWidget clothing fit', () => {
  it('defaults to regular and sends the chosen fit', async () => {
    respondWith({});
    choosePhoto();
    const group = screen.getByRole('group', { name: 'What are you wearing?' });
    expect(group).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Regular' }).checked).toBe(true);
    expect(screen.getByText('Fitted clothes give the most accurate size.')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Fitted' }));
    enterHeightCm('178');
    submit();
    await screen.findByText('M fits.');

    expect(fetch.mock.calls[0][1].body.get('clothingFit')).toBe('fitted');
  });

  it('resets to regular when checking another photo', async () => {
    respondWith({});
    choosePhoto();
    fireEvent.click(screen.getByRole('radio', { name: 'Loose' }));
    enterHeightCm('178');
    submit();
    await screen.findByText('M fits.');

    fireEvent.click(screen.getByRole('button', { name: 'Check another photo' }));
    fireEvent.click(screen.getByRole('button', { name: /Upload a Photo/ }));
    expect(screen.getByRole('radio', { name: 'Regular' }).checked).toBe(true);
  });
});

describe('SnapFitWidget loading', () => {
  it('shows staged progress while the request is in flight', () => {
    globalThis.fetch = vi.fn(() => new Promise(() => {}));
    choosePhoto();
    enterHeightCm('178');
    submit();

    expect(screen.getByRole('status').textContent).toBe('Measuring you…');
    expect(screen.getByText('0 s elapsed')).toBeTruthy();
  });
});

describe('SnapFitWidget authentication', () => {
  it('sends the merchant API key to /recommend', async () => {
    respondWith({});
    await getMySize();

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.test/api/recommend');
    expect(init.headers).toEqual({ 'x-api-key': 'sk_live_test' });
  });

  it('sends an admin token as a bearer to its own endpoint, with no API key', async () => {
    respondWith({});
    render(
      <SnapFitWidget
        authToken="admin.jwt"
        endpoint="/admin/demo/recommend?merchantId=m1"
        productId="SKU-1"
        apiUrl="https://api.test/api/"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check My Size' }));
    fireEvent.click(screen.getByRole('button', { name: /Upload a Photo/ }));
    uploadPhoto();
    await submitForm();

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.test/api/admin/demo/recommend?merchantId=m1');
    expect(init.headers).toEqual({ Authorization: 'Bearer admin.jwt' });
  });
});

describe('SnapFitWidget dialog', () => {
  it('is a named dialog that shows the result wide and scrolls on its own', async () => {
    respondWith({});
    await getMySize();
    const dialog = screen.getByRole('dialog', { name: 'Your size' });
    expect(dialog.className).toContain('sm:max-w-5xl');
    expect(dialog.querySelector('.overflow-y-auto')).not.toBeNull();
  });

  it('goes back from the result to the form with the photo and height kept', async () => {
    respondWith({});
    await getMySize();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('dialog', { name: 'Find your size' })).toBeTruthy();
    expect(screen.getByLabelText('Height in cm').value).toBe('178');
    expect(screen.getByRole('button', { name: 'Get My Size' })).toBeTruthy();
  });

  it('closes with Done or Escape and stops the page scrolling while open', async () => {
    respondWith({});
    await getMySize();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Check My Size' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
