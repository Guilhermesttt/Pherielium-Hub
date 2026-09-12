import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PVideoBackground, PGlow, useLowPerf } from "./PerformanceComponents";
import bgVideo from "../assets/karavanbraam_pindown.io.webm";

interface DynamicBackgroundProps {
  backgroundImage: string;
  videoUrl?: string;
  reducedEffects?: boolean;
}

const DynamicBackground: React.FC<DynamicBackgroundProps> = ({ backgroundImage, videoUrl, reducedEffects = false }) => {
  const low = useLowPerf();
  const noFx = reducedEffects || low;

  return (
    <div
      className="fixed inset-0 z-0 overflow-hidden pointer-events-none isolate"
      style={{
        background: "var(--background)",
        transform: "translateZ(0)",
      }}
    >
      {/* Video de fundo nitido com baixa opacidade e aceleracao GPU */}
      <div className="absolute inset-0 transform-gpu will-change-transform">
        <PVideoBackground
          src={bgVideo}
          className="absolute inset-0 w-full h-full object-cover"
          opacity={0.38}
        />
      </div>

      {/* Imagem de fundo do jogo com efeito blur atmosferico */}
      <AnimatePresence mode="popLayout">
        {backgroundImage ? (
          <motion.img
            key={backgroundImage}
            src={backgroundImage}
            initial={{ opacity: 0 }}
            animate={{ opacity: noFx ? 0.25 : 0.45 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: noFx ? 0.1 : 0.55,
              ease: "easeOut"
            }}
            style={{ transform: "translate3d(0,0,0)", backfaceVisibility: "hidden" }}
            className={`absolute inset-0 w-full h-full object-cover will-change-transform transform-gpu ${noFx ? "scale-[1.02]" : "blur-[36px] scale-[1.08]"}`}
          />
        ) : null}
      </AnimatePresence>

      {/* Base gradients using CSS variable for unified dark background */}
      <div className="absolute inset-0 opacity-60" style={{ background: "linear-gradient(to top, var(--background) 0%, color-mix(in srgb, var(--background) 35%, transparent) 55%, transparent 100%)" }} />
      <div className="absolute inset-0 opacity-45" style={{ background: "linear-gradient(to right, color-mix(in srgb, var(--background) 45%, transparent) 0%, transparent 55%)" }} />

      {/* Edge vignette for screen-in-a-dark-room feel */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      <PGlow
        className="absolute inset-0 w-full h-full"
        style={{
          background: "radial-gradient(circle at 76% 18%, rgb(var(--launcher-accent) / 0.20), transparent 45%), radial-gradient(circle at 18% 82%, rgb(var(--launcher-accent) / 0.28), transparent 50%)",
          borderRadius: 0,
        }}
        size="100%"
        opacity={1}
        color="transparent"
      />

      {!low && (
        <div className="absolute inset-0 opacity-[0.015] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]" />
      )}
    </div>
  );
};

export default DynamicBackground;
