import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useGamepadButton } from "@/context/GamepadContext";
import { activateElementWithController } from "@/utils/controllerTextInput";

interface ModalShellProps {
  isOpen: boolean;
  onClose: (silent?: boolean) => void;
  children: React.ReactNode;
  title?: string;
  maxWidthClassName?: string;
  className?: string;
  backdropClassName?: string;
  containerClassName?: string;
  zIndexClassName?: string;
  reducedEffects?: boolean;
  ariaLabel?: string;
  gamepadPriority?: number;
}

const focusableSelector = [
  "button:not(:disabled)",
  "a[href]",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  children,
  title,
  maxWidthClassName = "max-w-2xl",
  className,
  backdropClassName,
  containerClassName,
  zIndexClassName = "z-[100]",
  reducedEffects = false,
  gamepadPriority = 100,
  ariaLabel,
}) => {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);
  const onCloseRef = React.useRef(onClose);
  const prefersReducedMotion = useReducedMotion();
  const shouldReduceEffects = reducedEffects || prefersReducedMotion;
  onCloseRef.current = onClose;

  const getFocusableElements = React.useCallback(() => {
    const root = contentRef.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter(
      (element) => element.getClientRects().length > 0,
    );
  }, []);

  const moveLinearFocus = React.useCallback((offset: -1 | 1) => {
    const elements = getFocusableElements();
    if (elements.length === 0) return;
    const currentIndex = elements.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
      currentIndex < 0
        ? 0
        : (currentIndex + offset + elements.length) % elements.length;
    elements[nextIndex]?.focus({ preventScroll: true });
    elements[nextIndex]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [getFocusableElements]);

  const moveSpatialFocus = React.useCallback((direction: "up" | "down" | "left" | "right") => {
    const elements = getFocusableElements();
    if (elements.length === 0) return;
    const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!current || !elements.includes(current)) {
      elements[0]?.focus({ preventScroll: true });
      return;
    }

    const currentRect = current.getBoundingClientRect();
    const originX = currentRect.left + currentRect.width / 2;
    const originY = currentRect.top + currentRect.height / 2;
    const candidate = elements
      .filter((element) => element !== current)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const dx = rect.left + rect.width / 2 - originX;
        const dy = rect.top + rect.height / 2 - originY;
        const valid = direction === "left" ? dx < -6 : direction === "right" ? dx > 6 : direction === "up" ? dy < -6 : dy > 6;
        if (!valid) return null;
        const primary = direction === "left" || direction === "right" ? Math.abs(dx) : Math.abs(dy);
        const secondary = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
        return { element, score: primary * 4 + secondary };
      })
      .filter((item): item is { element: HTMLElement; score: number } => Boolean(item))
      .sort((a, b) => a.score - b.score)[0]?.element;

    candidate?.focus({ preventScroll: true });
    candidate?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [getFocusableElements]);

  useGamepadButton("DPAD_UP", () => moveSpatialFocus("up"), isOpen, gamepadPriority);
  useGamepadButton("DPAD_LEFT", () => moveSpatialFocus("left"), isOpen, gamepadPriority);
  useGamepadButton("DPAD_DOWN", () => moveSpatialFocus("down"), isOpen, gamepadPriority);
  useGamepadButton("DPAD_RIGHT", () => moveSpatialFocus("right"), isOpen, gamepadPriority);
  useGamepadButton("X", () => {
    const activeElement = document.activeElement;
    if (contentRef.current?.contains(activeElement) && activeElement instanceof HTMLElement) {
      activateElementWithController(activeElement);
    }
  }, isOpen, gamepadPriority);
  useGamepadButton("O", () => onCloseRef.current(), isOpen, gamepadPriority);

  React.useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusTimer = window.setTimeout(() => {
      const firstFocusable = getFocusableElements()[0];
      (firstFocusable ?? contentRef.current)?.focus({ preventScroll: true });
    }, 0);

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        moveLinearFocus(e.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleEscape);
      previouslyFocusedRef.current?.focus({ preventScroll: true });
    };
  }, [getFocusableElements, isOpen, moveLinearFocus]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          key="modal-shell"
          className={cn(
            "fixed inset-0 flex items-center justify-center p-4 md:p-8",
            zIndexClassName,
            containerClassName,
          )}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceEffects ? 0.01 : 0.25, ease: "easeOut" }}
            onClick={() => onClose()}
            className={cn(
              "absolute inset-0 bg-[#0F0F0F]/88 backdrop-blur-sm",
              backdropClassName
            )}
          />

          {/* Modal Content */}
          <motion.div
            ref={contentRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel || title || "Janela de diálogo"}
            tabIndex={-1}
            initial={
              shouldReduceEffects
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.94, y: 24, filter: "blur(6px)" }
            }
            animate={
              shouldReduceEffects
                ? { opacity: 1 }
                : { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }
            }
            exit={
              shouldReduceEffects
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.95, y: 16, filter: "blur(6px)" }
            }
            transition={{ duration: shouldReduceEffects ? 0.01 : 0.28, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "relative max-h-[calc(100dvh-2rem)] w-full overflow-hidden outline-none md:max-h-[calc(100dvh-4rem)]",
              maxWidthClassName,
              className
            )}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default ModalShell;
