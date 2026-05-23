'use client';
import { motion } from 'motion/react';
import { useState } from 'react';

type OptionsListProps = {
  options: string[];
  correctIndex: number;
  onSelect: (isCorrect: boolean, selectedIndex: number) => void;
  disabled?: boolean;
};

export default function OptionsList({ options, correctIndex, onSelect, disabled }: OptionsListProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

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

        let bgColor = "bg-white hover:bg-slate-50";
        let borderColor = "border-slate-200";
        let textColor = "text-slate-700";

        if (showResult) {
          if (isCorrect) {
            bgColor = "bg-emerald-50";
            borderColor = "border-emerald-400";
            textColor = "text-emerald-800";
          } else if (isSelected && !isCorrect) {
            bgColor = "bg-red-50";
            borderColor = "border-red-400";
            textColor = "text-red-800";
          }
        }

        return (
          <motion.button
            key={idx}
            whileHover={!showResult ? { scale: 1.01 } : {}}
            whileTap={!showResult ? { scale: 0.98 } : {}}
            animate={isSelected && !isCorrect ? { x: [-5, 5, -5, 5, 0] } : {}}
            transition={{ duration: 0.3 }}
            onClick={() => handleSelect(idx)}
            disabled={showResult || disabled}
            className={`w-full text-left px-5 py-3.5 rounded-xl border transition-all duration-200 ${bgColor} ${borderColor} ${textColor} shadow-sm font-medium`}
          >
            {option}
          </motion.button>
        );
      })}
    </div>
  );
}
