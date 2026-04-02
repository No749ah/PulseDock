import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import type { AlertChannel } from './types';

interface DeleteChannelConfirmProps {
  isOpen: boolean;
  selected: AlertChannel | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteChannelConfirm({
  isOpen,
  selected,
  onClose,
  onConfirm,
}: DeleteChannelConfirmProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete alert channel"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" className="!bg-danger hover:!bg-danger/80" onClick={onConfirm}>
            Delete
          </Button>
        </>
      }
    >
      <p className="text-text-primary">
        Delete <strong>{selected?.name}</strong>?
      </p>
    </Modal>
  );
}
