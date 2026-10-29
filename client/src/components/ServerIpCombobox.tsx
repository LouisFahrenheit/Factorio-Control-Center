import {
  useState,
  useRef,
  useEffect,
  useMemo,
  type KeyboardEvent,
} from 'react';
import { IconChevronDown, IconCheck } from '@tabler/icons-react';
import { useHostIps } from '../hooks/useHostIps';

export interface ServerIpComboboxProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onSelectOption?: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  className?: string;
  maxLength?: number;
  placeholder?: string;
  ariaInvalid?: boolean;
  ariaDescribedby?: string;
  hostIps?: string[];
  placement?: 'top' | 'bottom';
  t: (key: string, ...args: (string | number)[]) => string;
}

function isLanIp(ip: string): boolean {
  return (
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith('169.254.')
  );
}

export function ServerIpCombobox({
  id,
  value,
  onChange,
  onSelectOption,
  onBlur,
  disabled = false,
  className,
  maxLength = 45,
  placeholder,
  ariaInvalid,
  ariaDescribedby,
  hostIps,
  placement = 'bottom',
  t,
}: ServerIpComboboxProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [directIps, setDirectIps] = useState<string[]>([]);
  const fetchedHostIps = useHostIps();

  useEffect(() => {
    let active = true;
    const loadIps = async () => {
      try {
        const res = await fetch('/api/host-ips');
        if (res.ok) {
          const json = (await res.json()) as { host_ips?: string[] };
          if (active && Array.isArray(json.host_ips) && json.host_ips.length > 0) {
            setDirectIps(json.host_ips);
            return;
          }
        }
      } catch {
        /* try fallback */
      }
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const json = (await res.json()) as { host_ips?: string[] };
          if (active && Array.isArray(json.host_ips) && json.host_ips.length > 0) {
            setDirectIps(json.host_ips);
          }
        }
      } catch {
        /* ignore */
      }
    };
    void loadIps();
    return () => {
      active = false;
    };
  }, []);

  const effectiveHostIps = useMemo(() => {
    const set = new Set<string>();
    if (Array.isArray(hostIps)) {
      for (const ip of hostIps) {
        const s = String(ip || '').trim();
        if (s && s !== '0.0.0.0') set.add(s);
      }
    }
    if (Array.isArray(fetchedHostIps)) {
      for (const ip of fetchedHostIps) {
        const s = String(ip || '').trim();
        if (s && s !== '0.0.0.0') set.add(s);
      }
    }
    for (const ip of directIps) {
      const s = String(ip || '').trim();
      if (s && s !== '0.0.0.0') set.add(s);
    }
    return Array.from(set);
  }, [hostIps, fetchedHostIps, directIps]);

  // Options: 0.0.0.0 first, then host IPs
  const options = useMemo(() => {
    return ['0.0.0.0', ...effectiveHostIps];
  }, [effectiveHostIps]);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const selectOption = (opt: string) => {
    onChange(opt);
    if (onSelectOption) {
      onSelectOption(opt);
    }
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
      } else {
        setActiveIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (open) {
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
      }
      return;
    }

    if (e.key === 'Enter') {
      if (open && activeIndex >= 0 && activeIndex < options.length) {
        e.preventDefault();
        selectOption(options[activeIndex]);
      }
      return;
    }

    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    }
  };

  const getOptionBadge = (opt: string) => {
    if (opt === '0.0.0.0') {
      return t('control_ip_all_interfaces') || 'All interfaces';
    }
    if (isLanIp(opt)) {
      return t('control_ip_lan') || 'LAN';
    }
    return t('control_ip_host') || 'Host';
  };

  return (
    <div ref={containerRef} className="server-ip-combobox">
      <input
        ref={inputRef}
        type="text"
        id={id}
        className={className}
        autoComplete="off"
        spellCheck={false}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
        onBlur={onBlur}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onKeyDown={handleKeyDown}
      />
      <button
        type="button"
        className={`server-ip-combobox__toggle${open ? ' is-open' : ''}`}
        tabIndex={-1}
        aria-label={t('control_ip_choose_hint')}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
          if (!open) {
            const idx = options.indexOf(value.trim());
            setActiveIndex(idx >= 0 ? idx : 0);
          }
        }}
      >
        <IconChevronDown size={14} stroke={2} />
      </button>

      {open && (
        <div
          ref={listRef}
          className={`server-ip-combobox__dropdown server-ip-combobox__dropdown--${placement}`}
          role="listbox"
        >
          <div className="server-ip-combobox__dropdown-header">
            {t('control_ip_choose_hint')}
          </div>
          {options.map((opt, idx) => {
            const isSelected = value.trim() === opt;
            const isHighlighted = activeIndex === idx;
            return (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`server-ip-combobox__option${isSelected ? ' is-selected' : ''}${
                  isHighlighted ? ' is-highlighted' : ''
                }`}
                onClick={() => selectOption(opt)}
              >
                <span className="server-ip-combobox__option-val">
                  {isSelected && <IconCheck size={13} className="server-ip-combobox__check" />}
                  <span>{opt}</span>
                </span>
                <span className="server-ip-combobox__option-badge">
                  {getOptionBadge(opt)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
