type DeleteExerciseConfirmModalProps = {
 exerciseLabel: string;
 deleting: boolean;
 onCancel: () => void;
 onConfirm: () => void;
};

export default function DeleteExerciseConfirmModal({
 exerciseLabel,
 deleting,
 onCancel,
 onConfirm,
}: DeleteExerciseConfirmModalProps) {
 return (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
   <div className="w-full max-w-md rounded-2xl border border-stroke bg-surface-strong p-5 shadow-xl ">
    <h4 className="text-base font-semibold text-foreground ">Подтверждение удаления</h4>
    <p className="mt-2 text-sm text-foreground/80 ">
     Удалить упражнение {exerciseLabel}? Это действие также удалит связанные попытки и не может быть отменено.
    </p>
    <div className="mt-4 flex justify-end gap-2">
     <button
      type="button"
      className="rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-sm font-semibold text-foreground/80 hover:bg-surface "
      onClick={onCancel}
      disabled={deleting}
     >
      Отмена
     </button>
     <button
      type="button"
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-600 dark:bg-red-600 dark:text-white dark:hover:bg-red-700"
      onClick={onConfirm}
      disabled={deleting}
     >
      {deleting ? 'Удаление...' : 'Удалить'}
     </button>
    </div>
   </div>
  </div>
 );
}
