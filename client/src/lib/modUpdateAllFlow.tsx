import { createElement } from 'react';
import { modals } from '@mantine/modals';
import { ModUpdateAllFlowBody } from '../components/modals/ModUpdateAllFlowBody';
import type { ModInstallPlan } from '../types/modJob';

type TFunc = (key: string, ...args: (string | number)[]) => string;

export type ModUpdateAllFlowResult =
  | { ok: true; allow_requires_game_update: boolean }
  | { ok: false };

export function openModUpdateAllFlow(
  t: TFunc,
  fetchPlan: () => Promise<ModInstallPlan>,
): Promise<ModUpdateAllFlowResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: ModUpdateAllFlowResult) => {
      if (settled) return;
      settled = true;
      modals.closeAll();
      resolve(result);
    };

    modals.open({
      centered: true,
      size: 'lg',
      withCloseButton: false,
      closeOnClickOutside: false,
      closeOnEscape: false,
      onClose: () => finish({ ok: false }),
      classNames: {
        content: 'fcc-modal fcc-modal--mod-update-all',
        body: 'mod-update-all-flow__modal-body',
      },
      children: createElement(ModUpdateAllFlowBody, { t, fetchPlan, onDone: finish }),
    });
  });
}
