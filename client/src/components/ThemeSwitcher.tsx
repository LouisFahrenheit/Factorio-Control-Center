import { Select } from '@mantine/core';
import { IconPalette } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { applyTheme, FCC_THEMES, resolveEffectiveTheme, type FccThemeId } from '../theme/themes';
import { useT } from '../i18n/LocaleProvider';

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<FccThemeId>(resolveEffectiveTheme);
  const t = useT();

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <Select
      size="xs"
      w={150}
      leftSection={<IconPalette size={14} stroke={1.5} />}
      value={theme}
      onChange={(v) => v && setTheme(v as FccThemeId)}
      data={FCC_THEMES.map((th) => ({ value: th.id, label: t('ui_theme_' + th.id) || th.label }))}
      comboboxProps={{ withinPortal: true }}
      aria-label="Theme"
    />
  );
}
