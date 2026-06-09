import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { inputClass } from '@/components/admin-form/constants';
import type { Form } from '@/components/admin-form/types';

type AdminDictationFieldsProps = {
 form: Form;
 setForm: Dispatch<SetStateAction<Form>>;
};

export default function AdminDictationFields({ form, setForm }: AdminDictationFieldsProps) {
 if (form.type !== 'dictation') return null;

 return (
  <div className="mt-3 space-y-3">
   <Field label="Название диктанта">
    <input
     className={inputClass}
     value={form.dictationTitle}
     onChange={(event) =>
      setForm((current) => ({ ...current, dictationTitle: event.target.value }))
     }
     placeholder="Цифровой след"
    />
   </Field>
   <Field label="Путь к аудио">
    <input
     className={inputClass}
     value={form.dictationAudioSrc}
     onChange={(event) =>
      setForm((current) => ({ ...current, dictationAudioSrc: event.target.value }))
     }
     placeholder="/voice_memos/audio_2026-06-08_00-53-43.ogg"
    />
   </Field>
   <Field label="Скорости воспроизведения">
    <input
     className={inputClass}
     value={form.dictationPlaybackRates}
     onChange={(event) =>
      setForm((current) => ({ ...current, dictationPlaybackRates: event.target.value }))
     }
     placeholder="0.75, 1, 1.25, 1.5"
    />
   </Field>
   <Field label="Эталонная расшифровка">
    <textarea
     className={inputClass}
     rows={6}
     value={form.dictationText}
     onChange={(event) =>
      setForm((current) => ({ ...current, dictationText: event.target.value }))
     }
     placeholder="Текст, который должен повторить ученик."
    />
   </Field>
   <div className="grid gap-3 sm:grid-cols-2">
    <label className="flex items-center gap-2 rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-sm font-medium text-foreground/80">
     <input
      type="checkbox"
      checked={form.dictationCaseSensitive}
      onChange={(event) =>
       setForm((current) => ({ ...current, dictationCaseSensitive: event.target.checked }))
      }
     />
     Учитывать регистр
    </label>
    <label className="flex items-center gap-2 rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-sm font-medium text-foreground/80">
     <input
      type="checkbox"
      checked={form.dictationIgnorePunctuation}
      onChange={(event) =>
       setForm((current) => ({ ...current, dictationIgnorePunctuation: event.target.checked }))
      }
     />
     Игнорировать пунктуацию
    </label>
   </div>
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
