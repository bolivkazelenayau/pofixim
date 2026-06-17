'use client';

import { Toaster } from 'sonner';

export default function AppToaster() {
  return (
    <Toaster
      closeButton
      richColors
      position="bottom-right"
      toastOptions={{
        duration: 2800,
      }}
    />
  );
}
