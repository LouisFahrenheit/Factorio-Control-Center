import { motion } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { FactorioUpdateApi } from '../../hooks/useFactorioUpdate';
import type { ServerLogHistoryApi } from '../../hooks/useServerLogHistory';
import type { useServerControl } from '../../hooks/useServerControl';
import {
  ensureLogStickyFollow,
  formatManagerLogHtml,
  hasActiveSelectionInside,
  scrollLogIfFollowing,
} from '../../lib/logUtils';
import { PANEL_BLOCK_VARIANTS, PANEL_TAB_VARIANTS, listWrapVariants } from '../../lib/motionPresets';
import { saveDisplayLabel } from '../../lib/saveUtils';
import { webEffectsReduced } from '../../theme/webEffects';
import { AppIcon } from '../AppIcon';
import { FactorioUpdateModal } from './FactorioUpdateModal';
import { ServerLogHistoryModal } from './ServerLogHistoryModal';

type Control = ReturnType<typeof useServerControl>;

interface ControlTabProps {
  control: Control;
  factorioUpdate: FactorioUpdateApi;
  logHistory: ServerLogHistoryApi;
  reformatLogTimestamps?: boolean;
  blockUpdates: boolean;
  canCommands: boolean;
  enterDelay?: number;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function ControlTab({
  control,
  factorioUpdate,
  logHistory,
  reformatLogTimestamps = true,
  blockUpdates,
  canCommands,
  enterDelay = 0,
  t,
}: ControlTabProps) {
  const reduced = webEffectsReduced();
  const wrapVariants = reduced ? undefined : listWrapVariants(enterDelay);
  const blockVariants = reduced ? undefined : PANEL_BLOCK_VARIANTS;
  const sectionVariants = reduced ? undefined : PANEL_TAB_VARIANTS;
  const [rconInput, setRconInput] = useState('');
  const [ipTouched, setIpTouched] = useState(false);
  const [portTouched, setPortTouched] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const logFormatOptions = useMemo(
    () => ({ reformatTimestamps: reformatLogTimestamps !== false }),
    [reformatLogTimestamps],
  );
  const logHtml = useMemo(
    () => formatManagerLogHtml(control.logLines, logFormatOptions),
    [control.logLines, logFormatOptions],
  );

  useEffect(() => {
    ensureLogStickyFollow(logRef.current);
  }, []);

  useLayoutEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (hasActiveSelectionInside(el)) {
      el.innerHTML = logHtml;
      return;
    }
    el.innerHTML = logHtml;
    scrollLogIfFollowing(el);
  }, [logHtml]);

  function onRconKey(ev: KeyboardEvent<HTMLInputElement>) {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      void control.sendRcon(rconInput).then(() => setRconInput(''));
    }
  }

  const showStopIcon = control.running || control.kind === 'stopping';
  const showIpError = ipTouched && control.ipError === 'invalid_ip';
  const showPortError = portTouched && control.portError === 'invalid_port';
  const ipErrorMsg = t('control_invalid_ip');
  const portErrorMsg = t('instances_error_invalid_port');

  return (
    <motion.div
      id="tabPanelMain"
      className="tab-panel tab-panel--active control-tab"
      role="tabpanel"
      aria-labelledby="tabBtnMain"
      variants={wrapVariants}
      initial={reduced ? false : 'hidden'}
      animate={reduced ? undefined : 'show'}
    >
      <motion.div
        className="control-tab__stack"
        variants={sectionVariants}
        initial={reduced ? false : 'hidden'}
        animate={reduced ? undefined : 'show'}
      >
        <motion.section className="control-tab__top" variants={blockVariants}>
          <div className="control-tab__card control-tab__card--launch">
            <div className="control-tab__launch-grid">
              <label
                className={
                  'control-tab__compact-field control-tab__compact-field--ip' +
                  (showIpError ? ' control-tab__compact-field--invalid' : '')
                }
                htmlFor="inpIp"
                title={showIpError ? ipErrorMsg : undefined}
              >
                <span className="control-tab__compact-label" data-i18n="ip_label">
                  {t('ip_label')}
                </span>
                <input
                  type="text"
                  id="inpIp"
                  className="input control-tab__compact-input control-tab__compact-input--ip"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={45}
                  value={control.ip}
                  disabled={control.busy}
                  aria-invalid={showIpError}
                  aria-describedby={showIpError ? 'inpIpError' : undefined}
                  onBlur={() => setIpTouched(true)}
                  onChange={(e) => {
                    control.setIp(e.target.value);
                    control.scheduleNetworkSave();
                  }}
                />
              </label>
              <label
                className={
                  'control-tab__compact-field control-tab__compact-field--port' +
                  (showPortError ? ' control-tab__compact-field--invalid' : '')
                }
                htmlFor="inpPort"
                title={showPortError ? portErrorMsg : undefined}
              >
                <span className="control-tab__compact-label" data-i18n="port_label">
                  {t('port_label')}
                </span>
                <input
                  type="text"
                  id="inpPort"
                  className="input control-tab__compact-input control-tab__compact-input--port"
                  autoComplete="off"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={5}
                  value={control.port}
                  disabled={control.busy}
                  aria-invalid={showPortError}
                  aria-describedby={showPortError ? 'inpPortError' : undefined}
                  onBlur={() => setPortTouched(true)}
                  onChange={(e) => {
                    control.setPort(e.target.value.replace(/\D/g, ''));
                    control.scheduleNetworkSave();
                  }}
                />
              </label>
              <label className="control-tab__compact-field control-tab__compact-field--save" htmlFor="selSave">
                <span className="control-tab__compact-label">{t('control_save_label')}</span>
                <select
                  id="selSave"
                  className="input control-tab__compact-input"
                  value={control.save}
                  disabled={control.busy}
                  onChange={(e) => control.setSave(e.target.value)}
                >
                  <option value={control.latestLabel}>{t('latest') || control.latestLabel}</option>
                  {control.saves.map((s) => (
                    <option key={s.name} value={s.name}>
                      {saveDisplayLabel(s.name || '')}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn--toolbar-icon control-tab__launch-refresh"
                id="btnReloadSaves"
                data-i18n="saves_manager_refresh"
                title={t('saves_manager_refresh')}
                aria-label={t('saves_manager_refresh')}
                disabled={control.busy}
                onClick={() => void control.reloadSaves()}
              >
                <AppIcon name="refresh" size={18} />
              </button>
            </div>
            {(showIpError || showPortError) && (
              <div className="control-tab__launch-errors" role="alert">
                {showIpError && (
                  <p id="inpIpError" className="control-tab__launch-error">
                    {ipErrorMsg}
                  </p>
                )}
                {showPortError && (
                  <p id="inpPortError" className="control-tab__launch-error">
                    {portErrorMsg}
                  </p>
                )}
              </div>
            )}
            <div className="control-tab__console-row">
              {canCommands && (
                <div className="control-tab__rcon">
                  <label htmlFor="inpControlRcon" className="control-tab__field-label" data-i18n="console_label">
                    {t('console_label')}
                  </label>
                  <input
                    type="text"
                    id="inpControlRcon"
                    className="input control-rcon__input"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t('console_placeholder')}
                    disabled={!control.running || control.maintLocked}
                    value={rconInput}
                    onChange={(e) => setRconInput(e.target.value)}
                    onKeyDown={onRconKey}
                  />
                </div>
              )}
              <button
                type="button"
                className="btn btn--with-icon control-tab__history-btn"
                id="btnServerLogHistory"
                data-i18n="server_log_history_btn"
                onClick={() => void logHistory.openDialog()}
              >
                <AppIcon name="history" size={16} />
                {t('server_log_history_btn')}
              </button>
            </div>
          </div>

          <div className="control-tab__card control-tab__card--actions">
            <div className="control-tab__action-grid">
              <button
                type="button"
                className="btn btn--with-icon control-tab__action-btn"
                id="btnStartStop"
                disabled={control.startStopDisabled}
                onClick={() => void control.toggleStartStop()}
              >
                <AppIcon name={showStopIcon ? 'stop' : 'start'} size={16} />
                {control.startStopLabel}
              </button>
              <button
                type="button"
                className="btn btn--with-icon control-tab__action-btn"
                id="btnRestartServer"
                data-i18n="restart_server_btn"
                disabled={control.kind !== 'running' || control.maintLocked}
                onClick={() => void control.restart().catch(() => {})}
              >
                <AppIcon name="restart" size={16} />
                {t('restart_server_btn')}
              </button>
              <button
                type="button"
                className="btn btn--danger btn--with-icon control-tab__action-btn"
                id="btnKill"
                data-i18n="kill_btn"
                disabled={
                  !(control.running || control.kind === 'starting' || control.kind === 'stopping') ||
                  control.maintLocked
                }
                onClick={() => void control.kill().catch(() => {})}
              >
                <AppIcon name="kill" size={16} />
                {t('kill_btn')}
              </button>
              <button
                type="button"
                className="btn btn--with-icon control-tab__action-btn"
                id="btnSaveGame"
                data-i18n="save_game_btn"
                disabled={!control.running}
                onClick={() => void control.saveGame().catch(() => {})}
              >
                <AppIcon name="save" size={16} />
                {t('save_game_btn')}
              </button>
              <button
                type="button"
                className="btn btn--with-icon control-tab__action-btn"
                id="btnBackup"
                data-i18n="backup_btn"
                disabled={!control.running}
                onClick={() => void control.backup().catch(() => {})}
              >
                <AppIcon name="file_copy" size={16} />
                {t('backup_btn')}
              </button>
              <button
                type="button"
                className={
                  'btn btn--with-icon control-tab__action-btn' +
                  (factorioUpdate.updateAvailable ? ' btn--update-available' : '')
                }
                id="btnFactorioUpdate"
                data-i18n="about_check_factorio_updates"
                disabled={control.busy || blockUpdates || factorioUpdate.checking}
                onClick={() => void factorioUpdate.openUpdateFlow()}
              >
                <AppIcon name="update" size={16} />
                {t('about_check_factorio_updates')}
              </button>
            </div>
          </div>
        </motion.section>

        <motion.section className="panel panel--control-log control-tab__log" variants={blockVariants}>
          <div className="panel__body">
            <pre
              id="managerLog"
              ref={logRef}
              className="log-view control-tab__log-view"
              tabIndex={0}
            />
          </div>
        </motion.section>
      </motion.div>

      <FactorioUpdateModal factorioUpdate={factorioUpdate} t={t} />
      <ServerLogHistoryModal logHistory={logHistory} t={t} />
    </motion.div>
  );
}
