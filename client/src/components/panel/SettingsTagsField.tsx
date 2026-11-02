import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { IconX } from '@tabler/icons-react';

interface SettingsTagsFieldProps {
  tags: string[];
  disabled?: boolean;
  placeholder?: string;
  onChange: (tags: string[]) => void;
}

export function SettingsTagsField({
  tags,
  disabled,
  placeholder = 'Add tag...',
  onChange,
}: SettingsTagsFieldProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Convert vertical mouse wheel into horizontal scroll when mouse is over tags
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth > el.clientWidth && e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  // Auto-scroll to the end when tags are added
  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollLeft = el.scrollWidth;
    }
  }, [tags.length]);

  function addTag(raw: string) {
    const candidate = raw.trim();
    if (!candidate) return;

    // Support comma-separated strings if pasted or typed
    const parts = candidate
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length === 0) return;

    const lowerExisting = new Set(tags.map((t) => t.toLowerCase()));
    const toAdd = parts.filter((p) => !lowerExisting.has(p.toLowerCase()));

    if (toAdd.length > 0) {
      onChange([...tags, ...toAdd]);
    }
    setInputValue('');
  }

  function removeTag(index: number) {
    if (disabled) return;
    const next = tags.filter((_, i) => i !== index);
    onChange(next);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;

    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      e.preventDefault();
      removeTag(tags.length - 1);
    }
  }

  function handleBlur() {
    if (inputValue.trim()) {
      addTag(inputValue);
    }
  }

  return (
    <div
      ref={containerRef}
      className={`settings-tags-wrap${disabled ? ' settings-tags-wrap--disabled' : ''}`}
      onClick={() => {
        if (!disabled) {
          inputRef.current?.focus();
        }
      }}
    >
      {tags.map((tag, idx) => (
        <span key={`${tag}-${idx}`} className="settings-tag-chip">
          <span className="settings-tag-chip__text">{tag}</span>
          {!disabled && (
            <button
              type="button"
              className="settings-tag-chip__del"
              aria-label={`Remove tag ${tag}`}
              onClick={(ev) => {
                ev.stopPropagation();
                removeTag(idx);
              }}
            >
              <IconX size={12} stroke={2.5} />
            </button>
          )}
        </span>
      ))}
      <input
        ref={inputRef}
        id="inpServerSettingsTagsInput"
        name="tag_search_chips_query"
        type="search"
        role="searchbox"
        className="settings-tags-input"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-autocomplete="none"
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        data-protonpass-ignore="true"
        data-dashlane-ignore="true"
        data-form-type="other"
        data-fcc-non-credential="1"
        value={inputValue}
        disabled={disabled}
        placeholder={tags.length === 0 ? placeholder : ''}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
    </div>
  );
}
