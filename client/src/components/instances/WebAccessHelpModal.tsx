import { SectionHelpModal } from '../SectionHelpModal';
import { WEB_ACCESS_HELP } from '../../lib/instanceHelpContent';

interface WebAccessHelpModalProps {
  open: boolean;
  onClose: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function WebAccessHelpModal({ open, onClose, t }: WebAccessHelpModalProps) {
  return (
    <SectionHelpModal
      open={open}
      onClose={onClose}
      t={t}
      backdropId="webAccessHelpBackdrop"
      titleId="webAccessHelpTitle"
      closeId="webAccessHelpClose"
      content={WEB_ACCESS_HELP}
    />
  );
}
