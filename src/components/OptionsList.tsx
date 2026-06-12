'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import {
  PRESS_TAP,
  QUICK_FEEDBACK_TRANSITION,
  whenMotion,
} from '@/lib/motion';

type OptionsListProps = {
  options: string[];
  correctIndex: number;
  onSelect: (isCorrect: boolean, selectedIndex: number) => void;
  disabled?: boolean;
};

export default function OptionsList({ options, correctIndex, onSelect, disabled }: OptionsListProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const handleSelect = (index: number) => {
    if (disabled || selectedIndex !== null) return;
    setSelectedIndex(index);
    const isCorrect = index === correctIndex;
    onSelect(isCorrect, index);
  };

  return (
    <div className="flex flex-col gap-2 w-full mt-2 mb-4">
      {options.map((option, idx) => {
        const isSelected = selectedIndex === idx;
        const isCorrect = idx === correctIndex;
        const showResult = selectedIndex !== null;

        let bgColor = 'bg-surface-strong hover:bg-stroke dark:hover:bg-stroke';
        let borderColor = 'border-stroke';
        let textColor = 'text-foreground/80';

        if (showResult) {
          if (isCorrect) {
            bgColor = 'bg-emerald-50 dark:bg-emerald-500/10';
            borderColor = 'border-emerald-400';
            textColor = 'text-emerald-800 dark:text-emerald-100';
          } else if (isSelected && !isCorrect) {
            bgColor = 'bg-red-50 dark:bg-red-500/10';
            borderColor = 'border-red-400';
            textColor = 'text-red-800 dark:text-red-100';
          }
        }

        return (
          <motion.button
            key={idx}
            whileTap={whenMotion(!showResult && !shouldReduceMotion, PRESS_TAP)}
            animate={whenMotion(isSelected && !isCorrect && !shouldReduceMotion, { x: [-4, 4, -3, 3, 0] })}
            transition={QUICK_FEEDBACK_TRANSITION}
            onClick={() => handleSelect(idx)}
            disabled={showResult || disabled}
            className={`w-full rounded-xl border px-5 py-3.5 text-left font-medium shadow-sm transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 ${bgColor} ${borderColor} ${textColor}`}
          >
            {option}
          </motion.button>
        );
      })}
    </div>
  );
}
