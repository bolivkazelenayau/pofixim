import type { Dispatch, SetStateAction } from 'react';
import { Field, inputClass } from '@/components/admin-form/constants';
import type { Form } from '@/components/admin-form/types';
import type { AdminFieldErrors } from '@/components/admin-form/validation';

type AdminFillBlankFieldsProps = {
  form: Form;
  setForm: Dispatch<SetStateAction<Form>>;
  fieldErrors?: AdminFieldErrors;
};

export default function AdminFillBlankFields({ form, setForm, fieldErrors = {} }: AdminFillBlankFieldsProps) {
  if (form.type !== 'fill_blank') return null;

  return (
    <div className="mt-3 grid gap-3">
      <Field id="admin-field-fill-before" label="Текст до пропуска">
        <textarea
          name="fillBefore"
          className={`${inputClass} min-h-28 resize-y leading-6`}
          value={form.fillBefore}
          onChange={(e) => setForm((f) => ({ ...f, fillBefore: e.target.value }))}
        />
      </Field>
      <Field id="admin-field-fill-after" label="Текст после пропуска">
        <textarea
          name="fillAfter"
          className={`${inputClass} min-h-20 resize-y leading-6`}
          value={form.fillAfter}
          onChange={(e) => setForm((f) => ({ ...f, fillAfter: e.target.value }))}
        />
      </Field>
      <Field
        id="admin-field-fill-accepted"
        label="Допустимые ответы (через запятую)"
      >
        <input
          id="admin-field-fill-accepted-control"
          name="fillAccepted"
          className={inputClass}
          value={form.fillAccepted}
          aria-invalid={Boolean(fieldErrors.fillAccepted)}
          aria-describedby={fieldErrors.fillAccepted ? 'admin-field-fill-accepted-error' : undefined}
          onChange={(e) => setForm((f) => ({ ...f, fillAccepted: e.target.value }))}
        />
        {fieldErrors.fillAccepted ? (
          <p id="admin-field-fill-accepted-error" className="mt-1 text-xs font-medium text-red-600 dark:text-red-300">
            {fieldErrors.fillAccepted}
          </p>
        ) : null}
      </Field>
    </div>
  );
}
