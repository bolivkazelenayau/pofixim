import type { Dispatch, SetStateAction } from 'react';
import { Field, inputClass } from '@/components/admin-form/constants';
import type { Form } from '@/components/admin-form/types';

type AdminEge20FieldsProps = {
  form: Form;
  setForm: Dispatch<SetStateAction<Form>>;
};

export default function AdminEge20Fields({ form, setForm }: AdminEge20FieldsProps) {
  if (form.type !== 'ege20_complex_sentence_punctuation') return null;

  return (
    <div className="mt-3 space-y-3">
      <Field label="Текст со слотами (например: ... (1) ... (2) ...)">
        <textarea
          name="ege20TextWithSlots"
          className={inputClass}
          rows={4}
          value={form.ege20TextWithSlots}
          onChange={(e) => setForm((f) => ({ ...f, ege20TextWithSlots: e.target.value }))}
        />
      </Field>
      <Field label="Слоты (через запятую)">
        <input
          name="ege20Slots"
          className={inputClass}
          value={form.ege20Slots}
          onChange={(e) => setForm((f) => ({ ...f, ege20Slots: e.target.value }))}
          placeholder="1, 2, 3, 4"
        />
      </Field>
      <Field label="Правильные номера (через запятую)">
        <input
          name="ege20TargetSet"
          className={inputClass}
          value={form.ege20TargetSet}
          onChange={(e) => setForm((f) => ({ ...f, ege20TargetSet: e.target.value }))}
          placeholder="1, 4"
        />
      </Field>
    </div>
  );
}
