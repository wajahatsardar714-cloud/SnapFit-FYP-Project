import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Camera, ImagePlus, Ruler, Shirt, Smartphone, X } from 'lucide-react';
import { isLikelyDesktop } from '../../utils/device';
import AnalysisProgress from './AnalysisProgress';
import SizeResult from './SizeResult';
import TryOnPreview from './TryOnPreview';

// Code-split: LiveCapture pulls in @mediapipe/tasks-vision (WASM), which is only
// needed once a shopper opens the camera tab. Merchants who only use the (default)
// upload flow never pay for that bundle.
const LiveCapture = lazy(() => import('./LiveCapture'));
// Same idea for the QR-handoff view -- it pulls in the `qrcode` package, needed
// only if a desktop shopper chooses to continue on their phone.
const MobileHandoff = lazy(() => import('./MobileHandoff'));

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MIN_HEIGHT_CM = 100;
const MAX_HEIGHT_CM = 230;
// Size + try-on in one call: one upload, billed as one request. The backend
// only renders the try-on for try-on-ready products.
const INCLUDE_TRY_ON = true;

const CLOTHING_FIT_OPTIONS = [
  { value: 'fitted', label: 'Fitted' },
  { value: 'regular', label: 'Regular' },
  { value: 'loose', label: 'Loose' },
];

// Height in cm (to one decimal), or undefined when nothing has been entered.
function heightToCm(unit, cm, feet, inches) {
  if (unit === 'cm') {
    const value = parseFloat(cm);
    return Number.isFinite(value) ? value : undefined;
  }
  if (feet === '' && inches === '') return undefined;
  const totalCm = (parseFloat(feet) || 0) * 30.48 + (parseFloat(inches) || 0) * 2.54;
  return Math.round(totalCm * 10) / 10;
}

function heightError(heightValue) {
  if (heightValue === undefined) return 'Please enter your height.';
  if (heightValue < MIN_HEIGHT_CM || heightValue > MAX_HEIGHT_CM) {
    return 'Height must be between 100 and 230 cm (3 ft 4 in – 7 ft 6 in).';
  }
  return '';
}

