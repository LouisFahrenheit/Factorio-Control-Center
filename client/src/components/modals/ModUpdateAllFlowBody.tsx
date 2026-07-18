import { useCallback, useState } from 'react';
import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { ModDependenciesConfirmBody } from './ModDependenciesConfirmBody';
import { ModGameVersionConfirmFooter } from './ModGameVersionConfirmBody';
import type { ModInstallConflictInfo } from '../../types/modConflict';
import type { ModInstallPlan } from '../../types/modJob';
import { localizeModError, modsNeedingGameLinesFromPlan } from '../../lib/modErrorUtils';
import { installConflictsFromPlan } from '../../lib/modConflictUtils';
import type { ModUpdateAllFlowResult } from '../../lib/modUpdateAllFlow';

type TFunc = (key: string, ...args: (string | number)[]) => string;

type FlowStep = 'confirm' | 'loading' | 'deps' | 'game_version' | 'error';

function parseConfirmMessage(message: string): { lead: string; question?: string } {
  const parts = message.split('\n\n').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return { lead: message };
  if (parts.length === 1) return { lead: parts[0] };
  const last = parts[parts.length - 1];
  if (last.endsWith('?')) {
    return { lead: parts.slice(0, -1).join('\n\n'), question: last };
  }
  return { lead: parts.join('\n\n') };
}

