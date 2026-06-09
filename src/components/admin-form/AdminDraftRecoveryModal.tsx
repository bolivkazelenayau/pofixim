import { History } from 'lucide-react';

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
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm transition-all">
   <div className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-stroke/50 bg-surface-strong shadow-2xl">
    <div className="border-b border-stroke/50 bg-surface/30 p-6">
     <div className="flex items-center gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 shadow-sm">
       <History className="h-6 w-6" />
      </div>
      <div>
       <p className="text-[11px] font-bold uppercase tracking-wider text-amber-500">
        Локальная страховочная копия
       </p>
       <h4 className="mt-1 text-lg font-bold tracking-tight text-foreground">
        Восстановление задания #{exerciseId}
       </h4>
      </div>
     </div>
    </div>
    <div className="p-6">
     <p className="text-sm leading-relaxed text-foreground/75">
      В браузере осталась версия, которая отличается от данных в базе. Можно восстановить её и продолжить редактирование
      или отказаться от неё и открыть текущую версию из базы.
     </p>
     <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <button
       type="button"
       className="rounded-xl border border-stroke/60 bg-surface px-4 py-3 text-sm font-semibold text-foreground/70 transition-all hover:bg-stroke/40 hover:text-foreground"
       onClick={onUseDatabaseVersion}
      >
       Использовать версию из БД
      </button>
      <button
       type="button"
       className="rounded-xl bg-gradient-to-r from-primary to-primary-strong px-4 py-3 text-sm font-bold text-white shadow-lg shadow-primary/30 transition-all hover:-translate-y-0.5 hover:shadow-primary/40 active:translate-y-0"
       onClick={onUseRecoveredDraft}
      >
       Восстановить изменения
      </button>
     </div>
    </div>
   </div>
  </div>
 );
}
