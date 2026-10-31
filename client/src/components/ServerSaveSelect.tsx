import {
  useState,
  useRef,
  useEffect,
  useMemo,
  type KeyboardEvent,
} from 'react';
import { IconChevronDown, IconCheck, IconSearch } from '@tabler/icons-react';
import {
  saveDisplayLabel,
  getSaveKind,
  getSaveTypeBadgeLabel,
  type SaveKind,
} from '../lib/saveUtils';

export interface SaveOptionItem {
  name?: string;
}

export interface ServerSaveSelectProps {
  id?: string;
  value: string;
  latestLabel: string;
  saves: SaveOptionItem[];
  disabled?: boolean;
  onChange: (value: string) => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

function resolveText(
  t: (key: string, ...args: (string | number)[]) => string,
  key: string,
  fallback: string,
): string {
  const val = t(key);
  return !val || val === key ? fallback : val;
}

export function ServerSaveSelect({
  id,
  value,
  latestLabel,
  saves,
  disabled = false,
  onChange,
  t,
}: ServerSaveSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    const list: {
      value: string;
      label: string;
      badge: string;
      kind: SaveKind | 'latest';
      isLatest: boolean;
    }[] = [
      {
        value: latestLabel,
        label: t('latest') || latestLabel,
        badge: '',
        kind: 'latest',
        isLatest: true,
      },
    ];
    for (const s of saves) {
      const name = String(s.name || '').trim();
      if (!name) continue;
      list.push({
        value: name,
        label: saveDisplayLabel(name),
        badge: getSaveTypeBadgeLabel(name, t, false),
        kind: getSaveKind(name),
        isLatest: false,
      });
    }
    return list;
  }, [latestLabel, saves, t]);

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.value.toLowerCase().includes(q) ||
        (opt.badge && opt.badge.toLowerCase().includes(q)),
    );
  }, [options, search]);

  const selectedOption = useMemo(() => {
    return options.find((opt) => opt.value === value);
  }, [options, value]);

  const currentLabel = useMemo(() => {
    if (selectedOption) return selectedOption.label;
    if (value === latestLabel || !value) {
      return t('latest') || latestLabel;
    }
    return saveDisplayLabel(value);
  }, [selectedOption, value, latestLabel, t]);

  const currentBadge = useMemo(() => {
    if (value === latestLabel || !value) {
      return '';
    }
    return selectedOption?.badge ?? getSaveTypeBadgeLabel(value, t, false);
  }, [selectedOption, value, latestLabel, t]);

  const currentKind = useMemo(() => {
    if (value === latestLabel || !value) {
      return 'latest';
    }
    return selectedOption?.kind ?? getSaveKind(value);
  }, [selectedOption, value, latestLabel]);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Focus search input when opened
  useEffect(() => {
    if (open) {
      setSearch('');
      const idx = options.findIndex((opt) => opt.value === value);
      setActiveIndex(idx >= 0 ? idx : 0);
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [open, options, value]);

  const selectOption = (optValue: string) => {
    onChange(optValue);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const handleDropdownKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : 0,
      );
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev > 0 ? prev - 1 : filteredOptions.length - 1,
      );
      return;
    }
    if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
        e.preventDefault();
        selectOption(filteredOptions[activeIndex].value);
      }
    }
  };

  // Scroll active option into view
  useEffect(() => {
    if (!open || activeIndex < 0 || !listRef.current) return;
    const activeEl = listRef.current.children[activeIndex] as
      | HTMLElement
      | undefined;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [open, activeIndex]);

  return (
    <div ref={containerRef} className="server-save-select">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className={`server-save-select__trigger${open ? ' is-open' : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('control_save_label')}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="server-save-select__trigger-content">
          <span
            className="server-save-select__trigger-label"
            title={currentLabel}
          >
            {currentLabel}
          </span>
          {currentBadge ? (
            <span
              className={`server-save-select__trigger-badge server-save-select__badge--${currentKind}`}
            >
              {currentBadge}
            </span>
          ) : null}
        </span>
        <IconChevronDown
          size={14}
          stroke={2}
          className="server-save-select__chevron"
        />
      </button>

      {open && (
        <div
          className="server-save-select__dropdown"
          role="listbox"
          onKeyDown={handleDropdownKeyDown}
        >
          <div className="server-save-select__dropdown-header">
            {resolveText(
              t,
              'control_save_choose_hint',
              'Выберите сохранение для запуска',
            )}
          </div>

          {options.length > 5 && (
            <div className="server-save-select__search">
              <IconSearch
                size={13}
                stroke={1.8}
                className="server-save-select__search-icon"
              />
              <input
                ref={searchInputRef}
                type="text"
                className="server-save-select__search-input"
                placeholder={resolveText(
                  t,
                  'search_placeholder',
                  'Поиск...',
                )}
                value={search}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => {
                  setSearch(e.target.value);
                  setActiveIndex(0);
                }}
              />
            </div>
          )}

          <div ref={listRef} className="server-save-select__list">
            {filteredOptions.length === 0 ? (
              <div className="server-save-select__empty">
                {resolveText(t, 'control_save_empty', 'Сохранений не найдено')}
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = value === opt.value;
                const isHighlighted = activeIndex === idx;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`server-save-select__option${
                      isSelected ? ' is-selected' : ''
                    }${isHighlighted ? ' is-highlighted' : ''}`}
                    onClick={() => selectOption(opt.value)}
                  >
                    <span className="server-save-select__option-val">
                      {isSelected && (
                        <IconCheck
                          size={13}
                          stroke={2.2}
                          className="server-save-select__check"
                        />
                      )}
                      <span
                        className="server-save-select__option-name"
                        title={opt.label}
                      >
                        {opt.label}
                      </span>
                    </span>
                    {opt.badge ? (
                      <span
                        className={`server-save-select__option-badge server-save-select__badge--${opt.kind}`}
                      >
                        {opt.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
