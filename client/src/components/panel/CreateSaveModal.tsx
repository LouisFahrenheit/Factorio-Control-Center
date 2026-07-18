import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { CreateSaveApi } from '../../hooks/useCreateSave';
import { CreateSaveNameModal } from './CreateSaveNameModal';
import { MapExchangeModal } from './MapExchangeModal';
import { MapGenCustomPanel } from './MapGenCustomPanel';

interface CreateSaveModalProps {
  createSave: CreateSaveApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function CreateSaveModal({ createSave, t }: CreateSaveModalProps) {
  if (!createSave.open) return null;

  const cs = createSave;

  return (
    <>
      <ModalBackdrop open id="createSaveBackdrop" onClose={cs.closeDialog} closeOnBackdropClick={false}>
        <div
          className="fu-modal create-save-dialog create-save-dialog--no-footer"
          role="dialog"
          aria-modal="true"
          aria-label={t('map_gen_mode_custom')}
        >
          <div className="fu-modal__body">
            <MapGenCustomPanel cs={cs} t={t} />
          </div>
        </div>
      </ModalBackdrop>
      <MapExchangeModal cs={cs} t={t} />
      <CreateSaveNameModal cs={cs} t={t} />
    </>
  );
}
