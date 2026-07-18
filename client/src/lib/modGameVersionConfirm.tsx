import { createElement } from 'react';
import { modals } from '@mantine/modals';
import {
  ModGameVersionConfirmBody,
  type ModGameVersionConfirmResult,
} from '../components/modals/ModGameVersionConfirmBody';

type TFunc = (key: string, ...args: (string | number)[]) => string;

export type { ModGameVersionConfirmResult };

export function openModGameVersionConfirm(
  t: TFunc,
  options: {
    title: string;
    gameVersion: string;
    modLines: string[];
  },
): Promise<ModGameVersionConfirmResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: ModGameVersionConfirmResult) => {
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
        content: 'fcc-modal fcc-modal--mod-update-all fcc-modal--mod-game-version',
        body: 'mod-update-all-flow__modal-body',
      },
      children: createElement(ModGameVersionConfirmBody, {
        t,
        title: options.title,
        gameVersion: options.gameVersion,
        modLines: options.modLines,
        onDone: finish,
      }),
    });
  });
}
