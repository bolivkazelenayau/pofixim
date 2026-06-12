'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTheme } from '@/components/theme-provider';

export default function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  const applyTheme = (value: 'light' | 'dark') => {
    setTheme(value);
    try {
      window.localStorage.setItem('theme', value);
    } catch {}
    setOpen(false);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative inline-flex size-10 items-center justify-center rounded-lg border border-stroke bg-surface-strong text-foreground transition-[background-color,border-color,box-shadow,color] duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:hover:bg-stroke"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="theme-menu"
        aria-label="Переключить тему"
      >
        {!isClient ? (
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
          </svg>
        ) : resolvedTheme === 'dark' ? (
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
        ) : (
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
        )}
        <span className="sr-only">Toggle theme</span>
      </button>

      {open ? (
        <div
          id="theme-menu"
          role="menu"
          className="absolute right-0 z-50 mt-2 min-w-36 overflow-hidden rounded-lg border border-stroke bg-surface-strong shadow-sm"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => applyTheme('light')}
            className="block w-full px-3 py-2 text-left text-sm text-foreground transition-colors duration-150 ease-out hover:bg-stroke focus:bg-stroke focus:outline-none dark:hover:bg-stroke dark:focus:bg-stroke"
          >
            Светлая
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => applyTheme('dark')}
            className="block w-full px-3 py-2 text-left text-sm text-foreground transition-colors duration-150 ease-out hover:bg-stroke focus:bg-stroke focus:outline-none dark:hover:bg-stroke dark:focus:bg-stroke"
          >
            Тёмная
          </button>
        </div>
      ) : null}
    </div>
  );
}
