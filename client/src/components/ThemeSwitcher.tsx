import { Select } from '@mantine/core';
import { IconPalette } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { applyTheme, FCC_THEMES, resolveEffectiveTheme, type FccThemeId } from '../theme/themes';

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<FccThemeId>(resolveEffectiveTheme);

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
      data={FCC_THEMES.map((t) => ({ value: t.id, label: t.label }))}
      comboboxProps={{ withinPortal: true }}
      aria-label="Theme"
    />
  );
}
