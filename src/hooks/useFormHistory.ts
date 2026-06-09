'use client';

import { useEffect, useRef } from 'react';
import type { Form } from '@/components/admin-form/types';

interface UseFormHistoryOptions {
  form: Form;
  isDraftLoaded: boolean;
  setForm: React.Dispatch<React.SetStateAction<Form>>;
}

export function useFormHistory({ form, isDraftLoaded, setForm }: UseFormHistoryOptions) {
  const historyPastRef = useRef<Form[]>([]);
  const historyFutureRef = useRef<Form[]>([]);
  const suppressHistoryRef = useRef(false);
  const lastSnapshotRef = useRef('');

  useEffect(() => {
    if (!isDraftLoaded) return;
    const snapshot = JSON.stringify(form);
    if (!lastSnapshotRef.current) {
      lastSnapshotRef.current = snapshot;
      historyPastRef.current = [JSON.parse(snapshot) as Form];
      historyFutureRef.current = [];
      return;
    }
    if (suppressHistoryRef.current) {
      suppressHistoryRef.current = false;
      lastSnapshotRef.current = snapshot;
      return;
    }
    if (snapshot === lastSnapshotRef.current) return;
    const parsed = JSON.parse(snapshot) as Form;
    historyPastRef.current.push(parsed);
    if (historyPastRef.current.length > 120) {
      historyPastRef.current.shift();
    }
    historyFutureRef.current = [];
    lastSnapshotRef.current = snapshot;
  }, [form, isDraftLoaded]);

  function applyHistoryState(next: Form) {
    suppressHistoryRef.current = true;
    setForm(next);
  }

  function undoForm() {
    if (historyPastRef.current.length <= 1) return;
    const current = historyPastRef.current.pop();
    if (!current) return;
    historyFutureRef.current.unshift(current);
    const previous = historyPastRef.current[historyPastRef.current.length - 1];
    if (previous) applyHistoryState(previous);
  }

  function redoForm() {
    const next = historyFutureRef.current.shift();
    if (!next) return;
    historyPastRef.current.push(next);
    applyHistoryState(next);
  }

  return { undoForm, redoForm };
}
