import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { inputClass } from '@/components/admin-form/constants';
import type { Form } from '@/components/admin-form/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type AdminOrthographyRepairFieldsProps = {
 form: Form;
 setForm: Dispatch<SetStateAction<Form>>;
};

export default function AdminOrthographyRepairFields({
 form,
 setForm,
}: AdminOrthographyRepairFieldsProps) {
 if (form.type !== 'orthography_repair') return null;

 return (
  <div className="mt-3 space-y-3">
   <Field label="Текст с ошибкой">
    <textarea
     name="orthographyRepairText"
     className={inputClass}
     rows={4}
     value={form.orthographyRepairText}
     onChange={(event) =>
      setForm((current) => ({ ...current, orthographyRepairText: event.target.value }))
     }
     placeholder="Имейте ввиду, что она займет у Вас целый день."
    />
   </Field>
   <Field label="Режим">
    <Select
     name="orthographyRepairMode"
     value={form.orthographyRepairMode}
     onValueChange={(value) =>
      setForm((current) => ({
       ...current,
       orthographyRepairMode:
        value === 'click_then_type' ? 'click_then_type' : 'click_then_choose',
      }))
     }
    >
     <SelectTrigger className={inputClass} aria-label="Orthography repair mode">
      <SelectValue />
     </SelectTrigger>
     <SelectContent>
      <SelectItem value="click_then_choose">click_then_choose</SelectItem>
      <SelectItem value="click_then_type">click_then_type</SelectItem>
     </SelectContent>
    </Select>
   </Field>
   <Field label="Targets (id | surface | replacement | type | options | occurrence)">
    <textarea
     name="orthographyRepairTargets"
     className={inputClass}
     rows={5}
     value={form.orthographyRepairTargets}
     onChange={(event) =>
      setForm((current) => ({ ...current, orthographyRepairTargets: event.target.value }))
     }
     placeholder="target_1 | ввиду | в виду | span | ввиду, в виду, в-виду"
    />
   </Field>
   <Field label="Repairs (targetId | correct)">
    <textarea
     name="orthographyRepairRepairs"
     className={inputClass}
     rows={3}
     value={form.orthographyRepairRepairs}
     onChange={(event) =>
      setForm((current) => ({ ...current, orthographyRepairRepairs: event.target.value }))
     }
     placeholder="target_1 | в виду"
    />
   </Field>
   <Field label="Подсказки (по одной на строку)">
    <textarea
     name="orthographyRepairHints"
     className={inputClass}
     rows={3}
     value={form.orthographyRepairHints}
     onChange={(event) =>
      setForm((current) => ({ ...current, orthographyRepairHints: event.target.value }))
     }
     placeholder={'Ошибка в устойчивом сочетании.\nПравильно: иметь в виду.'}
    />
   </Field>
   <Field label="Правильный текст целиком (optional)">
    <textarea
     name="orthographyRepairCorrectText"
     className={inputClass}
     rows={3}
     value={form.orthographyRepairCorrectText}
     onChange={(event) =>
      setForm((current) => ({ ...current, orthographyRepairCorrectText: event.target.value }))
     }
     placeholder="Полный текст после исправления, только для показа."
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
