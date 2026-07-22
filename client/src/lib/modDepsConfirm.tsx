import { createElement, useState, type ReactNode } from 'react';
import { modals } from '@mantine/modals';
import { AppIcon } from '../components/AppIcon';
import { ModDependenciesConfirmBody } from '../components/modals/ModDependenciesConfirmBody';
import type { ModInstallConflictInfo } from '../types/modConflict';

export type ModDepsConfirmVariant = 'install' | 'update' | 'update_all' | 'startup' | 'upload';

type TFunc = (key: string, ...args: (string | number)[]) => string;

export type ModDepsUploadChoice = 'download' | 'as_is' | 'cancel';

type ModDepsButton = {
  text: string;
  value: string;
  primary?: boolean;
};

type ModDepsModalOptions = {
  confirmLabel?: string;
  cancelLabel?: string;
  conflicts?: ModInstallConflictInfo[];
  recommended?: string[];
};

function normalizeNames(names: string[]): string[] {
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

function variantCopy(
  variant: ModDepsConfirmVariant,
  t: TFunc,
): { title: string; intro: string; outro?: string; conflictsIntro?: string } {
  switch (variant) {
    case 'install':
      return {
        title: t('mod_list_deps_question_title'),
        intro: t('mod_list_deps_question_intro'),
        conflictsIntro: t('mod_list_conflicts_intro'),
      };
    case 'update':
      return {
        title: t('mod_list_deps_question_title'),
        intro: t('mod_list_update_new_deps_intro'),
        outro: t('mod_list_update_new_deps_outro'),
        conflictsIntro: t('mod_list_conflicts_intro'),
      };
    case 'update_all':
      return {
        title: t('mod_list_deps_question_title'),
        intro: t('mod_list_update_all_new_deps_intro'),
        outro: t('mod_list_update_new_deps_outro'),
        conflictsIntro: t('mod_list_conflicts_intro'),
      };
    case 'startup':
      return {
        title: t('server_start_missing_deps_title'),
        intro: t('server_start_missing_deps_intro'),
        outro: t('server_start_missing_deps_outro'),
        conflictsIntro: t('mod_list_conflicts_intro'),
      };
    case 'upload':
      return {
        title: t('mod_list_upload_missing_deps_title'),
        intro: t('mod_list_upload_missing_deps_intro'),
        conflictsIntro: t('mod_list_conflicts_intro'),
      };
    default:
      return {
        title: t('mod_list_deps_question_title'),
        intro: t('mod_list_deps_question_intro'),
        conflictsIntro: t('mod_list_conflicts_intro'),
      };
  }
}

function modalTitle(title: string, hasConflicts: boolean): ReactNode {
  return createElement(
    'span',
    { className: 'mod-deps-confirm__title' },
    createElement(AppIcon, {
      name: hasConflicts ? 'mode_off_on' : 'add_link',
      size: 20,
      className: 'mod-deps-confirm__title-icon',
    }),
    title,
  );
}

function ModDepsModalWrapper({
  copy,
  list,
  conflictList,
  recommendedList,
  buttons,
  finish,
  t,
}: {
  copy: ReturnType<typeof variantCopy>;
  list: string[];
  conflictList: ModInstallConflictInfo[];
  recommendedList: string[];
  buttons: ModDepsButton[];
  finish: (value: string | null, recommended: string[]) => void;
  t: TFunc;
}) {
  const [selectedRecommended, setSelectedRecommended] = useState<Set<string>>(new Set());

  const toggleRecommended = (name: string) => {
    setSelectedRecommended((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return createElement(
    'div',
    { className: 'mod-deps-confirm__shell' },
    createElement(ModDependenciesConfirmBody, {
      intro: copy.intro,
      outro: copy.outro,
      deps: list,
      countLabel: t('mod_deps_confirm_count', list.length),
      conflicts: conflictList,
      conflictsIntro: copy.conflictsIntro,
      conflictsCountLabel: conflictList.length ? t('mod_list_conflicts_count', conflictList.length) : '',
      conflictTagLabel: t('mod_list_conflict_tag'),
      conflictBuiltinLabel: t('mod_list_conflict_builtin'),
      recommended: recommendedList,
      recommendedSelection: selectedRecommended,
      onToggleRecommended: toggleRecommended,
      recommendedIntro: t('mod_list_recommended_intro'),
      recommendedCountLabel: recommendedList.length ? t('mod_list_recommended_count', recommendedList.length) : '',
    }),
    createElement(
      'div',
      { className: 'mod-deps-confirm__footer' },
      ...buttons.map((b) =>
        createElement(
          'button',
          {
            key: b.value,
            type: 'button',
            className: 'btn' + (b.primary ? ' btn--primary' : ''),
            onClick: () => finish(b.value, Array.from(selectedRecommended)),
          },
          b.text,
        ),
      ),
    ),
  );
}

function openDepsModal(
  deps: string[],
  conflicts: ModInstallConflictInfo[],
  recommended: string[],
  variant: ModDepsConfirmVariant,
  t: TFunc,
  buttons: ModDepsButton[],
): Promise<{ value: string | null; checkedRecommended: string[] }> {
  const list = normalizeNames(deps);
  const conflictList = normalizeConflicts(conflicts);
  const recommendedList = normalizeNames(recommended);
  if (!list.length && !conflictList.length && !recommendedList.length) {
    return Promise.resolve({
      value: buttons.find((b) => b.primary)?.value ?? buttons[0]?.value ?? null,
      checkedRecommended: [],
    });
  }

  const copy = variantCopy(variant, t);
    const title =
      conflictList.length && !list.length && !recommendedList.length ? t('mod_list_conflicts_title') : copy.title;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: string | null, checkedRecommended: string[] = []) => {
        if (settled) return;
        settled = true;
        modals.closeAll();
        resolve({ value, checkedRecommended });
      };

      modals.open({
        title: modalTitle(title, conflictList.length > 0),
        centered: true,
        size: 'lg',
        classNames: {
          content: 'fcc-modal fcc-modal--mod-deps',
          header: 'mod-deps-confirm__modal-header',
          body: 'mod-deps-confirm__modal-body',
        },
        children: createElement(ModDepsModalWrapper, {
          copy,
          list,
          conflictList,
          recommendedList,
          buttons,
          finish,
          t,
        }),
        onClose: () => finish(null, []),
      });
    });
  }

export async function modDepsConfirm(
  deps: string[],
  variant: ModDepsConfirmVariant,
  t: TFunc,
  options?: ModDepsModalOptions,
): Promise<{ confirmed: boolean; recommendedToInstall?: string[] }> {
  const confirmLabel =
    options?.confirmLabel ??
    (variant === 'install'
      ? t('mod_deps_confirm_install_btn')
      : variant === 'startup'
        ? t('mod_list_upload_missing_deps_download_btn')
        : t('ok'));
  const cancelLabel = options?.cancelLabel ?? t('cancel');
  const conflicts = options?.conflicts ?? [];
  const recommended = options?.recommended ?? [];
  const { value, checkedRecommended } = await openDepsModal(deps, conflicts, recommended, variant, t, [
    { text: cancelLabel, value: 'cancel' },
    { text: confirmLabel, value: 'confirm', primary: true },
  ]);
  return { confirmed: value === 'confirm', recommendedToInstall: checkedRecommended };
}

export async function modDepsUploadChoice(
  deps: string[],
  t: TFunc,
  conflicts: ModInstallConflictInfo[] = [],
): Promise<ModDepsUploadChoice> {
  const { value } = await openDepsModal(deps, conflicts, [], 'upload', t, [
    { text: t('cancel'), value: 'cancel' },
    { text: t('mod_list_upload_missing_deps_install_as_is_btn'), value: 'as_is' },
    { text: t('mod_list_upload_missing_deps_download_btn'), value: 'download', primary: true },
  ]);
  if (value === 'download' || value === 'as_is' || value === 'cancel') return value;
  return 'cancel';
}
