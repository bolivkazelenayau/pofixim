import type { Dispatch, SetStateAction } from 'react';
import { Field, inputClass } from '@/components/admin-form/constants';
import type { Form } from '@/components/admin-form/types';

type AdminOrderFragmentsFieldsProps = {
  form: Form;
  setForm: Dispatch<SetStateAction<Form>>;
};

export default function AdminOrderFragmentsFields({ form, setForm }: AdminOrderFragmentsFieldsProps) {
  if (form.type !== 'order_fragments') return null;

  return (
    <div className="mt-3 space-y-3">
      <Field label="Фрагменты (каждая строка: id | text)">
        <textarea
          name="orderFragments"
          className={inputClass}
          rows={5}
          value={form.orderFragments}
          onChange={(e) => setForm((f) => ({ ...f, orderFragments: e.target.value }))}
          placeholder={'f1 | Первый фрагмент\nf2 | Второй фрагмент'}
        />
      </Field>
      <Field label="Правильный порядок id (через запятую)">
        <input
          name="orderCorrectOrder"
          className={inputClass}
          value={form.orderCorrectOrder}
          onChange={(e) => setForm((f) => ({ ...f, orderCorrectOrder: e.target.value }))}
          placeholder="f2, f1"
        />
      </Field>
    </div>
  );
}
