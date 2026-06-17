'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import { commands, type ICommand } from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), {
  ssr: false,
  loading: () => (
    <div className="admin-md-skeleton h-[205px] rounded-[20px] border border-stroke bg-surface-strong p-3">
      <div className="admin-md-skeleton-bar mb-3 h-8 w-full rounded-md bg-slate-100 dark:bg-slate-800" />
      <div className="admin-md-skeleton-panel h-[147px] w-full rounded-md bg-surface dark:bg-slate-800/70" />
    </div>
  ),
});

type TextSelState = {
  selectedText: string;
  text: string;
  selection: { start: number; end: number };
};

function selectWord(params: {
  text: string;
  selection: { start: number; end: number };
  prefix: string;
  suffix?: string;
}) {
  const { text, selection, prefix } = params;
  const suffix = params.suffix ?? prefix;
  const result = { ...selection };

  if (text && text.length && selection.start === selection.end) {
    const isWordDelimiter = (char: string) => char === ' ' || char.charCodeAt(0) === 10;
    let start = 0;
    let end = text.length;
    for (let i = selection.start; i - 1 > -1; i -= 1) {
      if (isWordDelimiter(text[i - 1])) {
        start = i;
        break;
      }
    }
    for (let i = selection.start; i < text.length; i += 1) {
      if (isWordDelimiter(text[i])) {
        end = i;
        break;
      }
    }
    result.start = start;
    result.end = end;
  }

  if (result.start >= prefix.length && result.end <= text.length - suffix.length) {
    const wrapped = text.slice(result.start - prefix.length, result.end + suffix.length);
    if (wrapped.startsWith(prefix) && wrapped.endsWith(suffix)) {
      return {
        start: result.start - prefix.length,
        end: result.end + suffix.length,
      };
    }
  }
  return result;
}

function executeMarkdownToggle(params: {
  api: {
    replaceSelection: (text: string) => void;
    setSelectionRange: (range: { start: number; end: number }) => void;
  };
  selectedText: string;
  selection: { start: number; end: number };
  prefix: string;
  suffix?: string;
}) {
  const { api, selectedText, selection, prefix } = params;
  const suffix = params.suffix ?? prefix;
  const leading = selectedText.match(/^\s*/u)?.[0] ?? '';
  const trailing = selectedText.match(/\s*$/u)?.[0] ?? '';
  const core = selectedText.slice(leading.length, selectedText.length - trailing.length);

  if (core.startsWith(prefix) && core.endsWith(suffix) && core.length >= prefix.length + suffix.length) {
    const unwrapped = core.slice(prefix.length, suffix.length ? -suffix.length : undefined);
    const next = `${leading}${unwrapped}${trailing}`;
    api.replaceSelection(next);
    api.setSelectionRange({
      start: selection.start + leading.length,
      end: selection.start + leading.length + unwrapped.length,
    });
    return;
  }

  const safeCore = core || 'text';
  const next = `${leading}${prefix}${safeCore}${suffix}${trailing}`;
  api.replaceSelection(next);
  api.setSelectionRange({
    start: selection.start + leading.length + prefix.length,
    end: selection.start + leading.length + prefix.length + safeCore.length,
  });
}

function executeHtmlToggle(params: {
  api: {
    replaceSelection: (text: string) => void;
    setSelectionRange: (range: { start: number; end: number }) => void;
  };
  selectedText: string;
  selection: { start: number; end: number };
  openTag: string;
  closeTag: string;
}) {
  const { api, selectedText, selection, openTag, closeTag } = params;
  const leading = selectedText.match(/^\s*/u)?.[0] ?? '';
  const trailing = selectedText.match(/\s*$/u)?.[0] ?? '';
  const core = selectedText.slice(leading.length, selectedText.length - trailing.length);

  if (core.startsWith(openTag) && core.endsWith(closeTag) && core.length >= openTag.length + closeTag.length) {
    const unwrapped = core.slice(openTag.length, -closeTag.length);
    const next = `${leading}${unwrapped}${trailing}`;
    api.replaceSelection(next);
    api.setSelectionRange({
      start: selection.start + leading.length,
      end: selection.start + leading.length + unwrapped.length,
    });
    return;
  }

  const safeCore = core || 'text';
  const next = `${leading}${openTag}${safeCore}${closeTag}${trailing}`;
  api.replaceSelection(next);
  api.setSelectionRange({
    start: selection.start + leading.length + openTag.length,
    end: selection.start + leading.length + openTag.length + safeCore.length,
  });
}

