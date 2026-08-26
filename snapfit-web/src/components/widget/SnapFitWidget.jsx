import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, ImagePlus, Loader2, Ruler, X } from 'lucide-react';
import LiveCapture from './LiveCapture';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function confidenceTone(confidence) {
  const pct = confidence * 100;
  if (pct > 70) return { bar: 'bg-green-500', text: 'text-green-700' };
  if (pct >= 50) return { bar: 'bg-yellow-500', text: 'text-yellow-700' };
  return { bar: 'bg-red-500', text: 'text-red-700' };
}

function heightToCm(unit, cm, feet, inches) {
  if (unit === 'cm') {
    const value = parseFloat(cm);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
  const totalCm = (parseFloat(feet) || 0) * 30.48 + (parseFloat(inches) || 0) * 2.54;
  return totalCm > 0 ? totalCm : undefined;
}

function SnapFitWidget({ apiKey, productId, apiUrl, buttonLabel = 'Check My Size', autoCapture = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState('form'); // form | loading | result | error
  const [inputMode, setInputMode] = useState(null); // null | 'camera' | 'upload'
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [formError, setFormError] = useState('');
  const [heightUnit, setHeightUnit] = useState('cm');
  const [heightCm, setHeightCm] = useState('');
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [feedback, setFeedback] = useState(null);
  const fileInputRef = useRef(null);

  const isConfigured = Boolean(apiKey && productId && apiUrl);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function resetFlow() {
    setStep('form');
    setInputMode(null);
    setFile(null);
    setFormError('');
    setResult(null);
    setErrorMessage('');
    setFeedback(null);
  }

  function openModal() {
    resetFlow();
    setIsOpen(true);
  }

  function closeModal() {
    if (step === 'loading') return;
    setIsOpen(false);
  }

  function onFilesSelected(fileList) {
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
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragActive(false);
    onFilesSelected(e.dataTransfer.files);
  }

  async function handleSubmit() {
    if (!file) return;
    setStep('loading');

    const heightValue = heightToCm(heightUnit, heightCm, heightFeet, heightInches);
    const formData = new FormData();
    formData.append('image', file);
    formData.append('productId', productId);
    if (heightValue) {
      formData.append('userHeight', String(heightValue));
    }

    try {
      const res = await fetch(`${apiUrl.replace(/\/$/, '')}/recommend`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey },
        body: formData,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setErrorMessage(data?.message || 'Something went wrong while analyzing your photo. Please try again.');
        setStep('error');
        return;
      }

      setResult(data.recommendation);
      setStep('result');
    } catch {
      setErrorMessage("SnapFit's sizing service is temporarily unavailable. Please try again in a moment.");
      setStep('error');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        disabled={!isConfigured}
        title={isConfigured ? undefined : 'Set an API key and product ID to enable this'}
        className="rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {buttonLabel}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} aria-hidden="true" />

          <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <button
              type="button"
              onClick={closeModal}
              disabled={step === 'loading'}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 disabled:opacity-40"
            >
              <X size={18} />
            </button>

            {step === 'form' && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Find your size</h2>
                <p className="mt-1 text-sm text-gray-500">Take or upload a full-body photo and we'll estimate your best fit.</p>

                {!inputMode && (
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setInputMode('camera')}
                      className="flex flex-col items-center gap-2 rounded-lg border border-gray-300 py-5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Camera size={22} className="text-gray-500" />
                      Take a Photo
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputMode('upload')}
                      className="flex flex-col items-center gap-2 rounded-lg border border-gray-300 py-5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <ImagePlus size={22} className="text-gray-500" />
                      Upload a Photo
                    </button>
                  </div>
                )}

                {inputMode === 'camera' && (
                  <div className="mt-4">
                    <LiveCapture
                      file={file}
                      previewUrl={previewUrl}
                      onCapture={(capturedFile) => onFilesSelected([capturedFile])}
                      onRetake={() => setFile(null)}
                      onSwitchToUpload={() => {
                        setFile(null);
                        setFormError('');
                        setInputMode('upload');
                      }}
                      autoCapture={autoCapture}
                    />
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
                        dragActive ? 'border-gray-900 bg-gray-50' : 'border-gray-300'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => onFilesSelected(e.target.files)}
                      />
                      {previewUrl ? (
                        <div className="flex flex-col items-center gap-2">
                          <img src={previewUrl} alt="Selected preview" className="h-32 w-32 rounded-md object-cover" />
                          <span className="text-xs text-gray-500">{file.name} — click to change</span>
                        </div>
                      ) : (
                        <>
                          <ImagePlus size={28} className="text-gray-400" />
                          <p className="mt-2 text-sm text-gray-600">Drag & drop your photo here, or click to browse</p>
                          <p className="mt-1 text-xs text-gray-400">JPG or PNG, up to 10MB</p>
                        </>
                      )}
                    </div>
                    <div className="mt-2 text-center text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setFile(null);
                          setFormError('');
                          setInputMode('camera');
                        }}
                        className="font-medium text-gray-600 underline hover:text-gray-900"
                      >
                        Or take a photo instead
                      </button>
                    </div>
                  </div>
                )}

                {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}

                {inputMode && (
                  <>
                    <div className="mt-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <Ruler size={16} />
                        Height (optional, improves accuracy)
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex rounded-md border border-gray-300 p-0.5 text-xs">
                          <button
                            type="button"
                            onClick={() => setHeightUnit('cm')}
                            className={`rounded px-2 py-1 ${heightUnit === 'cm' ? 'bg-gray-900 text-white' : 'text-gray-600'}`}
                          >
                            cm
                          </button>
                          <button
                            type="button"
                            onClick={() => setHeightUnit('ft')}
                            className={`rounded px-2 py-1 ${heightUnit === 'ft' ? 'bg-gray-900 text-white' : 'text-gray-600'}`}
                          >
                            ft/in
                          </button>
                        </div>

                        {heightUnit === 'cm' ? (
                          <input
                            type="number"
                            min="0"
                            placeholder="e.g. 178"
                            value={heightCm}
                            onChange={(e) => setHeightCm(e.target.value)}
                            className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                          />
                        ) : (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              placeholder="ft"
                              value={heightFeet}
                              onChange={(e) => setHeightFeet(e.target.value)}
                              className="w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                            />
                            <input
                              type="number"
                              min="0"
                              placeholder="in"
                              value={heightInches}
                              onChange={(e) => setHeightInches(e.target.value)}
                              className="w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!file}
                      className="mt-5 w-full rounded-md bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Get My Size
                    </button>
                  </>
                )}
              </div>
            )}

            {step === 'loading' && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Loader2 size={32} className="animate-spin text-gray-900" />
                <p className="mt-4 text-sm font-medium text-gray-700">Analyzing your photo...</p>
                <p className="mt-1 text-xs text-gray-400">This usually takes a few seconds.</p>
              </div>
            )}

            {step === 'result' && result && (
              <div className="text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gray-900 text-2xl font-bold text-white">
                  {result.size}
                </div>

                <div className="mt-4 text-left">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Confidence</span>
                    <span className={confidenceTone(result.confidence).text}>{Math.round(result.confidence * 100)}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${confidenceTone(result.confidence).bar}`}
                      style={{ width: `${Math.round(result.confidence * 100)}%` }}
                    />
                  </div>
                </div>

                {result.bodyType && (
                  <p className="mt-3 text-xs uppercase tracking-wide text-gray-400">
                    Body type: <span className="font-medium text-gray-600">{result.bodyType}</span>
                  </p>
                )}

                {result.notes && <p className="mt-3 text-sm text-gray-600">{result.notes}</p>}

                <div className="mt-5 border-t pt-4">
                  <p className="text-xs font-medium text-gray-500">How did it fit?</p>
                  {feedback ? (
                    <p className="mt-2 text-sm text-gray-600">Thanks for your feedback!</p>
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
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
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
                  className="mt-5 w-full rounded-md border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Check another photo
                </button>
              </div>
            )}

            {step === 'error' && (
              <div className="flex flex-col items-center py-6 text-center">
                <AlertTriangle size={28} className="text-amber-500" />
                <p className="mt-3 text-sm font-medium text-gray-800">{errorMessage}</p>
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="mt-5 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default SnapFitWidget;
