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
   className={`fixed right-6 bottom-6 z-40 hidden xl:block transition-[opacity,transform] duration-200 ease-out ${
    visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
   }`}
  >
   <button
   type="button"
   onPointerDown={onSaveIntent}
   onClick={onClick}
    disabled={!visible || saving || deleting}
    className={`rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-lg transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-primary-strong active:scale-[0.96] disabled:cursor-not-allowed disabled:bg-slate-400 dark:disabled:bg-slate-700 ${
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
