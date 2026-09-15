const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'DashboardContinuePlaying.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Remove hover scale
content = content.replace(/whileHover=\{\{ scale: 1\.02 \}\}/g, '');

// Remove slice
content = content.replace(/const displayGames = continuePlayingGames\.slice\(0, 5\);\s*/g, '');

// Change displayGames.map to continuePlayingGames.map
content = content.replace(/displayGames\.map/g, 'continuePlayingGames.map');

// Inject useRef and handleScrollRight
const hooksInjection = 
  const prefersReducedMotion = useReducedMotion();
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const handleScrollRight = () => {
    if (scrollRef.current) {
      playSound?.("hover");
      scrollRef.current.scrollBy({ left: 850, behavior: "smooth" });
    }
  };
;
content = content.replace(/const prefersReducedMotion = useReducedMotion\(\);\s*/, hooksInjection);

// Inject ref into motion.div
content = content.replace(/className="no-scrollbar -ml-\[12px\] flex gap-\[24px\] overflow-x-auto/g, 'ref={scrollRef}\n        className="no-scrollbar -ml-[12px] flex gap-[24px] overflow-x-auto');

// Replace the old button block with the floating button
const oldButtonBlock = /\{continuePlayingGames\.length > 5 && \([\s\S]*?\}\)\}\s*<\/motion\.div>/m;

const newButtonBlock = 
      </motion.div>

      {continuePlayingGames.length > 4 && (
        <button
          onClick={handleScrollRight}
          className="absolute right-4 top-[60%] z-10 flex h-12 w-12 items-center justify-center rounded-full bg-black/40 border border-white/[0.1] text-white/70 backdrop-blur-xl shadow-2xl transition-all hover:bg-white/[0.1] hover:scale-105 hover:text-white"
        >
          <ArrowRight className="h-6 w-6" />
        </button>
      )}
;

content = content.replace(/\{continuePlayingGames\.length > 5 && \([\s\S]*?\}\)\}\s*<\/motion\.div>/m, newButtonBlock);

fs.writeFileSync(filePath, content);
console.log('Updated DashboardContinuePlaying.tsx');