function SnapFitWidget({ apiKey, productId, apiUrl, buttonLabel = 'Check My Size', autoCapture = true }) {
  const [isDesktop] = useState(isLikelyDesktop);
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState('form'); // form | loading | result | error
  const [inputMode, setInputMode] = useState(null); // null | 'camera' | 'upload'
  const [file, setFile] = useState(null);
  // Extra live-camera frames taken with `file`; replaced or cleared with it.
  const [extraFrames, setExtraFrames] = useState([]);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [formError, setFormError] = useState('');
  const [heightUnit, setHeightUnit] = useState('cm');
  const [heightCm, setHeightCm] = useState('');
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');
  const [heightTouched, setHeightTouched] = useState(false);
  const [clothingFit, setClothingFit] = useState('regular');
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [poseChecks, setPoseChecks] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [tryOn, setTryOn] = useState(null);
  const fileInputRef = useRef(null);
  const fieldId = useId();

  const isConfigured = Boolean(apiKey && productId && apiUrl);
  const heightValue = heightToCm(heightUnit, heightCm, heightFeet, heightInches);
  const heightMessage = heightError(heightValue);
  const showHeightError = heightTouched && Boolean(heightMessage);
  const heightErrorId = `${fieldId}-height-error`;
  const heightInputProps = {
    type: 'number',
    min: '0',
    onBlur: () => setHeightTouched(true),
    'aria-invalid': showHeightError,
    'aria-describedby': showHeightError ? heightErrorId : undefined,
    className: `rounded-md border px-2 py-1.5 text-sm ${showHeightError ? 'border-danger' : 'border-border'}`,
  };

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function clearPhoto() {
    setFile(null);
    setExtraFrames([]);
  }

  function resetFlow() {
    setStep('form');
    setInputMode(null);
    clearPhoto();
    setFormError('');
    setHeightTouched(false);
    setClothingFit('regular');
    setResult(null);
    setErrorMessage('');
    setPoseChecks([]);
    setFeedback(null);
    setTryOn(null);
  }

  function openModal() {
    resetFlow();
    setIsOpen(true);
  }

  function closeModal() {
    if (step === 'loading') return;
    setIsOpen(false);
  }

  // `frames`: extra frames captured with this photo (live camera only).
  function onFilesSelected(fileList, frames = []) {
    const selected = fileList?.[0];
    if (!selected) return;
    if (!selected.type.startsWith('image/')) {
      setFormError('Please choose an image file (JPG or PNG).');
      return;
    }
    if (selected.size > MAX_FILE_SIZE_BYTES) {
      setFormError('This image is too large. Please choose a photo under 10MB.');
      return;
    }
    setFormError('');
    setFile(selected);
    setExtraFrames(frames);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragActive(false);
    onFilesSelected(e.dataTransfer.files);
  }

  async function handleSubmit() {
    if (!file) return;
    if (heightMessage) {
      setHeightTouched(true);
      return;
    }
    setStep('loading');

    const formData = new FormData();
    formData.append('image', file);
    extraFrames.forEach((frame) => formData.append('frames', frame));
    formData.append('productId', productId);
    formData.append('userHeight', String(heightValue));
    formData.append('clothingFit', clothingFit);
    formData.append('includeTryOn', String(INCLUDE_TRY_ON));

    try {
      const res = await fetch(`${apiUrl.replace(/\/$/, '')}/recommend`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey },
        body: formData,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setErrorMessage(data?.message || 'Something went wrong while analyzing your photo. Please try again.');
        setPoseChecks(data?.poseChecks || []);
        setStep('error');
        return;
      }

      setResult(data.recommendation);
      setTryOn(data.tryOn || null);
      setStep('result');
    } catch {
      setErrorMessage("SnapFit's sizing service is temporarily unavailable. Please try again in a moment.");
      setStep('error');
    }
  }

  return (
    // Always light: the widget sits inside a merchant's store page, so the
    // dashboard's dark-mode setting must not change it.
    <div data-theme="light" className="contents">
      <button
        type="button"
        onClick={openModal}
        disabled={!isConfigured}
        title={isConfigured ? undefined : 'Set an API key and product ID to enable this'}
        className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {buttonLabel}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-overlay/50" onClick={closeModal} aria-hidden="true" />

          <div className="relative w-full max-w-md rounded-xl bg-background p-6 shadow-xl">
            <button
              type="button"
              onClick={closeModal}
              disabled={step === 'loading'}
              className="absolute right-4 top-4 text-muted-foreground hover:text-muted-foreground disabled:opacity-40"
            >
              <X size={18} />
            </button>

            {step === 'form' && (
              <div>
                <h2 className="text-lg font-semibold text-foreground">Find your size</h2>
                <p className="mt-1 text-sm text-muted-foreground">Take or upload a full-body photo and we'll estimate your best fit.</p>

                {!inputMode && (
                  <div className={`mt-5 grid gap-3 ${isDesktop ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    <button
                      type="button"
                      onClick={() => setInputMode('camera')}
                      className="flex flex-col items-center gap-2 rounded-lg border border-border py-5 text-sm font-medium text-foreground hover:bg-surface-2"
                    >
                      <Camera size={22} className="text-muted-foreground" />
                      Take a Photo
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputMode('upload')}
                      className="flex flex-col items-center gap-2 rounded-lg border border-border py-5 text-sm font-medium text-foreground hover:bg-surface-2"
                    >
                      <ImagePlus size={22} className="text-muted-foreground" />
                      Upload a Photo
                    </button>
                    {isDesktop && (
                      <button
                        type="button"
                        onClick={() => setInputMode('phone')}
                        className="flex flex-col items-center gap-2 rounded-lg border border-border py-5 text-sm font-medium text-foreground hover:bg-surface-2"
                      >
                        <Smartphone size={22} className="text-muted-foreground" />
                        Use My Phone
                      </button>
                    )}
                  </div>
                )}

                {inputMode === 'phone' && !file && (
                  <div className="mt-4">
                    <Suspense fallback={<p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}>
                      <MobileHandoff
                        apiKey={apiKey}
                        apiUrl={apiUrl}
                        onCapture={(capturedFile) => onFilesSelected([capturedFile])}
                        onSwitchToUpload={() => {
                          setFormError('');
                          setInputMode('upload');
                        }}
                      />
                    </Suspense>
                  </div>
                )}

                {inputMode === 'phone' && file && (
                  <div className="mt-4">
                    <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-border p-3">
                      <img src={previewUrl} alt="Photo from your phone" className="h-48 w-48 rounded-md object-cover" />
                      <span className="text-xs text-muted-foreground">Received from your phone</span>
                    </div>
                    <div className="mt-3 flex items-center justify-center gap-4 text-xs">
                      <button
                        type="button"
                        onClick={clearPhoto}
                        className="font-medium text-muted-foreground underline hover:text-foreground"
                      >
                        Retake
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          clearPhoto();
                          setFormError('');
                          setInputMode('upload');
                        }}
                        className="font-medium text-muted-foreground underline hover:text-foreground"
                      >
                        Or upload a photo instead
                      </button>
                    </div>
                  </div>
                )}

                {inputMode === 'camera' && (
                  <div className="mt-4">
                    <Suspense
                      fallback={<p className="py-10 text-center text-sm text-muted-foreground">Loading camera…</p>}
                    >
                      <LiveCapture
                        file={file}
                        previewUrl={previewUrl}
                        onCapture={(capturedFile, frames) => onFilesSelected([capturedFile], frames)}
                        onRetake={clearPhoto}
                        onSwitchToUpload={() => {
                          clearPhoto();
                          setFormError('');
                          setInputMode('upload');
                        }}
                        autoCapture={autoCapture}
                      />
                    </Suspense>
                  </div>
                )}

                {inputMode === 'upload' && (
                  <div className="mt-4">
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragActive(true);
                      }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition ${
                        dragActive ? 'border-primary bg-surface-2' : 'border-border'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => onFilesSelected(e.target.files)}
                      />
                      {/* previewUrl trails `file` by a render (set in an effect), so check both. */}
                      {file && previewUrl ? (
                        <div className="flex flex-col items-center gap-2">
                          <img src={previewUrl} alt="Selected preview" className="h-32 w-32 rounded-md object-cover" />
                          <span className="text-xs text-muted-foreground">{file.name} — click to change</span>
                        </div>
                      ) : (
                        <>
                          <ImagePlus size={28} className="text-muted-foreground" />
                          <p className="mt-2 text-sm text-muted-foreground">Drag & drop your photo here, or click to browse</p>
                          <p className="mt-1 text-xs text-muted-foreground">JPG or PNG, up to 10MB</p>
                        </>
                      )}
                    </div>
                    <div className="mt-2 text-center text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          clearPhoto();
                          setFormError('');
                          setInputMode('camera');
                        }}
                        className="font-medium text-muted-foreground underline hover:text-foreground"
                      >
                        Or take a photo instead
                      </button>
                    </div>
                  </div>
                )}

                {formError && <p className="mt-2 text-sm text-danger">{formError}</p>}

                {inputMode && (
                  <>
                    <div className="mt-4" role="group" aria-labelledby={`${fieldId}-height-label`}>
                      <div id={`${fieldId}-height-label`} className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Ruler size={16} aria-hidden="true" />
                        Height
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex rounded-md border border-border p-0.5 text-xs">
                          <button
                            type="button"
                            aria-pressed={heightUnit === 'cm'}
                            onClick={() => setHeightUnit('cm')}
                            className={`rounded px-2 py-1 ${heightUnit === 'cm' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                          >
                            cm
                          </button>
                          <button
                            type="button"
                            aria-pressed={heightUnit === 'ft'}
                            onClick={() => setHeightUnit('ft')}
                            className={`rounded px-2 py-1 ${heightUnit === 'ft' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                          >
                            ft/in
                          </button>
                        </div>

                        {heightUnit === 'cm' ? (
                          <input
                            {...heightInputProps}
                            aria-label="Height in cm"
                            placeholder="e.g. 178"
                            value={heightCm}
                            onChange={(e) => setHeightCm(e.target.value)}
                            className={`w-24 ${heightInputProps.className}`}
                          />
                        ) : (
                          <div className="flex items-center gap-1">
                            <input
                              {...heightInputProps}
                              aria-label="Height, feet"
                              placeholder="ft"
                              value={heightFeet}
                              onChange={(e) => setHeightFeet(e.target.value)}
                              className={`w-16 ${heightInputProps.className}`}
                            />
                            <input
                              {...heightInputProps}
                              aria-label="Height, inches"
                              placeholder="in"
                              value={heightInches}
                              onChange={(e) => setHeightInches(e.target.value)}
                              className={`w-16 ${heightInputProps.className}`}
                            />
                          </div>
                        )}
                      </div>
                      {showHeightError && (
                        <p id={heightErrorId} className="mt-1 text-xs text-danger">
                          {heightMessage}
                        </p>
                      )}
                    </div>

                    <fieldset className="mt-4">
                      <legend className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Shirt size={16} aria-hidden="true" />
                        What are you wearing?
                      </legend>
                      <div className="mt-2 flex rounded-md border border-border p-0.5 text-xs">
                        {CLOTHING_FIT_OPTIONS.map((option) => (
                          <label
                            key={option.value}
                            className={`flex-1 cursor-pointer rounded px-2 py-1 text-center focus-within:ring-2 focus-within:ring-primary ${
                              clothingFit === option.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`${fieldId}-clothing-fit`}
                              value={option.value}
                              checked={clothingFit === option.value}
                              onChange={() => setClothingFit(option.value)}
                              className="sr-only"
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Fitted clothes give the most accurate size.</p>
                    </fieldset>

                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!file}
                      className="mt-5 w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Get My Size
                    </button>
                  </>
                )}
              </div>
            )}

            {step === 'loading' && <AnalysisProgress includesTryOn={INCLUDE_TRY_ON} />}

            {step === 'result' && result && (
              <div className="text-center">
                <SizeResult result={result} />

                {tryOn && tryOn.status !== 'unavailable' && (
                  <div className="mt-5 border-t pt-4 text-left">
                    <TryOnPreview tryOn={tryOn} originalUrl={previewUrl} size={result.size} />
                  </div>
                )}

                <div className="mt-5 border-t pt-4">
                  <p className="text-xs font-medium text-muted-foreground">How did it fit?</p>
                  {feedback ? (
                    <p className="mt-2 text-sm text-muted-foreground">Thanks for your feedback!</p>
                  ) : (
                    <div className="mt-2 flex justify-center gap-2">
                      {[
                        { key: 'small', label: 'Too small' },
                        { key: 'perfect', label: 'Perfect' },
                        { key: 'large', label: 'Too large' },
                      ].map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setFeedback(option.key)}
                          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface-2"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={resetFlow}
                  className="mt-5 w-full rounded-md border border-border py-2 text-sm font-medium text-foreground hover:bg-surface-2"
                >
                  {result.photoTips?.length ? 'Retake photo' : 'Check another photo'}
                </button>
              </div>
            )}

            {step === 'error' && (
              <div className="flex flex-col items-center py-6 text-center">
                <AlertTriangle size={28} className="text-warning" />
                <p className="mt-3 text-sm font-medium text-foreground">{errorMessage}</p>
                {poseChecks.length > 1 && (
                  <ul className="mt-3 space-y-1 text-left text-xs text-muted-foreground">
                    {poseChecks.map((check) => (
                      <li key={check.id} className="flex gap-2">
                        <span aria-hidden="true">•</span>
                        {check.message}
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SnapFitWidget;
