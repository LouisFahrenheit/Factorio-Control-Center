import { useMemo, useState } from 'react';
import { FccSwitch } from '../FccSwitch';
import { choiceLabelText, inferSettingValueKind, isSimpleValueEntry, modSettingValuesEqual, rowShouldUseChoiceCombo } from '../../lib/modSettingsUtils';
import type { ModSettingsSection, ModSettingSchemaEntry } from '../../types/modSettings';

interface SettingFieldProps {
  section: ModSettingsSection;
  settingKey: string;
  entry: unknown;
  meta?: ModSettingSchemaEntry;
  readOnly: boolean;
  t: (key: string, ...args: (string | number)[]) => string;
  onChange: (section: ModSettingsSection, key: string, entry: unknown) => void;
}

function rgbaToHex(v: { r: number; g: number; b: number; a: number }): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n * 255)));
  return `#${clamp(v.r).toString(16).padStart(2, '0')}${clamp(v.g).toString(16).padStart(2, '0')}${clamp(v.b).toString(16).padStart(2, '0')}`;
}

function hexToRgba(hex: string, alpha: number): { r: number; g: number; b: number; a: number } {
  const h = hex.replace('#', '');
  if (h.length !== 6) return { r: 1, g: 1, b: 1, a: alpha };
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
    a: alpha,
  };
}

function SettingNameLabel({
  displayName,
  settingKey,
  description,
}: {
  displayName: string;
  settingKey: string;
  description: string;
}) {
  const showTechnicalKey = displayName.trim().toLowerCase() === settingKey.trim().toLowerCase();
  const titleParts = [description.trim(), !showTechnicalKey ? settingKey : ''].filter(Boolean);
  return (
    <span className="mod-settings-row__name" title={titleParts.length ? titleParts.join('\n\n') : undefined}>
      {displayName}
      {showTechnicalKey ? <span className="mod-settings-row__key">{settingKey}</span> : null}
    </span>
  );
}

