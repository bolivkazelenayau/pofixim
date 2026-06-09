type AdminEditorHeaderProps = {
 isEdit: boolean;
 hasUnsavedChanges: boolean;
 onUndo: () => void;
 onRedo: () => void;
 onNewDraft: () => void;
};

export default function AdminEditorHeader({
 isEdit,
 hasUnsavedChanges,
 onUndo,
 onRedo,
 onNewDraft,
}: AdminEditorHeaderProps) {
 return (
  <div className="mb-4 flex items-center justify-between">
   <h2 className="text-xl font-semibold text-foreground ">
    {isEdit ? 'Редактирование задания' : 'Создание задания'}
   </h2>
   {hasUnsavedChanges ? <span className="text-xs font-medium text-amber-600">Есть несохранённые изменения</span> : null}
   <div className="flex items-center gap-2">
    <button
     type="button"
     className="rounded-md px-2 py-1 text-xs font-medium text-foreground/70 hover:bg-stroke"
     onClick={onUndo}
     title="Undo"
    >
     Undo
    </button>
    <button
     type="button"
     className="rounded-md px-2 py-1 text-xs font-medium text-foreground/70 hover:bg-stroke"
     onClick={onRedo}
     title="Redo"
    >
     Redo
    </button>
    <button
     type="button"
     className="rounded-md px-2 py-1 text-xs font-medium text-foreground/70 hover:bg-stroke"
     onClick={onNewDraft}
    >
     Новый черновик
    </button>
   </div>
  </div>
 );
}
