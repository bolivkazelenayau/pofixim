import type { Dispatch, SetStateAction } from 'react';
import { Field, inputClass } from '@/components/admin-form/constants';
import type { Form } from '@/components/admin-form/types';

type AdminFillBlankFieldsProps = {
  form: Form;
  setForm: Dispatch<SetStateAction<Form>>;
};

export default function AdminFillBlankFields({ form, setForm }: AdminFillBlankFieldsProps) {
  if (form.type !== 'fill_blank') return null;

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <Field id="admin-field-fill-before" label="Текст до пропуска">
        <input
          name="fillBefore"
          className={inputClass}
          value={form.fillBefore}
          onChange={(e) => setForm((f) => ({ ...f, fillBefore: e.target.value }))}
        />
      </Field>
      <Field id="admin-field-fill-after" label="Текст после пропуска">
        <input
          name="fillAfter"
          className={inputClass}
          value={form.fillAfter}
          onChange={(e) => setForm((f) => ({ ...f, fillAfter: e.target.value }))}
        />
      </Field>
      <Field
        id="admin-field-fill-accepted"
        label="Допустимые ответы (через запятую)"
        className="sm:col-span-2"
      >
        <input
          name="fillAccepted"
          className={inputClass}
          value={form.fillAccepted}
          onChange={(e) => setForm((f) => ({ ...f, fillAccepted: e.target.value }))}
        />
      </Field>
    </div>
  );
}
