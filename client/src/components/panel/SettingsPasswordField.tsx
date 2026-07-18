import { useState, type CSSProperties } from 'react';

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
  const wrapClass =
    'fcc-pass-field-wrap' +
    (useTextSec ? ' fcc-pass-field--textsec' : '') +
    (showRevealed ? ' is-revealed' : '');

  function toggle() {
    setRevealed((v) => !v);
  }

  const input = (
    <span className={wrapClass}>
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
    </span>
  );

  if (!canReveal) {
    return <span className="settings-row__field">{input}</span>;
  }

  return (
    <>
      <span className="settings-row__lead">
        <button
          type="button"
          className={`fcc-pass-field-toggle${showRevealed ? ' is-on' : ''}`}
          data-i18n-title="web_login_pass_toggle"
          title={t('web_login_pass_toggle')}
          aria-label={showRevealed ? t('web_password_reveal_hide') : t('web_password_reveal_show')}
          disabled={disabled}
          onClick={toggle}
        >
          <span className="fcc-pass-field-toggle-eye" aria-hidden="true">
            {showRevealed ? '○' : '●'}
          </span>
        </button>
      </span>
      <span className="settings-row__field">{input}</span>
    </>
  );
}
