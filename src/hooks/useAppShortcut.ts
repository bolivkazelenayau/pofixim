'use client';

import { useHotkey, type RegisterableHotkey, type UseHotkeyOptions } from '@tanstack/react-hotkeys';

type AppShortcutCommand =
  | 'admin.commandPalette'
  | 'admin.save'
  | 'admin.nextExercise'
  | 'admin.previousExercise';

const APP_SHORTCUTS: Record<
  AppShortcutCommand,
  {
    hotkey: RegisterableHotkey;
    secondaryHotkey?: RegisterableHotkey;
    allowInEditable: boolean;
    description: string;
  }
> = {
  'admin.commandPalette': {
    hotkey: { key: 'K', mod: true },
    secondaryHotkey: { key: 'л', mod: true },
    allowInEditable: true,
    description: 'Open admin command palette',
  },
  'admin.save': {
    hotkey: { key: 'S', mod: true },
    secondaryHotkey: { key: 'ы', mod: true },
    allowInEditable: true,
    description: 'Save current admin exercise',
  },
  'admin.nextExercise': {
    hotkey: { key: 'ArrowDown', alt: true },
    allowInEditable: false,
    description: 'Open next shown exercise',
  },
  'admin.previousExercise': {
    hotkey: { key: 'ArrowUp', alt: true },
    allowInEditable: false,
    description: 'Open previous shown exercise',
  },
};

type UseAppShortcutOptions = {
  enabled?: boolean;
  target?: UseHotkeyOptions['target'];
};

export function useAppShortcut(
  command: AppShortcutCommand,
  handler: (event: KeyboardEvent) => void,
  options: UseAppShortcutOptions = {},
) {
  const shortcut = APP_SHORTCUTS[command];
  const enabled = options.enabled ?? true;
  const callback = (event: KeyboardEvent) => {
    handler(event);
  };
  const hotkeyOptions: UseHotkeyOptions = {
    enabled,
    ignoreInputs: !shortcut.allowInEditable,
    meta: {
      name: command,
      description: shortcut.description,
    },
    preventDefault: true,
    stopPropagation: true,
    target: options.target,
  };
  useHotkey(
    shortcut.hotkey,
    callback,
    hotkeyOptions,
  );
  useHotkey(
    shortcut.secondaryHotkey ?? shortcut.hotkey,
    callback,
    {
      ...hotkeyOptions,
      enabled: enabled && Boolean(shortcut.secondaryHotkey),
    },
  );
}