function commandButtonClass(active: boolean) {
  return active ? 'wmde-markdown-active' : undefined;
}

function makeToggleCommand(
  name: string,
  keyCommand: string,
  icon: ReactElement,
  title: string,
  style:
    | { kind: 'markdown'; prefix: string; suffix?: string }
    | { kind: 'html'; openTag: string; closeTag: string },
  active: boolean,
): ICommand {
  return {
    name,
    keyCommand,
    buttonProps: {
      'aria-label': title,
      title,
      className: commandButtonClass(active),
      style: active ? { backgroundColor: '#e2e8f0' } : undefined,
    },
    icon,
    prefix: style.kind === 'markdown' ? style.prefix : undefined,
    suffix: style.kind === 'markdown' ? (style.suffix ?? style.prefix) : undefined,
    value: 'text',
    execute: (state, api) => {
      const range = selectWord({
        text: state.text,
        selection: state.selection,
        prefix: style.kind === 'markdown' ? style.prefix : style.openTag,
        suffix: style.kind === 'markdown' ? (style.suffix ?? style.prefix) : style.closeTag,
      });
      const nextState = api.setSelectionRange(range) as TextSelState;
      if (style.kind === 'markdown') {
        executeMarkdownToggle({
          api,
          selectedText: nextState.selectedText,
          selection: range,
          prefix: style.prefix,
          suffix: style.suffix ?? style.prefix,
        });
      } else {
        executeHtmlToggle({
          api,
          selectedText: nextState.selectedText,
          selection: range,
          openTag: style.openTag,
          closeTag: style.closeTag,
        });
      }
    },
  };
}

const markdownExtraCommands = [
  commands.codeEdit,
  commands.codeLive,
  commands.codePreview,
  commands.fullscreen,
];

type AdminMarkdownEditorProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  colorMode: 'dark' | 'light';
  height?: number;
  id?: string;
  error?: string;
};

export default function AdminMarkdownEditor({
  label,
  value,
  onChange,
  colorMode,
  height = 205,
  id,
  error,
}: AdminMarkdownEditorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const markdownCommands = useMemo<ICommand[]>(
    () => [
      makeToggleCommand('bold', 'bold', <span style={{ fontSize: 14, fontWeight: 800 }}>B</span>, 'Жирный', { kind: 'markdown', prefix: '**' }, false),
      makeToggleCommand('italic', 'italic', <span style={{ fontSize: 14, fontStyle: 'italic' }}>I</span>, 'Курсив', { kind: 'markdown', prefix: '*' }, false),
      makeToggleCommand('strikethrough', 'strikethrough', <span style={{ fontSize: 14, textDecoration: 'line-through' }}>S</span>, 'Зачёркнутый', { kind: 'markdown', prefix: '~~' }, false),
      makeToggleCommand('underline', 'underline', <span style={{ fontSize: 14, textDecoration: 'underline' }}>U</span>, 'Подчёркнутый', { kind: 'html', openTag: '<u>', closeTag: '</u>' }, false),
      makeToggleCommand('doubleUnderline', 'doubleUnderline', <span style={{ fontSize: 14, textDecoration: 'underline double' }}>U</span>, 'Двойное подчёркивание', { kind: 'html', openTag: '<ins class="du">', closeTag: '</ins>' }, false),
      commands.hr,
      commands.divider,
      commands.link,
      commands.quote,
      commands.code,
      commands.image,
      commands.divider,
      commands.unorderedListCommand,
      commands.orderedListCommand,
      commands.checkedListCommand,
    ],
    [],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const hideToolbarIcons = () => {
      root
        .querySelectorAll('.w-md-editor-toolbar svg[role="img"]')
        .forEach((icon) => {
          icon.setAttribute('aria-hidden', 'true');
          icon.removeAttribute('role');
        });
    };

    hideToolbarIcons();
    const observer = new MutationObserver(hideToolbarIcons);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div id={id} ref={rootRef} className="mt-3">
      <label htmlFor={id ? `${id}-control` : undefined} className="mb-1 block text-sm font-medium text-foreground/80">{label}</label>
      <MDEditor
        value={value}
        onChange={(nextValue) => onChange(nextValue || '')}
        data-color-mode={colorMode}
        className="w-full"
        height={height}
        commands={markdownCommands}
        extraCommands={markdownExtraCommands}
        textareaProps={{
          id: id ? `${id}-control` : undefined,
          name: id,
          'aria-label': label,
          'aria-invalid': Boolean(error),
          'aria-describedby': error && id ? `${id}-error` : undefined,
        }}
      />
      {error && id ? (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-red-600 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
