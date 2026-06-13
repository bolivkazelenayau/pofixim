import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import { inputClass, qualityStatuses } from '@/components/admin-form/constants';
import type { Form } from '@/components/admin-form/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type AdminMetaFieldsProps = {
 form: Form;
 setForm: Dispatch<SetStateAction<Form>>;
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
    <Field id="admin-field-source-alignment" label="Source alignment">
     <input
      name="sourceAlignment"
      className={inputClass}
      value={form.sourceAlignment}
      onChange={(event) => setForm((current) => ({ ...current, sourceAlignment: event.target.value }))}
     />
    </Field>
    <Field id="admin-field-typical-mistake" label="Типичная ошибка">
     <input
      name="typicalMistake"
      className={inputClass}
      value={form.typicalMistake}
      onChange={(event) => setForm((current) => ({ ...current, typicalMistake: event.target.value }))}
     />
    </Field>
   </div>

   <Field id="admin-field-algorithm-steps" label="Algorithm steps (по строкам)" className="mt-3">
    <textarea
     name="algorithmSteps"
     className={inputClass}
     rows={3}
     value={form.algorithmSteps}
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
}: {
 id?: string;
 label: string;
 children: ReactNode;
 className?: string;
}) {
 return (
  <label id={id} className={`block ${className}`}>
   <div className="mb-1 text-sm font-medium text-foreground/80 ">{label}</div>
   {children}
  </label>
 );
}
