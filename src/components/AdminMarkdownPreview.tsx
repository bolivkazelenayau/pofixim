'use client';

import { useMemo, useRef, useState, type ChangeEvent, type UIEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import '@uiw/react-markdown-preview/markdown.css';

function renderEditorMarkdown(value: string) {
  return value
    .replace(
      /==([\s\S]+?)==/g,
      '<span style="text-decoration-line: underline; text-decoration-style: double; text-decoration-skip-ink: none;">$1</span>',
    )
    .replace(/\+\+([\s\S]+?)\+\+/g, '<u>$1</u>');
}

const SAMPLE_MARKDOWN = `# Markdown preview

Загрузите сюда файл \`.md\`, чтобы сразу увидеть форматирование.

## Что поддерживается

- заголовки
- списки
- **жирный**
- *курсив*
- \`inline code\`
- таблицы и HTML из markdown

> Превью обновляется сразу после загрузки файла или ручного редактирования.
`;

export default function AdminMarkdownPreview() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editorScrollRef = useRef<HTMLTextAreaElement | null>(null);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const syncSourceRef = useRef<'editor' | 'preview' | null>(null);
  const [markdown, setMarkdown] = useState(SAMPLE_MARKDOWN);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const renderedMarkdown = useMemo(() => renderEditorMarkdown(markdown), [markdown]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.md') && !lowerName.endsWith('.markdown')) {
      setError('Нужен файл в формате .md или .markdown.');
      return;
    }

    try {
      const text = await file.text();
      setMarkdown(text);
      setFileName(file.name);
      setError(null);
    } catch {
      setError('Не удалось прочитать файл.');
    }
  }

  function handleReset() {
    setMarkdown(SAMPLE_MARKDOWN);
    setFileName(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function syncScroll(source: 'editor' | 'preview', event: UIEvent<HTMLTextAreaElement | HTMLDivElement>) {
    if (syncSourceRef.current && syncSourceRef.current !== source) return;

    const sourceElement = event.currentTarget;
    const targetElement = source === 'editor' ? previewScrollRef.current : editorScrollRef.current;

    if (!targetElement) return;

    const sourceMax = sourceElement.scrollHeight - sourceElement.clientHeight;
    const targetMax = targetElement.scrollHeight - targetElement.clientHeight;
    const progress = sourceMax > 0 ? sourceElement.scrollTop / sourceMax : 0;

    syncSourceRef.current = source;
    targetElement.scrollTop = targetMax > 0 ? progress * targetMax : 0;

    window.requestAnimationFrame(() => {
      if (syncSourceRef.current === source) {
        syncSourceRef.current = null;
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5">
      <div className="rounded-xl border border-stroke bg-surface-strong p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Markdown-превью</h2>
            <p className="mt-1 text-sm text-foreground/70">
              Загрузите `.md`-файл, при необходимости поправьте текст и сразу посмотрите итоговое
              форматирование.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center rounded-lg border border-stroke bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors duration-150 ease-out hover:bg-stroke focus-within:ring-2 focus-within:ring-primary/30 dark:hover:bg-stroke">
              Выбрать `.md`
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.markdown,text/markdown,text/plain"
                className="sr-only"
                onChange={handleFileChange}
              />
            </label>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-stroke bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:hover:bg-stroke"
            >
              Сбросить
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full border border-stroke bg-surface px-3 py-1 text-foreground/80">
            {fileName ? `Файл: ${fileName}` : 'Файл не выбран'}
          </span>
          <span className="rounded-full border border-stroke bg-surface px-3 py-1 text-foreground/80">
            Символов: {markdown.length}
          </span>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-xl border border-stroke bg-surface-strong p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-foreground">Исходный markdown</h3>
            <span className="text-xs uppercase tracking-[0.18em] text-foreground/45">Editor</span>
          </div>
          <textarea
            ref={editorScrollRef}
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
            onScroll={(event) => syncScroll('editor', event)}
            spellCheck={false}
            className="min-h-[620px] w-full rounded-xl border border-stroke bg-surface px-4 py-3 font-mono text-sm text-foreground outline-none transition-colors duration-150 ease-out focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </section>

        <section className="rounded-xl border border-stroke bg-surface-strong p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-foreground">Превью</h3>
            <span className="text-xs uppercase tracking-[0.18em] text-foreground/45">Rendered</span>
          </div>
          <div className="wmde-markdown-var rounded-xl border border-stroke bg-surface p-5">
            <div
              ref={previewScrollRef}
              onScroll={(event) => syncScroll('preview', event)}
              className="max-h-[620px] overflow-y-auto rounded-lg"
            >
              <div className="wmde-markdown break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                {renderedMarkdown}
              </ReactMarkdown>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
