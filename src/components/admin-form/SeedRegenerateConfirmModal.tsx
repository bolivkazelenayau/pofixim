type SeedRegenerateConfirmModalProps = {
 onCancel: () => void;
 onConfirm: () => void;
};

export default function SeedRegenerateConfirmModal({
 onCancel,
 onConfirm,
}: SeedRegenerateConfirmModalProps) {
 return (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
   <div className="w-full max-w-md rounded-2xl border border-stroke bg-surface-strong p-5 shadow-xl ">
    <h4 className="text-base font-semibold text-foreground ">Подтверждение</h4>
    <p className="mt-2 text-sm text-foreground/80 ">
     Вы уверены, что хотите перегенерировать сид?
    </p>
    <div className="mt-4 flex justify-end gap-2">
     <button
      type="button"
      className="rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-sm font-semibold text-foreground/80 hover:bg-surface "
      onClick={onCancel}
     >
      Отмена
     </button>
     <button
      type="button"
      className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-strong"
      onClick={onConfirm}
     >
      Перегенерировать
     </button>
    </div>
   </div>
  </div>
 );
}
