import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import LoadingState from "./ui/loading-state";
import { GradientTracing } from "./ui/gradient-tracing";
import { PHERIELIUM_LOGO_PATH } from "../constants/assets";

const loadingMsgs = [
  "Iniciando sistemas...",
  "Conectando ao banco de dados...",
  "Sincronizando biblioteca...",
  "Preparando interface...",
  "Quase pronto...",
];

const PHERIELIUM_PATHS = [
  "M546.811 0.450368C574.495 -2.67907 606.626 10.823 625.549 30.9223C642.416 48.603 651.367 72.3858 650.346 96.8034C649.75 111.603 645.769 126.069 638.71 139.089C627.991 158.929 613.409 172.317 593.916 182.963C586.864 186.811 579.76 189.916 572.727 193.986C558.538 202.045 545.351 211.744 533.421 222.881C496.013 257.724 472.336 309.851 470.466 360.989C468.862 408.479 486.129 454.671 518.485 489.458C563.272 536.862 635.436 559.136 697.608 535.709C730.013 523.498 747.621 503.1 785.88 504.379C827.262 504.751 862.431 540.121 867.309 580.433C869.849 601.377 867.499 619.447 871.964 641.413C876.659 663.518 885.702 684.476 898.562 703.056C910.57 720.432 928.237 738.698 947.068 748.457C964.741 756.742 978.504 762.46 992.235 777.196C1029.85 817.055 1021.02 877.205 982.014 912.264C923.555 964.817 840.561 925.677 825.854 853.549C822.41 836.684 824.492 823.291 823.517 807.087C818.357 721.46 740.261 645.887 654.7 642.631C607.49 640.83 560.686 660.59 526.519 691.254C487.944 725.776 464.63 774.19 461.692 825.884C458.981 880.441 483.698 937.06 532.144 964.509C553.902 976.704 574.161 982.101 591.592 1001.47C624.482 1038.01 618.274 1089.45 582.17 1121.75C564.942 1137.31 542.221 1145.32 519.055 1144.02C473.931 1142.4 432.717 1105.27 426.52 1060.54C425.278 1052.41 425.811 1043.35 424.591 1035.29C409.2 933.714 269.72 837.116 173.523 894.928C148.135 910.188 135.775 928.428 103.062 932.554C78.7883 935.423 54.3806 928.422 35.3119 913.129C7.39449 891.083 -6.1386 857.013 2.66826 822.164C16.9282 765.741 82.1114 724.525 137.24 752.852C154.191 761.909 170.279 774.045 188.677 780.261C257.114 803.361 336.225 766.108 379.376 711.865C409.935 673.78 423.991 625.052 418.41 576.539C412.519 525.267 380.818 471.216 340.471 439.625C296.691 405.346 233.542 393.111 183.664 421.144C156.332 436.506 140.804 456.751 106.695 460.397C82.296 463.006 57.3775 454.495 38.4922 439.087C19.1341 423.609 6.80584 401.001 4.27641 376.342C1.83144 351.126 12.4435 325.227 28.4884 306.121C40.4579 291.869 55.9436 280.994 73.4099 274.575C115.44 259.402 141.899 277.319 174.876 299.283C194.091 312.081 224.233 318.825 247.339 316.351C308.871 309.761 365.404 272.323 405.055 226.103C425.598 201.777 446.522 167.27 449.035 135.403C449.682 127.206 448.443 119.029 447.719 110.884C445.386 84.6811 455.082 58.617 472.003 38.7504C491.704 15.6216 516.828 3.05048 546.811 0.450368Z",
  "M910.963 266.954C963.837 264.292 1008.83 305.052 1011.39 357.938C1013.97 410.824 973.135 455.756 920.255 458.231C867.512 460.701 822.724 419.984 820.164 367.231C817.604 314.476 858.227 269.61 910.963 266.954Z",
];

// Partículas aleatórias geradas fora do componente para não recriarem a cada render
const randomStars = Array.from({ length: 24 }).map((_, i) => ({
  id: i,
  size: Math.random() * 3 + 1,
  top: `${Math.random() * 100}%`,
  left: `${Math.random() * 100}%`,
  delay: Math.random() * 3,
  duration: Math.random() * 3 + 2,
  opacity: Math.random() * 0.5 + 0.1,
}));

