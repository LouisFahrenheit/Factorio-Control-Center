import type { ReactNode } from 'react';
import type { LocaleStrings } from '../../i18n/locale';
import { FccSwitch } from '../FccSwitch';
import {
  CATEGORY_ORDER,
  LEFT_COLUMN,
  RIGHT_COLUMN,
  groupFieldsByCategory,
  isDefaultServerTextValue,
  parseSettingFields,
  settingCategoryTitle,
  settingHintForLabel,
  settingLabel,
  type SettingCategory,
  type SettingField,
} from '../../lib/serverSettingsUtils';
import { SettingsPasswordField } from './SettingsPasswordField';

interface ServerSettingsFormProps {
  data: Record<string, unknown>;
  values: Record<string, unknown>;
  disabled?: boolean;
  canRevealSecrets?: boolean;
  strings: LocaleStrings;
  t: (key: string, ...args: (string | number)[]) => string;
  onChange: (key: string, value: unknown) => void;
  onVisibilityPublicAttempt: () => boolean;
}

function isGameplayBoolField(cat: SettingCategory, field: SettingField): boolean {
  return cat === 'gameplay' && typeof field.value === 'boolean' && field.key !== 'visibility';
}

function scalarDisplayValue(key: string, value: unknown): string {
  if ((key === 'name' || key === 'description') && isDefaultServerTextValue(key, value)) return '';
  return value == null ? '' : String(value);
}

function renderFieldControl(
  field: SettingField,
  values: Record<string, unknown>,
  disabled: boolean | undefined,
  canRevealSecrets: boolean | undefined,
  t: ServerSettingsFormProps['t'],
  onChange: ServerSettingsFormProps['onChange'],
  onVisibilityPublicAttempt: ServerSettingsFormProps['onVisibilityPublicAttempt'],
) {
  const key = field.key;
  const v = Object.prototype.hasOwnProperty.call(values, key) ? values[key] : field.value;

  if (key === 'allow_commands') {
    return (
      <select
        className="input"
        value={String(v || 'admins-only')}
        disabled={disabled}
        onChange={(e) => onChange(key, e.target.value)}
      >
        <option value="true">{t('allow_commands_true')}</option>
        <option value="false">{t('allow_commands_false')}</option>
        <option value="admins-only">{t('allow_commands_admins_only')}</option>
      </select>
    );
  }

  if (key === 'visibility' && v && typeof v === 'object' && !Array.isArray(v)) {
    const vis = v as { public?: boolean; lan?: boolean };
    return (
      <div className="row settings-visibility-switches">
        <FccSwitch
          id="serverSettingsVisibilityPublic"
          className="settings-bool-cell"
          labelClassName="settings-bool-cell__label"
          checked={!!vis.public}
          disabled={disabled}
          onChange={(checked) => {
            if (checked && !onVisibilityPublicAttempt()) return;
            onChange(key, { ...vis, public: checked });
          }}
          label={
            t('server_settings_visibility_public') !== 'server_settings_visibility_public'
              ? t('server_settings_visibility_public')
              : 'Public'
          }
        />
        <FccSwitch
          id="serverSettingsVisibilityLan"
          className="settings-bool-cell"
          labelClassName="settings-bool-cell__label"
          checked={vis.lan !== false}
          disabled={disabled}
          onChange={(checked) => onChange(key, { ...vis, lan: checked })}
          label={
            t('server_settings_visibility_lan') !== 'server_settings_visibility_lan'
              ? t('server_settings_visibility_lan')
              : 'LAN'
          }
        />
      </div>
    );
  }

  if (key === 'tags') {
    const tagText = Array.isArray(v) ? v.map((x) => String(x)).join(', ') : String(v ?? '');
    return (
      <input
        className="input"
        autoComplete="off"
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        data-fcc-non-credential="1"
        placeholder="tag1, tag2, tag3"
        value={tagText}
        disabled={disabled}
        onChange={(e) => onChange(key, e.target.value)}
      />
    );
  }

  if (typeof field.value === 'boolean') {
    return (
      <FccSwitch
        id={`serverSettingsBool-${key}`}
        checked={!!v}
        disabled={disabled}
        onChange={(checked) => onChange(key, checked)}
      />
    );
  }

  if (field.value && typeof field.value === 'object' && !Array.isArray(field.value)) {
    const jsonVal = typeof v === 'string' ? v : JSON.stringify(v, null, 2);
    return (
      <textarea
        className="settings-json"
        autoComplete="off"
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        data-fcc-non-credential="1"
        value={jsonVal}
        disabled={disabled}
        onChange={(e) => onChange(key, e.target.value)}
      />
    );
  }

  if (key === 'token' || key === 'password' || key === 'game_password') {
    return (
      <SettingsPasswordField
        fieldKey={key}
        value={scalarDisplayValue(key, v)}
        disabled={disabled}
        canReveal={!!canRevealSecrets}
        maskWithTextSecurity={key === 'token'}
        t={t}
        onChange={(next) => onChange(key, next)}
      />
    );
  }

  const inputProps = {
    className: 'input',
    autoComplete: 'off' as const,
    'data-lpignore': 'true',
    'data-1p-ignore': 'true',
    'data-bwignore': 'true',
    'data-fcc-non-credential': '1',
    value: scalarDisplayValue(key, v),
    disabled,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(key, e.target.value),
  };

  if (key === 'username') {
    return (
      <input
        {...inputProps}
        name="fcc_nosave_factorio_portal_account"
        autoComplete="organization"
      />
    );
  }

  if (key === 'name') {
    return <input {...inputProps} placeholder={t('server_settings_placeholder_name')} />;
  }
  if (key === 'description') {
    return <input {...inputProps} placeholder={t('server_settings_placeholder_description')} />;
  }

  return <input {...inputProps} />;
}

