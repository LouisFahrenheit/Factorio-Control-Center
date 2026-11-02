import { useState, type CSSProperties } from 'react';
import { IconDice, IconEye, IconEyeOff } from '@tabler/icons-react';

interface SettingsPasswordFieldProps {
  fieldKey: string;
  value: string;
  disabled?: boolean;
  canReveal?: boolean;
  canGenerate?: boolean;
  maskWithTextSecurity?: boolean;
  onChange: (value: string) => void;
  t: (key: string) => string;
}

const canWebkitDisc =
  typeof CSS !== 'undefined' && CSS.supports && CSS.supports('-webkit-text-security', 'disc');

function generateRandomPassword(length = 10): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join('');
}

export function SettingsPasswordField({
  fieldKey,
  value,
  disabled,
  canReveal = false,
  canGenerate = false,
  maskWithTextSecurity = true,
  onChange,
  t,
}: SettingsPasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const useTextSec = maskWithTextSecurity && canWebkitDisc;
  const showRevealed = canReveal && revealed;
  const inputType = useTextSec ? 'text' : showRevealed ? 'text' : 'password';

  function toggle() {
    setRevealed((v) => !v);
  }

  function handleGenerate() {
    if (disabled) return;
    const generated = generateRandomPassword(10);
    onChange(generated);
    setRevealed(true);
  }

  const safeFieldKey = fieldKey.replace(/password/g, 'val');

  return (
    <div
      className={`settings-input-eye-wrap${canGenerate ? ' settings-input-eye-wrap--has-dice' : ''}${canReveal ? ' settings-input-eye-wrap--has-eye' : ''}`}
    >
      {canGenerate && (
        <button
          type="button"
          className="settings-input-action-btn settings-input-dice-btn"
          title={t('server_settings_generate_password_title') || 'Generate random password'}
          aria-label={t('server_settings_generate_password_title') || 'Generate random password'}
          disabled={disabled}
          onClick={handleGenerate}
        >
          <IconDice size={18} />
        </button>
      )}
      <input
        type={inputType}
        className="input"
        id={`inpServerSettingsField-${safeFieldKey}`}
        name={`fcc_server_param_${safeFieldKey}`}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        data-protonpass-ignore="true"
        data-dashlane-ignore="true"
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
          className="settings-input-action-btn settings-input-eye-btn"
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