interface AsyncLoaderProps {
  onFinish?: () => void;
  minDurationMs?: number;
}

const AsyncLoader: React.FC<AsyncLoaderProps> = ({ onFinish, minDurationMs = 2400 }) => {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const msgInterval = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % loadingMsgs.length);
    }, 1800);

    let finishTimeout: number | undefined;
    if (onFinish) {
      finishTimeout = window.setTimeout(() => {
        onFinish();
      }, minDurationMs);
    }

    const handleSkip = () => {
      onFinish?.();
    };

    window.addEventListener("keydown", handleSkip, { once: true });

    return () => {
      clearInterval(msgInterval);
      if (finishTimeout) clearTimeout(finishTimeout);
      window.removeEventListener("keydown", handleSkip);
    };
  }, [onFinish, minDurationMs]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
      onClick={() => onFinish?.()}
      className="fixed inset-0 z-[1000] bg-[#030405] flex flex-col items-center justify-center overflow-hidden select-none cursor-default"
    >
      {/* 1. Deep Space Radial Glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle 800px at 50% 50%, rgba(255,255,255,0.04) 0%, transparent 80%)",
        }}
      />

      {/* 2. Dynamic Starfield (Partículas) */}
      {randomStars.map((star) => (
        <motion.div
          key={star.id}
          className="absolute rounded-full bg-white pointer-events-none"
          style={{
            width: star.size,
            height: star.size,
            top: star.top,
            left: star.left,
            opacity: star.opacity,
          }}
          animate={{ opacity: [star.opacity, star.opacity * 3, star.opacity] }}
          transition={{ duration: star.duration, repeat: Infinity, delay: star.delay, ease: "easeInOut" }}
        />
      ))}

      <div className="relative z-10 flex flex-col items-center gap-14">

        {/* 3. Floating Container com auras e anéis */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1, y: [-8, 8, -8] }}
          transition={{
            opacity: { duration: 0.8, ease: "easeOut" },
            scale: { duration: 0.8, ease: "easeOut" },
            y: { duration: 6, repeat: Infinity, ease: "easeInOut" } // Levitação suave
          }}
          className="relative flex items-center justify-center"
        >
          {/* Aura Central de Desfoque */}
          <div className="absolute rounded-full w-[120%] h-[120%] bg-white/[0.04] blur-3xl animate-pulse pointer-events-none" />

          {/* Anel Orbital Giratório (Sci-Fi Vibe) */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
            className="absolute w-[240px] h-[240px] rounded-full border border-white/[0.08] border-dashed pointer-events-none"
          />

          {/* Ondas de Choque Pulsantes (Shockwaves) */}
          <motion.div
            animate={{ scale: [1, 1.8], opacity: [0.3, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeOut" }}
            className="absolute w-[160px] h-[160px] rounded-full border border-white/20 pointer-events-none"
          />
          <motion.div
            animate={{ scale: [1, 1.8], opacity: [0.15, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeOut", delay: 1.5 }}
            className="absolute w-[160px] h-[160px] rounded-full border border-white/20 pointer-events-none"
          />

          {/* O seu componente original preservado! */}
          <GradientTracing
            width={175}
            height={197}
            viewBox="0 0 1017 1145"
            paths={PHERIELIUM_PATHS}
            gradientColors={["#ffffff", "#ffffff", "#ffffff"]}
            animationDuration={2.6}
            strokeWidth={1.5}
            baseColor="rgba(255,255,255,0.16)"
            fill="rgba(255,255,255,0.08)"
            className="drop-shadow-[0_0_40px_rgba(255,255,255,0.3)] relative z-10"
          />
        </motion.div>

        {/* 4. Textos de Carregamento com Transição Blur (Mac OS Style) */}
        <div className="flex flex-col items-center h-12 justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={msgIndex}
              initial={{ opacity: 0, y: 8, filter: "blur(6px)", scale: 0.95 }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)", scale: 1 }}
              exit={{ opacity: 0, y: -8, filter: "blur(6px)", scale: 1.05 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <LoadingState
                label={loadingMsgs[msgIndex]}
                variant="Drive"
                className="py-2.5 px-6 rounded-full bg-white/[0.03] border border-white/[0.08] backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] font-medium tracking-wide text-white/80"
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};

export default AsyncLoader;