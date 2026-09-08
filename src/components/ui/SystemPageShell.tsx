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
            <span className="sr-only">{eyebrow}</span>
            <h1
              className="text-3xl font-semibold tracking-tight text-white md:text-4xl"
            >
              {title}
            </h1>
            {description && (
              <p className="mt-3 max-w-2xl text-sm font-body leading-6 text-white/72">
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
