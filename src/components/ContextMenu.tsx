import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Edit3, Star } from "lucide-react";
import { usePreferences } from "../context/PreferencesContext";

interface ContextMenuProps {
  children: React.ReactNode;
  onAction: (action: string) => void;
  isFavorite?: boolean;
  playSound: (type: any) => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  children,
  onAction,
  isFavorite,
  playSound,
}) => {
  const { t } = usePreferences();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  return (
    <div
      className="relative shrink-0"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        playSound?.("select");
        setIsOpen(true);
      }}
    >
      {children}

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop invisível para fechar ao clicar fora */}
            <div
              className="fixed inset-0 z-[280]"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(false);
              }}
            />

            {/* Modal com posição fixa e centralizada sobre o card do jogo */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
              animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
              exit={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="absolute left-1/2 top-1/2 w-60 z-[300] rounded-2xl p-2 flex flex-col gap-1 shadow-[0_24px_48px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.12)] glass-panel"
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <motion.button
                whileTap={{ scale: 0.96 }}
                type="button"
                onClick={() => {
                  playSound?.("edit");
                  setIsOpen(false);
                  onAction("edit");
                }}
                onMouseEnter={() => playSound?.("hover")}
                className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[11.5px] font-bold uppercase tracking-wider text-white/70 hover:bg-white/10 hover:text-white cursor-pointer transition-colors text-left outline-none"
              >
                <Edit3 className="w-4 h-4 text-white/70" />
                <span>{t("editMetadata")}</span>
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.96 }}
                type="button"
                onClick={() => {
                  playSound?.(isFavorite ? "favoriteOff" : "favoriteOn");
                  setIsOpen(false);
                  onAction("favorite");
                }}
                onMouseEnter={() => playSound?.("hover")}
                className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[11.5px] font-bold uppercase tracking-wider text-white/70 hover:bg-white/10 hover:text-white cursor-pointer transition-colors text-left outline-none"
              >
                <Star
                  className={`w-4 h-4 ${
                    isFavorite ? "text-amber-300 fill-amber-300" : "text-white/70"
                  }`}
                />
                <span>{isFavorite ? t("removeFavorite") : t("addFavorite")}</span>
              </motion.button>

              <div className="bg-white/10 h-px my-0.5 mx-2" />

              <motion.button
                whileTap={{ scale: 0.96 }}
                type="button"
                onClick={() => {
                  playSound?.("delete");
                  setIsOpen(false);
                  onAction("delete");
                }}
                onMouseEnter={() => playSound?.("hover")}
                className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[11.5px] font-bold uppercase tracking-wider text-red-500 hover:bg-red-500/10 hover:text-red-400 cursor-pointer transition-colors text-left outline-none"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
                <span>{t("removeFromLibrary")}</span>
              </motion.button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ContextMenu;