function renderSection(
  cat: SettingCategory,
  items: SettingField[],
  props: ServerSettingsFormProps,
) {
  if (!items.length) return null;
  const { values, disabled, canRevealSecrets, strings, t, onChange, onVisibilityPublicAttempt } = props;

  const boolFields = items.filter((f) => isGameplayBoolField(cat, f));
  const rowFields = items.filter((f) => !isGameplayBoolField(cat, f));

  return (
    <section key={cat} className="settings-section">
      <h3 className="settings-section__title">{settingCategoryTitle(cat, t)}</h3>
      {rowFields.length > 0 && (
        <div className="settings-rows">
          {rowFields.map((field) => {
            const hint = settingHintForLabel(field.key, field.comments, t, strings);
            const isSecret = field.key === 'token' || field.key === 'password' || field.key === 'game_password';
            const control = renderFieldControl(
              field,
              values,
              disabled,
              canRevealSecrets,
              t,
              onChange,
              onVisibilityPublicAttempt,
            );
            return (
              <div key={field.key} className="settings-row">
                <label className="settings-row__label" title={hint || undefined}>
                  {settingLabel(field.key, t, strings)}
                </label>
                <div className="settings-row__control settings-row__control--split">
                  {isSecret ? (
                    canRevealSecrets ? (
                      control
                    ) : (
                      <>
                        <span className="settings-row__lead" />
                        {control}
                      </>
                    )
                  ) : (
                    <>
                      <span className="settings-row__lead" />
                      <span className="settings-row__field">{control}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {boolFields.length > 0 && (
        <div className="settings-bool-grid">
          {boolFields.map((field) => {
            const hint = settingHintForLabel(field.key, field.comments, t, strings);
            const v = Object.prototype.hasOwnProperty.call(values, field.key)
              ? values[field.key]
              : field.value;
            return (
              <FccSwitch
                key={field.key}
                id={`serverSettingsGameplayBool-${field.key}`}
                className="settings-bool-cell"
                labelClassName="settings-bool-cell__label"
                checked={!!v}
                disabled={disabled}
                onChange={(checked) => onChange(field.key, checked)}
                label={settingLabel(field.key, t, strings)}
                title={hint || undefined}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

export function ServerSettingsForm(props: ServerSettingsFormProps) {
  const fields = parseSettingFields(props.data);
  const grouped = groupFieldsByCategory(fields);
  const sections = new Map<SettingCategory, ReactNode>();

  CATEGORY_ORDER.forEach((cat) => {
    sections.set(cat, renderSection(cat, grouped.get(cat) || [], props));
  });

  const renderColumn = (order: SettingCategory[]) =>
    order.map((cat) => sections.get(cat)).filter(Boolean);

  const leftovers = CATEGORY_ORDER.filter(
    (cat) => !LEFT_COLUMN.includes(cat) && !RIGHT_COLUMN.includes(cat),
  );

  return (
    <form className="settings-form-isolate" autoComplete="off" noValidate onSubmit={(e) => e.preventDefault()}>
      <div className="settings-columns">
        <div className="settings-col">{renderColumn(LEFT_COLUMN)}</div>
        <div className="settings-col">{renderColumn(RIGHT_COLUMN)}</div>
        {leftovers.map((cat) => sections.get(cat))}
      </div>
    </form>
  );
}
