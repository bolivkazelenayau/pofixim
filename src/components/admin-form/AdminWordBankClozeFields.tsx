import type { Dispatch, SetStateAction } from 'react';
import { Field, inputClass } from '@/components/admin-form/constants';
import type { Form } from '@/components/admin-form/types';

type AdminWordBankClozeFieldsProps = {
  form: Form;
  setForm: Dispatch<SetStateAction<Form>>;
};

export default function AdminWordBankClozeFields({ form, setForm }: AdminWordBankClozeFieldsProps) {
  if (form.type !== 'word_bank_cloze') return null;

  return (
    <div className="mt-3 space-y-3">
      <Field label="Текст со слотами ([[1]], [[2]], ...)">
        <textarea
          name="wordBankTextWithSlots"
          className={inputClass}
          rows={4}
          value={form.wordBankTextWithSlots}
          onChange={(e) => setForm((f) => ({ ...f, wordBankTextWithSlots: e.target.value }))}
          placeholder="Я [[1]] из дома и [[2]] зонт."
        />
      </Field>
      <Field label="Банк слов (по одному на строку)">
        <textarea
          name="wordBankWords"
          className={inputClass}
          rows={4}
          value={form.wordBankWords}
          onChange={(e) => setForm((f) => ({ ...f, wordBankWords: e.target.value }))}
          placeholder={'вышел\nвзял\nувидел'}
        />
      </Field>
      <Field label="Правильные слова по слотам (по одному на строку)">
        <textarea
          name="wordBankCorrectBySlot"
          className={inputClass}
          rows={3}
          value={form.wordBankCorrectBySlot}
          onChange={(e) => setForm((f) => ({ ...f, wordBankCorrectBySlot: e.target.value }))}
          placeholder={'вышел\nвзял'}
        />
      </Field>
    </div>
  );
}
