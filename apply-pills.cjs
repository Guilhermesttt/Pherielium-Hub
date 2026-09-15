const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'Home.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace platform pills
content = content.replace(/bg-\[#12141c\]\/80 border border-white\/\[0\.12\] px-3 py-1 text-xs font-semibold text-white\/90 shadow-sm backdrop-blur-md/g, 'bg-white/[0.03] border border-white/[0.1] px-3 py-1 text-xs font-semibold text-white/90 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-3xl saturate-150');

// Replace hours played pill
content = content.replace(/bg-\[#12141c\]\/70 border border-white\/\[0\.08\] px-3 py-1 text-xs font-medium text-white\/60 backdrop-blur-md/g, 'bg-white/[0.02] border border-white/[0.08] px-3 py-1 text-xs font-medium text-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-3xl saturate-150');

// Replace favorite pill
content = content.replace(/bg-amber-500\/10 border border-amber-400\/25 px-3 py-1 text-xs font-semibold text-amber-300 shadow-sm backdrop-blur-md/g, 'bg-amber-500/10 border border-amber-400/25 px-3 py-1 text-xs font-semibold text-amber-300 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-3xl saturate-150');

fs.writeFileSync(filePath, content);
console.log('Updated Home.tsx with liquid glass pills');
