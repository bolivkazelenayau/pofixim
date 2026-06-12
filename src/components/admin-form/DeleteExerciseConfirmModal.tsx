import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';

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
  <AlertDialogPrimitive.Root
   open
   onOpenChange={(open) => {
    if (!open && !deleting) onCancel();
   }}
  >
   <AlertDialogPrimitive.Portal>
    <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/45" />
    <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-stroke bg-surface-strong p-5 text-foreground shadow-sm outline-none">
     <AlertDialogPrimitive.Title className="text-base font-semibold">
      Подтверждение удаления
     </AlertDialogPrimitive.Title>
     <AlertDialogPrimitive.Description className="mt-2 text-sm text-foreground/80">
      Удалить упражнение {exerciseLabel}? Это действие также удалит связанные попытки и не может быть отменено.
     </AlertDialogPrimitive.Description>
     <div className="mt-4 flex justify-end gap-2">
      <AlertDialogPrimitive.Cancel asChild>
       <button
        type="button"
        className="rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-sm font-semibold text-foreground/80 transition-colors duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-stroke"
        disabled={deleting}
       >
        Отмена
       </button>
      </AlertDialogPrimitive.Cancel>
      <AlertDialogPrimitive.Action asChild>
       <button
        type="button"
        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition-colors duration-150 ease-out hover:border-red-300 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-600 dark:bg-red-600 dark:text-white dark:hover:bg-red-700"
        onClick={onConfirm}
        disabled={deleting}
       >
        {deleting ? 'Удаление...' : 'Удалить'}
       </button>
      </AlertDialogPrimitive.Action>
     </div>
    </AlertDialogPrimitive.Content>
   </AlertDialogPrimitive.Portal>
  </AlertDialogPrimitive.Root>
 );
}