function normalizeDeps(names: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const d = String(raw || '').trim();
    if (!d) continue;
    const key = d.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function normalizeConflicts(items: ModInstallConflictInfo[]): ModInstallConflictInfo[] {
  const out: ModInstallConflictInfo[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const name = String(raw?.name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      is_builtin: !!raw.is_builtin,
      will_disable: raw.will_disable !== false,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

interface ModUpdateAllFlowBodyProps {
  t: TFunc;
  fetchPlan: () => Promise<ModInstallPlan>;
  onDone: (result: ModUpdateAllFlowResult) => void;
}

export function ModUpdateAllFlowBody({ t, fetchPlan, onDone }: ModUpdateAllFlowBodyProps) {
  const confirmCopy = parseConfirmMessage(t('mod_list_update_all_confirm_msg'));
  const [step, setStep] = useState<FlowStep>('confirm');
  const [plan, setPlan] = useState<ModInstallPlan | null>(null);
  const [errorText, setErrorText] = useState('');

  const deps = plan ? normalizeDeps(Array.isArray(plan.dependencies) ? plan.dependencies.map(String) : []) : [];
  const conflicts = plan ? normalizeConflicts(installConflictsFromPlan(plan)) : [];
  const gameMods = plan ? modsNeedingGameLinesFromPlan(plan) : [];
  const gameVersion = String(plan?.game_version || '').trim() || '—';

  const cancel = useCallback(() => onDone({ ok: false }), [onDone]);

  const afterPlanLoaded = useCallback(
    (loaded: ModInstallPlan) => {
      setPlan(loaded);
      const nextDeps = normalizeDeps(Array.isArray(loaded.dependencies) ? loaded.dependencies.map(String) : []);
      const nextConflicts = normalizeConflicts(installConflictsFromPlan(loaded));
      if (nextDeps.length || nextConflicts.length) {
        setStep('deps');
        return;
      }
      const needsGame = Array.isArray(loaded.mods_needing_game_update) ? loaded.mods_needing_game_update.length : 0;
      if (needsGame > 0) {
        setStep('game_version');
        return;
      }
      onDone({ ok: true, allow_requires_game_update: false });
    },
    [onDone],
  );

  const startPlanFetch = useCallback(async () => {
    setStep('loading');
    setErrorText('');
    try {
      const loaded = await fetchPlan();
      if (loaded?.ok === false) throw new Error(String(loaded.error || 'update_all_plan_failed'));
      afterPlanLoaded(loaded);
    } catch (e) {
      setErrorText(localizeModError(e instanceof Error ? e.message : String(e), undefined, t));
      setStep('error');
    }
  }, [afterPlanLoaded, fetchPlan, t]);

  const headerIcon = step === 'game_version' ? 'info' : step === 'deps' ? 'add_link' : 'mod_update_';
  const headerTitle =
    step === 'game_version'
      ? t('mod_update_requires_newer_game_title')
      : step === 'deps'
        ? conflicts.length && !deps.length
          ? t('mod_list_conflicts_title')
          : t('mod_list_deps_question_title')
        : step === 'error'
          ? t('mod_list_update_all_confirm_title')
          : t('mod_list_update_all_confirm_title');

  return (
    <div className="mod-update-all-flow">
      <div className="mod-update-all-flow__header">
        <AppIcon name={headerIcon} size={20} className="mod-update-all-flow__header-icon" />
        <div className="mod-update-all-flow__header-text">
          <span className="mod-update-all-flow__header-title">{headerTitle}</span>
          {step === 'loading' ? (
            <span className="mod-update-all-flow__header-badge">{t('audit_report_open')}</span>
          ) : null}
        </div>
        {step !== 'loading' ? (
          <button
            type="button"
            className="mod-update-all-flow__close"
            aria-label={t('close')}
            onClick={cancel}
          >
            <AppIcon name="close" size={16} />
          </button>
        ) : null}
      </div>

      <div className="mod-update-all-flow__body">
        {step === 'confirm' ? (
          <div className="fcc-confirm-modal__content mod-update-all-flow__panel">
            <p className="fcc-confirm-modal__lead">{confirmCopy.lead}</p>
            {confirmCopy.question ? (
              <p className="fcc-confirm-modal__question">{confirmCopy.question}</p>
            ) : null}
          </div>
        ) : null}

        {step === 'loading' ? (
          <div className="mod-update-all-flow__loading">
            <div className="server-update-dialog__status-card server-update-dialog__status-card--download">
              <span className="server-update-dialog__status-icon-wrap" aria-hidden="true">
                <AppIcon name="mod_update_" size={18} className="server-update-dialog__status-icon" />
              </span>
              <span className="server-update-dialog__status-text">{t('mod_update_all_flow_preparing')}</span>
            </div>
            <div className="server-update-dialog__progress-block">
              <div
                className="server-update-dialog__progress-track fu-progress"
                role="progressbar"
                aria-busy="true"
                aria-valuetext={t('mod_update_all_flow_preparing')}
              >
                <div className="server-update-dialog__bar server-update-dialog__bar--indeterminate" />
              </div>
            </div>
          </div>
        ) : null}

        {step === 'deps' && plan ? (
          <div className="mod-update-all-flow__deps">
            <ModDependenciesConfirmBody
            intro={t('mod_list_update_all_new_deps_intro')}
            outro={t('mod_list_update_new_deps_outro')}
            deps={deps}
            countLabel={t('mod_deps_confirm_count', deps.length)}
            conflicts={conflicts}
            conflictsIntro={t('mod_list_conflicts_intro')}
            conflictsCountLabel={conflicts.length ? t('mod_list_conflicts_count', conflicts.length) : ''}
            conflictTagLabel={t('mod_list_conflict_tag')}
            conflictBuiltinLabel={t('mod_list_conflict_builtin')}
          />
          </div>
        ) : null}

        {step === 'game_version' && plan ? (
          <div className="fcc-confirm-modal__content mod-update-all-flow__panel">
            <p className="fcc-confirm-modal__lead">
              {t('mod_update_all_requires_newer_game_lead', gameVersion)}
            </p>
            <div className="mod-update-all-flow__mod-list-wrap">
              <ul className="mod-update-all-flow__mod-list" role="list">
                {gameMods.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <p className="fcc-confirm-modal__question">{t('mod_update_all_requires_newer_game_question')}</p>
          </div>
        ) : null}

        {step === 'error' ? (
          <div className="fcc-confirm-modal__content mod-update-all-flow__panel">
            <div className="fcc-confirm-modal__callout fcc-confirm-modal__callout--danger">
              <p className="mod-update-all-flow__error">{errorText || t('mod_job_phase_error')}</p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mod-update-all-flow__footer">
        {step === 'confirm' ? (
          <>
            <CancelButton onClick={cancel} t={t} />
            <button type="button" className="btn btn--primary btn--with-icon" onClick={() => void startPlanFetch()}>
              <AppIcon name="mod_update_" size={16} />
              {t('mod_list_update_all_confirm_continue_btn')}
            </button>
          </>
        ) : null}

        {step === 'deps' ? (
          <>
            <CancelButton onClick={cancel} t={t} />
            <button
              type="button"
              className="btn btn--primary btn--with-icon"
              onClick={() => {
                const needsGame = gameMods.length > 0;
                if (needsGame) {
                  setStep('game_version');
                  return;
                }
                onDone({ ok: true, allow_requires_game_update: false });
              }}
            >
              <AppIcon name="mod_update_" size={16} />
              {t('ok')}
            </button>
          </>
        ) : null}

        {step === 'game_version' ? (
          <ModGameVersionConfirmFooter
            t={t}
            showSkip
            onCancel={cancel}
            onSkip={() => onDone({ ok: true, allow_requires_game_update: false })}
            onUpdate={() => onDone({ ok: true, allow_requires_game_update: true })}
          />
        ) : null}

        {step === 'error' ? (
          <button type="button" className="btn btn--primary" onClick={cancel}>
            {t('close')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
