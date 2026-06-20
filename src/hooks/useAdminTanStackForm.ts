'use client';

import { useCallback, useMemo } from 'react';
import { useForm, useStore } from '@tanstack/react-form';
import { batch } from '@tanstack/store';
import type { Form } from '@/components/admin-form/types';
import { validateAdminFormValues } from '@/components/admin-form/validation';
import type { AdminFormValidation } from '@/components/admin-form/validation';

type SetFormAction = React.SetStateAction<Form>;

function resolveNextForm(current: Form, action: SetFormAction) {
  return typeof action === 'function'
    ? (action as (current: Form) => Form)(current)
    : action;
}

function changedFormKeys(current: Form, next: Form) {
  const keys = new Set<keyof Form>([
    ...(Object.keys(current) as Array<keyof Form>),
    ...(Object.keys(next) as Array<keyof Form>),
  ]);

  return [...keys].filter((key) => !Object.is(current[key], next[key]));
}

export function useAdminTanStackForm(initialForm: Form) {
  const adminFormApi = useForm({
    defaultValues: initialForm,
    validators: {
      onChange: ({ value }) => {
        const validation = validateAdminFormValues(value);
        return validation.summary.length > 0 ? validation.fieldErrors : undefined;
      },
      onSubmit: ({ value }) => {
        const validation = validateAdminFormValues(value);
        return validation.summary.length > 0 ? validation.fieldErrors : undefined;
      },
    },
  });

  const form = useStore(adminFormApi.store, (state) => state.values);

  const setForm = useCallback<React.Dispatch<SetFormAction>>(
    (action) => {
      const current = adminFormApi.state.values;
      const next = resolveNextForm(current, action);
      const keys = changedFormKeys(current, next);

      if (keys.length === 0) return;

      batch(() => {
        for (const key of keys) {
          adminFormApi.setFieldValue(key as never, next[key] as never);
        }
      });
    },
    [adminFormApi],
  );

  const validation = useMemo<AdminFormValidation>(
    () => validateAdminFormValues(form),
    [form],
  );

  return {
    adminFormApi,
    form,
    setForm,
    validation,
  };
}
