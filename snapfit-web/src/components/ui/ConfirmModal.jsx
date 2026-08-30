import Modal from './Modal';
import Button from './Button';

// Same prop API as the pre-theme components/ConfirmModal.jsx, so pages can
// swap the import without touching call sites.
function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  loading = false,
  onConfirm,
  onClose,
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {description && <p className="mt-2 text-sm text-ink-500">{description}</p>}

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export default ConfirmModal;
