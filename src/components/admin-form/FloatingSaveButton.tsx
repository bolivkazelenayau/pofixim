type FloatingSaveButtonProps = {
 visible: boolean;
 saving: boolean;
 deleting: boolean;
 isEdit: boolean;
 onClick: () => void;
 onSaveIntent: () => void;
};

export default function FloatingSaveButton({
 visible,
 saving,
 deleting,
 isEdit,
 onClick,
 onSaveIntent,
}: FloatingSaveButtonProps) {
  return (
  <div
   className={`fixed right-6 bottom-6 z-floating hidden xl:block transition-opacity duration-150 ease-out [will-change:opacity] ${
    visible ? 'opacity-100' : 'opacity-0'
   }`}
  >
   <button
   type="button"
   onPointerDown={onSaveIntent}
   onClick={onClick}
     disabled={saving || deleting}
     tabIndex={visible ? 0 : -1}
     aria-hidden={!visible}
     className={`rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] disabled:cursor-not-allowed disabled:bg-slate-400 disabled:active:scale-100 dark:disabled:bg-slate-700 ${
     visible ? 'pointer-events-auto' : 'pointer-events-none'
    }`}
   >
    {saving
     ? 'Сохранение...'
     : isEdit
      ? 'Сохранить изменения'
      : 'Создать задание'}
   </button>
  </div>
 );
}
