import type { Dispatch, SetStateAction } from 'react';
import { Field, inputClass } from '@/components/admin-form/constants';
import type { Form } from '@/components/admin-form/types';

type AdminPunctuationInsertFieldsProps = {
  form: Form;
  setForm: Dispatch<SetStateAction<Form>>;
};

export default function AdminPunctuationInsertFields({ form, setForm }: AdminPunctuationInsertFieldsProps) {
  if (form.type !== 'punctuation_insert') return null;

  return (
    <div className="mt-3 space-y-3">
      <Field label="Токены предложения (через |)">
        <textarea
          className={inputClass}
          rows={2}
          value={form.punctuationTokens}
          onChange={(e) => setForm((f) => ({ ...f, punctuationTokens: e.target.value }))}
        />
      </Field>
      <Field label="Допустимые знаки (через запятую)">
        <input
          className={inputClass}
          value={form.punctuationAllowedMarks}
          onChange={(e) => setForm((f) => ({ ...f, punctuationAllowedMarks: e.target.value }))}
        />
      </Field>
      <Field label="Правильные позиции (индекс:знак)">
        <input
          className={inputClass}
          value={form.punctuationMarks}
          onChange={(e) => setForm((f) => ({ ...f, punctuationMarks: e.target.value }))}
        />
      </Field>
    </div>
  );
}
