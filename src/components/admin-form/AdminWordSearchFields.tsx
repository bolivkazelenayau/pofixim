import type { Dispatch, SetStateAction } from 'react';
import { Field, inputClass } from '@/components/admin-form/constants';
import type { Form } from '@/components/admin-form/types';

type AdminWordSearchFieldsProps = {
  form: Form;
  setForm: Dispatch<SetStateAction<Form>>;
};

export default function AdminWordSearchFields({ form, setForm }: AdminWordSearchFieldsProps) {
  if (form.type !== 'word_search') return null;

  return (
    <div className="mt-3 space-y-3">
      <Field label="Сетка (каждая строка — строка букв)">
        <textarea
          className={inputClass}
          rows={6}
          value={form.wordSearchGridRows}
          onChange={(e) => setForm((f) => ({ ...f, wordSearchGridRows: e.target.value }))}
          placeholder={'документы\nпколняьт\nрсвязаяв'}
        />
      </Field>
      <Field label="Скрытые слова (по одному на строку)">
        <textarea
          className={inputClass}
          rows={4}
          value={form.wordSearchWords}
          onChange={(e) => setForm((f) => ({ ...f, wordSearchWords: e.target.value }))}
          placeholder={'договор\nзаявление\nакт'}
        />
      </Field>
    </div>
  );
}
