'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from '@/components/theme-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const applyTheme = (value: 'light' | 'dark') => {
    setTheme(value);
    try {
      window.localStorage.setItem('theme', value);
    } catch {}
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative inline-flex size-10 items-center justify-center rounded-lg border border-stroke bg-surface-strong text-foreground transition-[background-color,border-color,box-shadow,color] duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:hover:bg-stroke"
          aria-label="Переключить тему"
        >
          <ThemeIcon isClient={isClient} resolvedTheme={resolvedTheme} />
          <span className="sr-only">Переключить тему</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent aria-label="Тема">
        <DropdownMenuRadioGroup
          value={isClient && resolvedTheme === 'dark' ? 'dark' : 'light'}
          onValueChange={(value) => applyTheme(value as 'light' | 'dark')}
        >
          <DropdownMenuRadioItem value="light">Светлая</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Тёмная</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeIcon({
  isClient,
  resolvedTheme,
}: {
  isClient: boolean;
  resolvedTheme: string | undefined;
}) {
  if (isClient && resolvedTheme === 'dark') {
    return (
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
      </svg>
    );
  }

  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M6.34 17.66l-1.41 1.41" />
      <path d="M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}
