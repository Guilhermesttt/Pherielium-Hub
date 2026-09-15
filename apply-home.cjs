const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'Home.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Ensure PanelLeft is imported
if (!content.includes('PanelLeft')) {
  content = content.replace(/import \{.*?Search,.*?X,.*?\} from "lucide-react";/s, (match) => {
    return match.replace('Search,', 'Search, PanelLeft,');
  });
}

const oldBlock = <div className="flex items-center gap-6">

            {/* Clean Pill Search Bar - Only in Menu & Platform views */};

const newBlock = <div className="flex items-center gap-6">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("checkpoint:sidebar-toggle", { detail: { expanded: !isSidebarExpanded } }))}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <PanelLeft className="w-5 h-5" />
            </button>

            {/* Clean Pill Search Bar - Only in Menu & Platform views */};

content = content.replace(oldBlock, newBlock);

fs.writeFileSync(filePath, content);
console.log('Updated Home.tsx');
