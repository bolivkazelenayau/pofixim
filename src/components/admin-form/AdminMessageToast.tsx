'use client';

import { useEffect, useState } from 'react';

type AdminMessageToastProps = {
 message: string;
 isError: boolean;
};

export default function AdminMessageToast({ message, isError }: AdminMessageToastProps) {
 const [visibleMessage, setVisibleMessage] = useState(message);
 const [isVisible, setIsVisible] = useState(false);

 useEffect(() => {
  if (!message) {
   const hideTimer = window.setTimeout(() => setIsVisible(false), 0);
   const clearTimer = window.setTimeout(() => setVisibleMessage(''), 220);
   return () => {
    window.clearTimeout(hideTimer);
    window.clearTimeout(clearTimer);
   };
  }

  const mountTimer = window.setTimeout(() => {
   setVisibleMessage(message);
   setIsVisible(false);
  }, 0);
  const enterTimer = window.setTimeout(() => setIsVisible(true), 20);
  const exitTimer = window.setTimeout(() => setIsVisible(false), 2600);
  const clearTimer = window.setTimeout(() => setVisibleMessage(''), 2840);

  return () => {
   window.clearTimeout(mountTimer);
   window.clearTimeout(enterTimer);
   window.clearTimeout(exitTimer);
   window.clearTimeout(clearTimer);
  };
 }, [message]);

 if (!visibleMessage) return null;

  return (
  <div
   role={isError ? 'alert' : 'status'}
   aria-live={isError ? 'assertive' : 'polite'}
   className={`fixed right-6 bottom-6 z-toast mb-4 max-w-[min(36rem,calc(100vw-3rem))] rounded-xl border px-5 py-3 text-sm leading-6 font-medium whitespace-normal break-words shadow-xl transition-opacity duration-200 ease-out ${
    isVisible ? 'opacity-100' : 'opacity-0'
   } ${
    isError
     ? 'border-red-200 bg-red-50 text-red-700'
     : 'border-emerald-200 bg-emerald-50 text-emerald-700'
   }`}
  >
   {visibleMessage}
  </div>
 );
}
