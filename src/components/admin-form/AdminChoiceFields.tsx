import type { Dispatch, SetStateAction } from 'react';
import { inputClass } from '@/components/admin-form/constants';
import type { Form } from '@/components/admin-form/types';

type AdminChoiceFieldsProps = {
 form: Form;
 setForm: Dispatch<SetStateAction<Form>>;
};

export default function AdminChoiceFields({ form, setForm }: AdminChoiceFieldsProps) {
 if (form.type !== 'multiple_choice' && form.type !== 'ege_multi_select') {
  return null;
 }

 return (
  <div className="mt-3 space-y-2">
   <div className="text-sm font-medium text-foreground/80">Варианты ответа</div>
   {form.options.map((option, index) => (
    <div key={index} className="flex items-center gap-2">
     {form.type === 'multiple_choice' ? (
      <input
       type="radio"
       checked={form.correctOptionIndex === index}
       onChange={() => setForm((current) => ({ ...current, correctOptionIndex: index }))}
      />
     ) : (
      <span className="inline-flex w-5 justify-center text-xs font-semibold text-foreground/60">
       {index + 1}
      </span>
     )}
     <input
      className={inputClass}
      value={option}
      onChange={(event) =>
       setForm((current) => ({
        ...current,
        options: current.options.map((value, optionIndex) =>
         optionIndex === index ? event.target.value : value,
        ),
       }))
      }
     />
     {form.options.length > 2 ? (
      <button
       type="button"
       onClick={() =>
        setForm((current) => {
         const newOptions = current.options.filter((_, optionIndex) => optionIndex !== index);
         let newCorrect = current.correctOptionIndex;
         if (newCorrect === index) newCorrect = 0;
         else if (newCorrect > index) newCorrect--;
         return { ...current, options: newOptions, correctOptionIndex: newCorrect };
        })
       }
       className="p-1 text-slate-400 transition hover:text-red-500"
       title="Удалить вариант"
      >
       <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
       </svg>
      </button>
     ) : null}
    </div>
   ))}
   <button
    type="button"
    className="rounded-md border border-stroke px-2 py-1 text-xs text-foreground/80 hover:bg-surface"
    onClick={() => setForm((current) => ({ ...current, options: [...current.options, ''] }))}
   >
    Добавить вариант
   </button>
   {form.type === 'ege_multi_select' ? (
    <label className="mt-2 block">
     <div className="mb-1 text-sm font-medium text-foreground/80 ">Правильные номера (через запятую)</div>
     <input
      className={inputClass}
      value={form.multiCorrectOptionIndexes}
      onChange={(event) =>
       setForm((current) => ({ ...current, multiCorrectOptionIndexes: event.target.value }))
      }
     />
    </label>
   ) : null}
  </div>
 );
}
