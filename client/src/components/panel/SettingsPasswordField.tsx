import { useState, type CSSProperties } from 'react';
import { IconEye, IconEyeOff } from '@tabler/icons-react';

interface SettingsPasswordFieldProps {
  fieldKey: string;
  value: string;
  disabled?: boolean;
  canReveal?: boolean;
  maskWithTextSecurity?: boolean;
  onChange: (value: string) => void;
  t: (key: string) => string;
}

const canWebkitDisc =
  typeof CSS !== 'undefined' && CSS.supports && CSS.supports('-webkit-text-security', 'disc');

export function SettingsPasswordField({
  fieldKey,
  value,
  disabled,
  canReveal = false,
  maskWithTextSecurity,
  onChange,
  t,
}: SettingsPasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const useTextSec = maskWithTextSecurity === true && canWebkitDisc;
  const showRevealed = canReveal && revealed;
  const inputType = useTextSec ? 'text' : showRevealed ? 'text' : 'password';

  function toggle() {
    setRevealed((v) => !v);
  }

  return (
    <div className="settings-input-eye-wrap">
      <input
        type={inputType}
        className="input"
        name={`fcc_server_settings_${fieldKey}_field`}
        autoComplete={useTextSec ? 'one-time-code' : 'new-password'}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        data-fcc-non-credential="1"
        data-form-type="other"
        value={value}
        disabled={disabled}
        style={useTextSec && !showRevealed ? ({ WebkitTextSecurity: 'disc' } as CSSProperties) : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {canReveal && (
        <button
          type="button"
          className="settings-input-eye-btn"
          data-i18n-title="web_login_pass_toggle"
          title={showRevealed ? t('web_password_reveal_hide') : t('web_password_reveal_show')}
          aria-label={showRevealed ? t('web_password_reveal_hide') : t('web_password_reveal_show')}
          disabled={disabled}
          onClick={toggle}
        >
          {showRevealed ? <IconEyeOff size={18} /> : <IconEye size={18} />}
        </button>
      )}
    </div>
  );
}

