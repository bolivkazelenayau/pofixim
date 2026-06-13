import type { Dispatch, SetStateAction } from 'react';
import { Field, inputClass } from '@/components/admin-form/constants';
import type { Form } from '@/components/admin-form/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type AdminEge21FieldsProps = {
  form: Form;
  setForm: Dispatch<SetStateAction<Form>>;
};

export default function AdminEge21Fields({ form, setForm }: AdminEge21FieldsProps) {
  if (form.type !== 'ege21_punctuation_analysis') return null;

  return (
    <div className="mt-3 space-y-3">
      <Field label="Целевой знак">
        <Select
          name="ege21TargetPunctuation"
          value={form.ege21TargetPunctuation}
          onValueChange={(value) =>
            setForm((f) => ({
              ...f,
              ege21TargetPunctuation: value as Form['ege21TargetPunctuation'],
            }))
          }
        >
          <SelectTrigger className={inputClass} aria-label="Target punctuation">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="comma">comma</SelectItem>
            <SelectItem value="dash">dash</SelectItem>
            <SelectItem value="colon">colon</SelectItem>
            <SelectItem value="semicolon">semicolon</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Предложения (каждая строка: index. text)">
        <textarea
          name="ege21Sentences"
          className={inputClass}
          rows={5}
          value={form.ege21Sentences}
          onChange={(e) => setForm((f) => ({ ...f, ege21Sentences: e.target.value }))}
          placeholder={'1. Первое предложение\n2. Второе предложение'}
        />
      </Field>
      <Field label="Правильные номера (через запятую)">
        <input
          name="ege21TargetSet"
          className={inputClass}
          value={form.ege21TargetSet}
          onChange={(e) => setForm((f) => ({ ...f, ege21TargetSet: e.target.value }))}
          placeholder="1, 3, 5"
        />
      </Field>
    </div>
  );
}
