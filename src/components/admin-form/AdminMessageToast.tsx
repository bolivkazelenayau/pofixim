'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

type AdminMessageToastProps = {
 message: string;
 isError: boolean;
};

export default function AdminMessageToast({ message, isError }: AdminMessageToastProps) {
 const lastToastRef = useRef('');

 useEffect(() => {
  const normalizedMessage = message.trim();
  if (!normalizedMessage) {
   lastToastRef.current = '';
   return;
  }

  const toastKey = `${isError ? 'error' : 'success'}:${normalizedMessage}`;
  if (lastToastRef.current === toastKey) return;
  lastToastRef.current = toastKey;

  if (isError) {
   toast.error(normalizedMessage, {
    id: 'admin-message',
    duration: 6500,
   });
   return;
  }

  toast.success(normalizedMessage, {
   id: 'admin-message',
   duration: 2600,
  });
 }, [isError, message]);

 return null;
}
