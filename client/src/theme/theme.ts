import { createTheme, type MantineColorsTuple } from '@mantine/core';

const fccAccent: MantineColorsTuple = [
  '#fff4e0',
  '#ffe8c2',
  '#ffd494',
  '#f5bd70',
  '#eaa24a',
  '#da8216',
  '#b96d12',
  '#95580e',
  '#71430b',
  '#4d2d07',
];

export const fccMantineTheme = createTheme({
  primaryColor: 'fcc',
  colors: {
    fcc: fccAccent,
  },
  fontFamily: "'Segoe UI', system-ui, sans-serif",
  fontFamilyMonospace: 'ui-monospace, "Cascadia Code", monospace',
  defaultRadius: 'md',
  cursorType: 'pointer',
  focusRing: 'auto',
  headings: {
    fontWeight: '600',
  },
  components: {
    AppShell: {
      styles: {
        root: { background: 'var(--bg-main)' },
        navbar: {
          background: 'var(--bg-widget)',
          borderColor: 'var(--border)',
        },
        header: {
          background: 'var(--bg-widget)',
          borderColor: 'var(--border)',
        },
        main: { background: 'transparent' },
      },
    },
    Paper: {
      defaultProps: {
        withBorder: true,
      },
      styles: {
        root: {
          background: 'var(--bg-widget)',
          borderColor: 'var(--border)',
        },
      },
    },
    Card: {
      styles: {
        root: {
          background: 'var(--bg-widget)',
          borderColor: 'var(--border)',
        },
      },
    },
    NavLink: {
      styles: {
        root: {
          borderRadius: 8,
          '&[data-active]': {
            background: `color-mix(in srgb, var(--accent) 14%, var(--bg-data))`,
            color: 'var(--text)',
          },
        },
        label: { color: 'var(--text-muted)' },
      },
    },
    Modal: {
      classNames: {
        content: 'fcc-modal',
      },
      defaultProps: {
        centered: true,
        overlayProps: { backgroundOpacity: 0.65, blur: 7 },
        transitionProps: { transition: 'pop', duration: 280 },
        zIndex: 10100,
      },
    },
    TextInput: {
      styles: {
        input: {
          background: 'var(--bg-input)',
          borderColor: 'var(--border)',
          color: 'var(--text)',
        },
        label: { color: 'var(--text-muted)' },
      },
    },
    PasswordInput: {
      styles: {
        input: {
          background: 'var(--bg-input)',
          borderColor: 'var(--border)',
          color: 'var(--text)',
        },
        label: { color: 'var(--text-muted)' },
      },
    },
    Button: {
      defaultProps: {
        radius: 'md',
      },
    },
  },
});
