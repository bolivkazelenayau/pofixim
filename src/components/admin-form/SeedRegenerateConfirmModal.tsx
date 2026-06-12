import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';

type SeedRegenerateConfirmModalProps = {
 onCancel: () => void;
 onConfirm: () => void;
};

export default function SeedRegenerateConfirmModal({
 onCancel,
 onConfirm,
}: SeedRegenerateConfirmModalProps) {
 return (
  <AlertDialogPrimitive.Root open onOpenChange={(open) => !open && onCancel()}>
   <AlertDialogPrimitive.Portal>
    <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/45" />
    <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-stroke bg-surface-strong p-5 text-foreground shadow-sm outline-none">
     <AlertDialogPrimitive.Title className="text-base font-semibold">
      Подтверждение
     </AlertDialogPrimitive.Title>
     <AlertDialogPrimitive.Description className="mt-2 text-sm text-foreground/80">
      Вы уверены, что хотите перегенерировать сид?
     </AlertDialogPrimitive.Description>
     <div className="mt-4 flex justify-end gap-2">
      <AlertDialogPrimitive.Cancel asChild>
       <button
        type="button"
        className="rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-sm font-semibold text-foreground/80 transition-colors duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:hover:bg-stroke"
       >
        Отмена
       </button>
      </AlertDialogPrimitive.Cancel>
      <AlertDialogPrimitive.Action asChild>
       <button
        type="button"
        className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        onClick={onConfirm}
       >
        Перегенерировать
       </button>
      </AlertDialogPrimitive.Action>
     </div>
    </AlertDialogPrimitive.Content>
   </AlertDialogPrimitive.Portal>
  </AlertDialogPrimitive.Root>
 );
}
