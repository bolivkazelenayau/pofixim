'use client';

import dynamic from 'next/dynamic';
import {
 useState,
 useSyncExternalStore,
 type Dispatch,
 type ReactNode,
 type SetStateAction,
} from 'react';
import { categories, inputClass } from '@/components/admin-form/constants';
import type { Form } from '@/components/admin-form/types';
import { useTheme } from '@/components/theme-provider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ExerciseCategory } from '@/features/exercises/types';

type AdminCoreFieldsProps = {
 form: Form;
 typeOptions: Form['type'][];
 setForm: Dispatch<SetStateAction<Form>>;
 onTypeChange: (type: Form['type']) => void;
 onGenerateSeedClick: () => void;
 onSeedManualChange: () => void;
};

const AdminMarkdownEditor = dynamic(
 () => import('@/components/admin-form/markdown/AdminMarkdownEditor'),
 {
  loading: () => (
   <div className="mt-3 rounded-xl border border-stroke bg-surface-strong p-3">
    <div className="mb-2 h-4 w-32 rounded bg-foreground/10 motion-safe:animate-pulse" />
    <div className="h-44 rounded-lg bg-foreground/10 motion-safe:animate-pulse" />
   </div>
  ),
 },
);

type DeferredMarkdownEditorProps = {
 id: string;
 label: string;
 value: string;
 onChange: (value: string) => void;
 colorMode: 'dark' | 'light';
};

function DeferredMarkdownEditor({
 id,
 label,
 value,
 onChange,
 colorMode,
}: DeferredMarkdownEditorProps) {
 const [enhanced, setEnhanced] = useState(false);

 if (enhanced) {
  return (
   <AdminMarkdownEditor
    id={id}
    label={label}
    value={value}
    onChange={onChange}
    colorMode={colorMode}
   />
  );
 }

 return (
  <div id={id} className="mt-3">
   <div className="mb-1 text-sm font-medium text-foreground/80">{label}</div>
   <textarea
    name={id}
    className={`${inputClass} min-h-44 resize-y leading-6`}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    onFocus={() => setEnhanced(true)}
    aria-label={label}
   />
  </div>
 );
}

export default function AdminCoreFields({
 form,
 typeOptions,
 setForm,
 onTypeChange,
 onGenerateSeedClick,
 onSeedManualChange,
}: AdminCoreFieldsProps) {
 const { resolvedTheme, theme } = useTheme();
 const isClient = useSyncExternalStore(
  () => () => undefined,
  () => true,
  () => false,
 );
 const editorColorMode = isClient && (resolvedTheme || theme) === 'dark' ? 'dark' : 'light';

 return (
  <>
   <div className="grid gap-3 sm:grid-cols-3">
    <Field label="Тип">
     <Select
      name="type"
      value={form.type}
      onValueChange={(value) => onTypeChange(value as Form['type'])}
     >
      <SelectTrigger className={inputClass} aria-label="Exercise type">
       <SelectValue />
      </SelectTrigger>
      <SelectContent>
       {typeOptions.map((type) => (
        <SelectItem key={type} value={type}>
         {type}
        </SelectItem>
       ))}
      </SelectContent>
     </Select>
    </Field>
    <Field label="Категория">
     <Select
      name="category"
      value={form.category}
      onValueChange={(value) =>
       setForm((current) => ({
        ...current,
        category: value as ExerciseCategory,
       }))
      }
     >
      <SelectTrigger className={inputClass} aria-label="Exercise category">
       <SelectValue />
      </SelectTrigger>
      <SelectContent>
       {categories.map((category) => (
        <SelectItem key={category} value={category}>
         {category}
        </SelectItem>
       ))}
      </SelectContent>
     </Select>
    </Field>
    <Field label="Сложность">
     <Select
      name="difficulty"
      value={String(form.difficulty)}
      onValueChange={(value) =>
       setForm((current) => ({ ...current, difficulty: Number(value) as 1 | 2 }))
      }
     >
      <SelectTrigger className={inputClass} aria-label="Exercise difficulty">
       <SelectValue />
      </SelectTrigger>
      <SelectContent>
       <SelectItem value="1">1</SelectItem>
       <SelectItem value="2">2</SelectItem>
      </SelectContent>
     </Select>
    </Field>
   </div>

   <div className="mt-3 grid gap-3 sm:grid-cols-2">
    <Field id="admin-field-seed-key" label="Seed key">
     <div className="flex gap-2">
      <input
       name="seedKey"
       className={inputClass}
       value={form.seedKey}
       onChange={(event) => {
        onSeedManualChange();
        setForm((current) => ({ ...current, seedKey: event.target.value }));
       }}
       placeholder="e.g. ege21-task-abc123ef"
      />
      <button
       type="button"
       onClick={onGenerateSeedClick}
       className="shrink-0 rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-xs font-semibold text-foreground/80 transition-[background-color,border-color,transform] duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] dark:hover:bg-stroke"
       title="Сгенерировать seed key"
      >
       Сгенерировать
      </button>
     </div>
    </Field>
    <Field id="admin-field-skill-tags" label="Skill tags">
     <input
      name="skillTags"
      className={inputClass}
      value={form.skillTags}
      onChange={(event) => setForm((current) => ({ ...current, skillTags: event.target.value }))}
     />
    </Field>
   </div>

   <DeferredMarkdownEditor
    id="admin-field-prompt"
    label="Формулировка"
    value={form.prompt}
    onChange={(prompt) => setForm((current) => ({ ...current, prompt }))}
    colorMode={editorColorMode}
   />
   <DeferredMarkdownEditor
    id="admin-field-explanation"
    label="Объяснение"
    value={form.explanation}
    onChange={(explanation) => setForm((current) => ({ ...current, explanation }))}
    colorMode={editorColorMode}
   />
  </>
 );
}

function Field({
 id,
 label,
 children,
}: {
 id?: string;
 label: string;
 children: ReactNode;
}) {
 return (
  <label id={id} className="block">
   <div className="mb-1 text-sm font-medium text-foreground/80 ">{label}</div>
   {children}
  </label>
 );
}
