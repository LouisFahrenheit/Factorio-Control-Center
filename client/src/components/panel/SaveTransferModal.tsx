import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { FccCheck } from '../FccCheck';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { SavesApi } from '../../hooks/useSaves';
import type { InstancesListResponse } from '../../types/instance';
import { saveDisplayLabel } from '../../lib/saveUtils';

interface SaveTransferModalProps {
  saves: SavesApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

function getServerDotStyle(status?: string) {
  const st = String(status || '').toLowerCase();
  if (st === 'running') {
    return {
      background: 'var(--accent, #22c55e)',
      boxShadow: '0 0 6px rgba(34, 197, 94, 0.6)',
    };
  }
  if (st === 'starting' || st === 'stopping') {
    return {
      background: '#f59f00',
      boxShadow: '0 0 6px rgba(245, 159, 0, 0.6)',
    };
  }
  if (st === 'maintenance') {
    return {
      background: '#eab308',
      boxShadow: '0 0 6px rgba(234, 179, 8, 0.6)',
    };
  }
  return {
    background: 'var(--text-muted, #71717a)',
    opacity: 0.7,
  };
}

export function SaveTransferModal({ saves, t }: SaveTransferModalProps) {
  const nameInputRef = useRef<HTMLInputElement>(null);
  const serverDropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const instancesQuery = useQuery({
    queryKey: ['instances'],
    queryFn: () => api<InstancesListResponse>('/api/instances'),
    enabled: saves.transferOpen,
  });

  const allServers = instancesQuery.data?.items || [];
  const currentServerId = String(instancesQuery.data?.selectedId || '');

  // Filter out current active server
  const otherServers = useMemo(
    () => allServers.filter((s) => s.id !== currentServerId),
    [allServers, currentServerId],
  );

  const selectedServer = useMemo(
    () => otherServers.find((s) => s.id === saves.transferTargetServerId),
    [otherServers, saves.transferTargetServerId],
  );

  // Auto-select first available target server if none is selected
  useEffect(() => {
    if (!saves.transferOpen) return;
    if (!saves.transferTargetServerId && otherServers.length > 0) {
      saves.setTransferTargetServerId(otherServers[0].id);
    }
  }, [otherServers, saves.transferOpen, saves.transferTargetServerId, saves]);

  // Focus target name input on open
  useEffect(() => {
    if (!saves.transferOpen || saves.transferSubmitting) return;
    const id = window.setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [saves.transferOpen, saves.transferSubmitting]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (serverDropdownRef.current && !serverDropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  if (!saves.transferOpen) return null;

  const currentSaveName = saveDisplayLabel(saves.transferSourceName) || '—';
  const isRunningActive = !!saves.rows.find((r) => r.name === saves.transferSourceName)?.is_running_active;
  const noTargets = otherServers.length === 0;

  return (
    <ModalBackdrop open id="saveTransferBackdrop" onClose={saves.closeTransferDialog}>
      <div
        className="fu-modal modpack-import-dialog modpack-form-dialog save-transfer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="saveTransferDlgHeading"
        aria-busy={saves.transferSubmitting}
        style={{ maxWidth: 520 }}
      >
        <div className="fu-modal__header modpack-form-dialog__header" id="saveTransferDlgHeading">
          <AppIcon name="folder_copy" size={18} className="modpack-form-dialog__header-icon" />
          <span>{t('saves_manager_transfer_title')}</span>
        </div>

        <div className="fu-modal__body modpack-form-dialog__body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Current save file */}
          <div className="modpack-form-dialog__pack">
            <span className="modpack-form-dialog__pack-label">
              {t('saves_manager_transfer_current_save')}
            </span>
            <span className="modpack-form-dialog__pack-name" id="saveTransferDlgCurrentName">
              {currentSaveName}
            </span>
          </div>

          {/* Target server select with colored status circle */}
          <div className="modpack-form-dialog__field-card" ref={serverDropdownRef} style={{ position: 'relative' }}>
            <span className="modpack-form-dialog__field-label">
              {t('saves_manager_transfer_target_server')}
            </span>
            {noTargets ? (
              <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
                {t('saves_manager_transfer_no_target_servers')}
              </p>
            ) : (
              <>
                <button
                  type="button"
                  id="saveTransferTargetServerBtn"
                  className="input"
                  disabled={saves.transferSubmitting}
                  onClick={() => setDropdownOpen((prev) => !prev)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: saves.transferSubmitting ? 'not-allowed' : 'pointer',
                    width: '100%',
                    marginTop: 4,
                    textAlign: 'left',
                    padding: '8px 12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        flexShrink: 0,
                        ...getServerDotStyle(selectedServer?.status),
                      }}
                    />
                    <span style={{ fontWeight: 500 }}>
                      {selectedServer?.name || selectedServer?.id || '—'}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', opacity: 0.6, transform: dropdownOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s ease' }}>
                    ▼
                  </span>
                </button>

                {dropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 20,
                      marginTop: 4,
                      background: 'var(--bg-input, #1e1f22)',
                      border: '1px solid var(--border-dark, rgba(255,255,255,0.15))',
                      borderRadius: 6,
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
                      maxHeight: 200,
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    {otherServers.map((s) => {
                      const isSelected = s.id === saves.transferTargetServerId;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            saves.setTransferTargetServerId(s.id);
                            setDropdownOpen(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '9px 12px',
                            border: 'none',
                            background: isSelected ? 'var(--bg-card-hover, rgba(255,255,255,0.08))' : 'transparent',
                            color: 'inherit',
                            cursor: 'pointer',
                            textAlign: 'left',
                            width: '100%',
                            transition: 'background-color 0.15s ease',
                          }}
                        >
                          <span
                            style={{
                              width: 9,
                              height: 9,
                              borderRadius: '50%',
                              flexShrink: 0,
                              ...getServerDotStyle(s.status),
                            }}
                          />
                          <span style={{ flex: 1, fontWeight: isSelected ? 600 : 400 }}>
                            {s.name || s.id}
                          </span>
                          {isSelected && (
                            <span style={{ color: 'var(--accent, #22c55e)', fontWeight: 'bold' }}>✓</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Transfer Mode: Copy vs Move */}
          <div className="modpack-form-dialog__field-card">
            <span className="modpack-form-dialog__field-label">
              {t('saves_manager_transfer_mode_label')}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  cursor: 'pointer',
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: saves.transferMode === 'copy' ? 'var(--bg-card-hover, rgba(255,255,255,0.05))' : 'transparent',
                  border: '1px solid ' + (saves.transferMode === 'copy' ? 'var(--border-focus, var(--accent))' : 'var(--border-dark, rgba(255,255,255,0.1))'),
                }}
              >
                <input
                  type="radio"
                  name="saveTransferMode"
                  value="copy"
                  checked={saves.transferMode === 'copy'}
                  disabled={saves.transferSubmitting}
                  onChange={() => saves.setTransferMode('copy')}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    {t('saves_manager_transfer_mode_copy')}
                  </div>
                  <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>
                    {t('saves_manager_transfer_mode_copy_desc')}
                  </div>
                </div>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  cursor: isRunningActive ? 'not-allowed' : 'pointer',
                  opacity: isRunningActive ? 0.6 : 1,
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: saves.transferMode === 'move' ? 'var(--bg-card-hover, rgba(255,255,255,0.05))' : 'transparent',
                  border: '1px solid ' + (saves.transferMode === 'move' ? 'var(--border-focus, var(--accent))' : 'var(--border-dark, rgba(255,255,255,0.1))'),
                }}
              >
                <input
                  type="radio"
                  name="saveTransferMode"
                  value="move"
                  checked={saves.transferMode === 'move'}
                  disabled={saves.transferSubmitting || isRunningActive}
                  onChange={() => saves.setTransferMode('move')}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    {t('saves_manager_transfer_mode_move')}
                  </div>
                  <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>
                    {t('saves_manager_transfer_mode_move_desc')}
                  </div>
                  {isRunningActive && (
                    <div style={{ color: 'var(--color-warning, #f59f00)', fontSize: '0.78rem', marginTop: 3 }}>
                      {t('saves_manager_transfer_mode_move_running_warn')}
                    </div>
                  )}
                </div>
              </label>
            </div>
          </div>

          {/* Target Save Name */}
          <label className="modpack-form-dialog__field-card" htmlFor="saveTransferTargetName">
            <span className="modpack-form-dialog__field-label">
              {t('saves_manager_transfer_name_label')}
            </span>
            <input
              ref={nameInputRef}
              type="text"
              id="saveTransferTargetName"
              className="input"
              maxLength={120}
              autoComplete="off"
              spellCheck={false}
              value={saves.transferTargetName}
              disabled={saves.transferSubmitting}
              onChange={(e) => saves.setTransferTargetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void saves.submitTransfer();
                }
              }}
              style={{ marginTop: 4 }}
            />
          </label>

          {/* Overwrite Checkbox */}
          <div>
            <FccCheck
              id="saveTransferOverwrite"
              checked={saves.transferOverwrite}
              disabled={saves.transferSubmitting}
              onChange={(v) => saves.setTransferOverwrite(v)}
              label={t('saves_manager_transfer_overwrite_cb')}
            />
          </div>

          {/* Error Message */}
          {saves.transferError && (
            <p id="saveTransferDlgError" className="modpack-import-dialog__error" aria-live="polite" style={{ margin: 0 }}>
              {saves.transferError}
            </p>
          )}
        </div>

        <div className="fu-modal__footer modpack-form-dialog__footer">
          <CancelButton
            id="saveTransferDlgCancel"
            disabled={saves.transferSubmitting}
            onClick={saves.closeTransferDialog}
            t={t}
          />
          <button
            type="button"
            className="btn btn--primary btn--with-icon"
            id="saveTransferDlgOk"
            disabled={saves.transferSubmitting || noTargets}
            onClick={() => void saves.submitTransfer()}
          >
            <AppIcon name="folder_copy" size={16} />
            {saves.transferSubmitting
              ? t('saves_manager_transfer_submitting')
              : t('saves_manager_transfer_submit')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
