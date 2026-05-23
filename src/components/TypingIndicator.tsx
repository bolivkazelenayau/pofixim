'use client';

import { motion } from 'motion/react';

export default function TypingIndicator() {
  return (
    <div className="mb-4 flex w-full justify-start">
      <div className="flex h-11 items-center gap-1.5 rounded-2xl rounded-bl-none border border-[var(--stroke)] bg-[var(--surface-strong)] px-4 shadow-sm">
        {[0, 1, 2].map((dot) => (
          <motion.div
            key={dot}
            className="h-2 w-2 rounded-full bg-slate-400"
            animate={{ y: [0, -4, 0] }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: dot * 0.15,
            }}
          />
        ))}
      </div>
    </div>
  );
}
