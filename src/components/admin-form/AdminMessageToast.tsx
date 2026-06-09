type AdminMessageToastProps = {
 message: string;
 isError: boolean;
};

export default function AdminMessageToast({ message, isError }: AdminMessageToastProps) {
 if (!message) return null;

 return (
  <div
   className={`fixed right-6 bottom-6 z-50 mb-4 max-w-[min(36rem,calc(100vw-3rem))] rounded-xl border px-5 py-3 text-sm leading-6 font-medium whitespace-normal break-words shadow-2xl transition-all animate-in fade-in slide-in-from-bottom-5 ${
    isError
     ? 'border-red-200 bg-red-50 text-red-700'
     : 'border-emerald-200 bg-emerald-50 text-emerald-700'
   }`}
  >
   {message}
  </div>
 );
}
