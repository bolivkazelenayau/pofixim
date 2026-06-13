import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { inputClass } from '@/components/admin-form/constants';
import { renderPunctuationConstructorAnswer } from '@/components/admin-form/parsers';
import type { Form } from '@/components/admin-form/types';

type AdminPunctuationConstructorFieldsProps = {
 form: Form;
 setForm: Dispatch<SetStateAction<Form>>;
};

export default function AdminPunctuationConstructorFields({
 form,
 setForm,
}: AdminPunctuationConstructorFieldsProps) {
 if (form.type !== 'punctuation_constructor') return null;

 return (
  <div className="mt-3 space-y-3">
   <Field label="Токены предложения (через |)">
    <textarea
     name="punctuationConstructorTokens"
     className={inputClass}
     rows={2}
     value={form.punctuationConstructorTokens}
     onChange={(event) =>
      setForm((current) => ({ ...current, punctuationConstructorTokens: event.target.value }))
     }
     placeholder="Мне | сказали | Ждите | приедет | другой | замерщик"
    />
   </Field>
   <Field label="Банк знаков: period, comma, semicolon, colon, question, exclamation, quote_open, quote_close, paren_open, paren_close, dash, ellipsis">
    <input
     name="punctuationConstructorMarkBank"
     className={inputClass}
     value={form.punctuationConstructorMarkBank}
     onChange={(event) =>
      setForm((current) => ({ ...current, punctuationConstructorMarkBank: event.target.value }))
     }
    />
   </Field>
   <Field label="Подсказки (по одной на строку)">
    <textarea
     name="punctuationConstructorHints"
     className={inputClass}
     rows={3}
     value={form.punctuationConstructorHints}
     onChange={(event) =>
      setForm((current) => ({ ...current, punctuationConstructorHints: event.target.value }))
     }
     placeholder={'В предложении есть прямая речь.\nПосле слов автора нужен знак.'}
    />
   </Field>
   <Field label="Пошаговый режим (id | title | slot | marks)">
    <textarea
     name="punctuationConstructorGuidedSteps"
     className={inputClass}
     rows={4}
     value={form.punctuationConstructorGuidedSteps}
     onChange={(event) =>
      setForm((current) => ({
       ...current,
       punctuationConstructorGuidedSteps: event.target.value,
      }))
     }
     placeholder={'author_end | Где заканчиваются слова автора? | 2 | colon\nopen_quote | Где начинается прямая речь? | 2 | quote_open'}
    />
   </Field>
   <Field label="Правильные слоты (slot:mark)">
    <input
     name="punctuationConstructorPlacements"
     className={inputClass}
     value={form.punctuationConstructorPlacements}
     onChange={(event) =>
      setForm((current) => ({
       ...current,
       punctuationConstructorPlacements: event.target.value,
      }))
     }
     placeholder="2:colon, 2:quote_open, 3:comma, 6:quote_close, 6:period"
    />
   </Field>
   <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
    <div className="mb-1 text-xs font-bold uppercase text-emerald-700">
     Правильный ответ
    </div>
    <div className="text-base font-semibold leading-7 text-emerald-950">
     {renderPunctuationConstructorAnswer(
      form.punctuationConstructorTokens,
      form.punctuationConstructorPlacements,
     ) || 'Заполните токены и правильные слоты'}
    </div>
   </div>
   <Field label="Разбор слотов (slot | marks | text)">
    <textarea
     name="punctuationConstructorSlotExplanations"
     className={inputClass}
     rows={3}
     value={form.punctuationConstructorSlotExplanations}
     onChange={(event) =>
      setForm((current) => ({
       ...current,
       punctuationConstructorSlotExplanations: event.target.value,
      }))
     }
     placeholder={'2 | colon, quote_open | После слов автора ставится двоеточие и открываются кавычки.\n6 | quote_close, period | Реплика закрывается кавычкой, затем ставится точка.'}
    />
   </Field>
   <Field label="Структура (label | tokenStart | tokenEnd | kind)">
    <textarea
     name="punctuationConstructorSegments"
     className={inputClass}
     rows={2}
     value={form.punctuationConstructorSegments}
     onChange={(event) =>
      setForm((current) => ({ ...current, punctuationConstructorSegments: event.target.value }))
     }
     placeholder={'Слова автора | 0 | 1 | author_words\nПрямая речь | 2 | 5 | direct_speech'}
    />
   </Field>
  </div>
 );
}

function Field({
 label,
 children,
}: {
 label: string;
 children: ReactNode;
}) {
 return (
  <label className="block">
   <div className="mb-1 text-sm font-medium text-foreground/80 ">{label}</div>
   {children}
  </label>
 );
}
