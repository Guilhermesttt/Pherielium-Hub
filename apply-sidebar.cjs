const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'Sidebar.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const targetStr = <span className="font-display font-medium text-sm bg-gradient-to-b from-[#FFFFFF] to-[#8A8A8A] bg-clip-text text-transparent tracking-[0.2em] uppercase drop-shadow-[0_0_12px_rgba(255,255,255,0.3)]">
                  Pherielium
                </span>;

const replacement = <span className="font-display font-bold text-lg text-white tracking-tight flex items-start gap-[2px]">
                  Pherielium
                  <span className="text-white/40 text-xs font-semibold translate-y-[-2px]">&reg;</span>
                </span>;

content = content.replace(targetStr, replacement);
fs.writeFileSync(filePath, content);
console.log('Updated Sidebar.tsx');