export function SettingField({ section, settingKey, entry, meta, readOnly, t, onChange }: SettingFieldProps) {
  const displayName = meta?.display_name || settingKey;
  const description = meta?.description || '';
  const { kind, value } = useMemo(() => inferSettingValueKind(entry), [entry]);
  const [jsonDraft, setJsonDraft] = useState('');
  const [jsonError, setJsonError] = useState('');

  const allowedChoices = useMemo(() => {
    if (!meta?.allowed_values?.length || !isSimpleValueEntry(entry)) return null;
    if (!rowShouldUseChoiceCombo(entry.value, meta.allowed_values.map((x) => x.value))) return null;
    let choices = [...meta.allowed_values];
    if (!choices.some((c) => modSettingValuesEqual(c.value, entry.value))) {
      choices = [{ value: entry.value, label: String(entry.value) }, ...choices];
    }
    return choices;
  }, [entry, meta?.allowed_values]);

  if (allowedChoices) {
    const current = isSimpleValueEntry(entry) ? entry.value : undefined;
    return (
      <label className="mod-settings-row">
        <SettingNameLabel displayName={displayName} settingKey={settingKey} description={description} />
        <select
          className="input mod-settings-row__input"
          disabled={readOnly}
          value={choicesIndexValue(allowedChoices, current)}
          onChange={(e) => {
            const idx = parseInt(e.target.value, 10);
            const picked = allowedChoices[idx];
            if (picked) onChange(section, settingKey, { value: picked.value });
          }}
        >
          {allowedChoices.map((choice, idx) => (
            <option key={idx} value={String(idx)}>
              {choiceLabelText(choice.label, t)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (kind === 'json_entry') {
    const text = jsonDraft || JSON.stringify(entry, null, 2);
    return (
      <div className="mod-settings-row mod-settings-row--json">
        <SettingNameLabel displayName={displayName} settingKey={settingKey} description={description} />
        <textarea
          className="input mod-settings-row__json"
          rows={4}
          readOnly={readOnly}
          value={text}
          onChange={(e) => {
            setJsonDraft(e.target.value);
            setJsonError('');
          }}
          onBlur={() => {
            if (readOnly) return;
            const raw = (jsonDraft || text).trim();
            if (!raw) return;
            try {
              onChange(section, settingKey, JSON.parse(raw));
              setJsonDraft('');
              setJsonError('');
            } catch (e) {
              setJsonError(e instanceof Error ? e.message : String(e));
            }
          }}
        />
        {jsonError ? <div className="mod-settings-row__error">{jsonError}</div> : null}
      </div>
    );
  }

  const setValue = (nextValue: unknown) => {
    onChange(section, settingKey, { value: nextValue });
  };

  if (kind === 'bool') {
    const inputId = `modSettingBool-${section}-${settingKey}`;
    return (
      <FccSwitch
        id={inputId}
        className="mod-settings-row mod-settings-row--bool"
        labelClassName="mod-settings-row__bool-label"
        checked={!!value}
        disabled={readOnly}
        onChange={setValue}
        label={<SettingNameLabel displayName={displayName} settingKey={settingKey} description={description} />}
      />
    );
  }

  if (kind === 'uint64') {
    const n = Number((value as { v?: number })?.v ?? 0);
    return (
      <label className="mod-settings-row">
        <SettingNameLabel displayName={displayName} settingKey={settingKey} description={description} />
        <input
          type="number"
          className="input input--narrow mod-settings-row__input"
          min={0}
          step={1}
          disabled={readOnly}
          value={Number.isFinite(n) ? String(n) : '0'}
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10);
            setValue({ '!pt': 'uint64', v: Number.isFinite(parsed) ? parsed : 0 });
          }}
        />
      </label>
    );
  }

  if (kind === 'color' && value && typeof value === 'object') {
    const rgba = value as { r: number; g: number; b: number; a: number };
    return (
      <div className="mod-settings-row mod-settings-row--color">
        <SettingNameLabel displayName={displayName} settingKey={settingKey} description={description} />
        <div className="mod-settings-row__color">
          <input
            type="color"
            disabled={readOnly}
            value={rgbaToHex(rgba)}
            onChange={(e) => setValue(hexToRgba(e.target.value, rgba.a))}
            title={t('mod_settings_color_pick')}
          />
          <input
            type="number"
            className="input input--narrow"
            min={0}
            max={1}
            step={0.01}
            disabled={readOnly}
            value={rgba.a}
            onChange={(e) => {
              const a = parseFloat(e.target.value);
              setValue({ ...rgba, a: Number.isFinite(a) ? a : rgba.a });
            }}
            title={t('mod_settings_alpha_label')}
          />
        </div>
      </div>
    );
  }

  if (kind === 'json_value') {
    const text = jsonDraft || JSON.stringify(value, null, 2);
    return (
      <div className="mod-settings-row mod-settings-row--json">
        <SettingNameLabel displayName={displayName} settingKey={settingKey} description={description} />
        <textarea
          className="input mod-settings-row__json"
          rows={3}
          readOnly={readOnly}
          value={text}
          onChange={(e) => {
            setJsonDraft(e.target.value);
            setJsonError('');
          }}
          onBlur={() => {
            if (readOnly) return;
            const raw = (jsonDraft || text).trim();
            if (!raw) return;
            try {
              setValue(JSON.parse(raw));
              setJsonDraft('');
              setJsonError('');
            } catch (e) {
              setJsonError(e instanceof Error ? e.message : String(e));
            }
          }}
        />
        {jsonError ? <div className="mod-settings-row__error">{jsonError}</div> : null}
      </div>
    );
  }

  const inputType = kind === 'int' || kind === 'float' ? 'number' : 'text';
  const inputValue = value == null ? '' : String(value);
  return (
    <label className="mod-settings-row">
      <SettingNameLabel displayName={displayName} settingKey={settingKey} description={description} />
      <input
        type={inputType}
        className="input mod-settings-row__input"
        step={kind === 'float' ? 'any' : '1'}
        disabled={readOnly}
        value={inputValue}
        onChange={(e) => {
          const raw = e.target.value;
          if (kind === 'int') {
            const parsed = parseInt(raw, 10);
            setValue(Number.isFinite(parsed) ? parsed : 0);
            return;
          }
          if (kind === 'float') {
            const parsed = parseFloat(raw);
            setValue(Number.isFinite(parsed) ? parsed : 0);
            return;
          }
          setValue(raw);
        }}
      />
    </label>
  );
}

function choicesIndexValue(choices: { value: unknown }[], current: unknown): string {
  const idx = choices.findIndex((c) => modSettingValuesEqual(c.value, current));
  return String(idx >= 0 ? idx : 0);
}
