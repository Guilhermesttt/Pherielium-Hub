import React, { useRef } from "react";
import { motion } from "framer-motion";
import { useGamepadNavigation } from "../../hooks/useGamepadNavigation";

export interface SystemPageShellProps {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const SystemPageShell: React.FC<SystemPageShellProps> = React.memo(
  ({ eyebrow, title, description, actions, children }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    useGamepadNavigation({
      scrollRef: scrollRef as React.RefObject<HTMLElement>,
      scrollSpeed: 25,
      disableX: true,
      disableO: true,
    });

    return (
      <motion.div
        ref={scrollRef}
        data-system-page
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="flex-1 overflow-y-auto px-6 pb-12 pt-8 thin-scrollbar lg:px-10"
      >
        <div className="mx-auto flex min-h-full max-w-6xl flex-col">
          <div className="mx-auto mb-8 w-full max-w-5xl">
            {eyebrow && (
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/[0.06] border border-white/[0.08] backdrop-blur-md mb-3 text-[11px] font-mono font-semibold tracking-wider text-white/70 uppercase">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                <span>{eyebrow}</span>
              </div>
            )}
            <h1 className="text-3xl font-display font-black tracking-tight text-white md:text-4xl leading-tight">
              {title}
            </h1>
            {description && (
              <p className="mt-2.5 max-w-2xl text-sm font-body leading-relaxed text-white/60">
                {description}
              </p>
            )}
            {actions && <div className="mt-5 flex flex-wrap items-center gap-3">{actions}</div>}
          </div>
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </div>
      </motion.div>
    );
  },
);

SystemPageShell.displayName = "SystemPageShell";
