import { History } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';

type AdminDraftRecoveryModalProps = {
 exerciseId: number;
 onUseDatabaseVersion: () => void;
 onUseRecoveredDraft: () => void;
};

export default function AdminDraftRecoveryModal({
 exerciseId,
 onUseDatabaseVersion,
 onUseRecoveredDraft,
}: AdminDraftRecoveryModalProps) {
 return (
  <DialogPrimitive.Root open>
   <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="admin-modal-overlay admin-modal-overlay--strong" />
    <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-modal w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[28px] border border-stroke/50 bg-surface-strong text-foreground shadow-sm outline-none">
     <div className="border-b border-stroke/50 bg-surface/30 p-6">
      <div className="flex items-center gap-4">
       <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 shadow-sm">
        <History className="h-6 w-6" aria-hidden="true" />
       </div>
       <div>
        <p className="text-[11px] font-bold uppercase text-amber-500">
         Локальная страховочная копия
        </p>
        <DialogPrimitive.Title className="mt-1 text-lg font-bold">
         Восстановление задания #{exerciseId}
        </DialogPrimitive.Title>
       </div>
      </div>
     </div>
     <div className="p-6">
      <DialogPrimitive.Description className="text-sm leading-relaxed text-foreground/75">
       В браузере осталась версия, которая отличается от данных в базе. Можно восстановить ее и продолжить редактирование или отказаться от нее и открыть текущую версию из базы.
      </DialogPrimitive.Description>
      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
       <button
        type="button"
        className="rounded-xl border border-stroke/60 bg-surface px-4 py-3 text-sm font-semibold text-foreground/70 transition-colors duration-150 ease-out hover:bg-stroke hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:hover:bg-stroke"
        onClick={onUseDatabaseVersion}
       >
        Использовать версию из БД
       </button>
       <button
        type="button"
        className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-sm transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96]"
        onClick={onUseRecoveredDraft}
       >
        Восстановить изменения
       </button>
      </div>
     </div>
    </DialogPrimitive.Content>
   </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
 );
}
