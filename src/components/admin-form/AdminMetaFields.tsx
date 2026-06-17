import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import { inputClass, qualityStatuses } from '@/components/admin-form/constants';
import type { Form } from '@/components/admin-form/types';
import type { AdminFieldErrors } from '@/components/admin-form/validation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type AdminMetaFieldsProps = {
 form: Form;
 setForm: Dispatch<SetStateAction<Form>>;
 fieldErrors?: AdminFieldErrors;
 mainSaveAnchorRef: RefObject<HTMLDivElement | null>;
 saving: boolean;
 deleting: boolean;
 isEdit: boolean;
 onSaveIntent: () => void;
 onDeleteClick: () => void;
};

export default function AdminMetaFields({
 form,
 setForm,
 fieldErrors = {},
 mainSaveAnchorRef,
 saving,
 deleting,
 isEdit,
 onSaveIntent,
 onDeleteClick,
}: AdminMetaFieldsProps) {
 return (
  <>
   <div className="mt-3 grid gap-3 sm:grid-cols-2">
    <Field id="admin-field-source-alignment" label="Source alignment" error={fieldErrors.sourceAlignment}>
     <input
      id="admin-field-source-alignment-control"
      name="sourceAlignment"
      className={inputClass}
      value={form.sourceAlignment}
      aria-invalid={Boolean(fieldErrors.sourceAlignment)}
      aria-describedby={fieldErrors.sourceAlignment ? 'admin-field-source-alignment-error' : undefined}
      onChange={(event) => setForm((current) => ({ ...current, sourceAlignment: event.target.value }))}
     />
    </Field>
    <Field id="admin-field-typical-mistake" label="Типичная ошибка" error={fieldErrors.typicalMistake}>
     <input
      id="admin-field-typical-mistake-control"
      name="typicalMistake"
      className={inputClass}
      value={form.typicalMistake}
      aria-invalid={Boolean(fieldErrors.typicalMistake)}
      aria-describedby={fieldErrors.typicalMistake ? 'admin-field-typical-mistake-error' : undefined}
      onChange={(event) => setForm((current) => ({ ...current, typicalMistake: event.target.value }))}
     />
    </Field>
   </div>

   <Field id="admin-field-algorithm-steps" label="Algorithm steps (по строкам)" className="mt-3" error={fieldErrors.algorithmSteps}>
    <textarea
     id="admin-field-algorithm-steps-control"
     name="algorithmSteps"
     className={inputClass}
     rows={3}
     value={form.algorithmSteps}
     aria-invalid={Boolean(fieldErrors.algorithmSteps)}
     aria-describedby={fieldErrors.algorithmSteps ? 'admin-field-algorithm-steps-error' : undefined}
     onChange={(event) => setForm((current) => ({ ...current, algorithmSteps: event.target.value }))}
    />
   </Field>

   <div className="mt-3 grid gap-3 sm:grid-cols-2">
    <Field label="Статус качества">
     <Select
      name="qualityStatus"
      value={form.qualityStatus}
      onValueChange={(value) =>
       setForm((current) => ({
        ...current,
        qualityStatus: value as Form['qualityStatus'],
       }))
      }
     >
      <SelectTrigger className={inputClass} aria-label="Quality status">
       <SelectValue />
      </SelectTrigger>
      <SelectContent>
       {qualityStatuses.map((status) => (
        <SelectItem key={status} value={status}>
         {status}
        </SelectItem>
       ))}
      </SelectContent>
     </Select>
    </Field>
    <Field label="Активность">
     <Select
      name="isActive"
      value={form.isActive ? 'active' : 'inactive'}
      onValueChange={(value) =>
       setForm((current) => ({ ...current, isActive: value === 'active' }))
      }
     >
      <SelectTrigger className={inputClass} aria-label="Exercise activity">
       <SelectValue />
      </SelectTrigger>
      <SelectContent>
       <SelectItem value="active">Активно</SelectItem>
       <SelectItem value="inactive">Неактивно</SelectItem>
      </SelectContent>
     </Select>
    </Field>
   </div>

    <div ref={mainSaveAnchorRef} className="mt-5 grid gap-2 rounded-2xl border border-stroke bg-surface p-2 sm:grid-cols-[minmax(0,1fr)_auto]">
     <button
      type="submit"
      disabled={saving || deleting}
      onPointerDown={onSaveIntent}
      className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-[background-color,opacity,transform] duration-150 ease-out hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] disabled:cursor-not-allowed disabled:bg-slate-400 disabled:active:scale-100 dark:disabled:bg-slate-700"
    >
     {saving
      ? 'Сохранение...'
      : isEdit
       ? 'Сохранить изменения'
       : 'Создать задание'}
    </button>
    {isEdit ? (
     <button
      type="button"
      disabled={saving || deleting}
      onClick={onDeleteClick}
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition-[background-color,border-color,opacity,transform] duration-150 ease-out hover:border-red-300 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 dark:border-red-600 dark:bg-red-600 dark:text-white dark:hover:bg-red-700"
     >
      {deleting ? 'Удаление...' : 'Удалить'}
     </button>
    ) : null}
   </div>
  </>
 );
}

function Field({
 id,
 label,
 children,
 className = '',
 error,
}: {
 id?: string;
 label: string;
 children: ReactNode;
 className?: string;
 error?: string;
}) {
 const controlId = id ? `${id}-control` : undefined;
 const errorId = id ? `${id}-error` : undefined;
 return (
  <div id={id} className={`block ${className}`}>
   <label htmlFor={controlId} className="mb-1 block text-sm font-medium text-foreground/80 ">{label}</label>
   {children}
   {error && errorId ? (
    <p id={errorId} className="mt-1 text-xs font-medium text-red-600 dark:text-red-300">
     {error}
    </p>
   ) : null}
  </div>
 );
}
