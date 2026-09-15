const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'Sidebar.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add PanelLeft to lucide-react imports
content = content.replace(/Folder, FolderOpen,/g, 'Folder, FolderOpen, PanelLeft,');

// 2. Rewrite the header container
const oldHeader = <div
          onClick={toggleExpand}
          role="button"
          tabIndex={0}
          className={\elative mb-8 flex items-center cursor-pointer group p-1 transition-all duration-300 \\}
        >
          <div className="relative w-10 h-10 rounded-2xl flex items-center justify-center bg-white/[0.05] shadow-[0_4px_16px_rgba(0,0,0,0.2)] group-hover:bg-white/[0.08] group-hover:shadow-[0_4px_20px_rgba(255,255,255,0.05)] transition-all duration-300 shrink-0">
            <img src={PHERIELIUM_LOGO_PATH} alt="Pherielium" className="h-[42px] w-[42px] object-contain grayscale brightness-200 opacity-90 group-hover:opacity-100 transition-opacity" />
          </div>
          {isExpanded && (
            <div className="flex flex-1 items-center min-w-0">
              <span className="font-display font-bold text-[22px] text-white tracking-tight flex items-start gap-[2px]">
                Pherielium
                <span className="text-white/40 text-[20px] font-semibold translate-y-[-1px]">&reg;</span>
              </span>
            </div>
          )}
        </div>;

const newHeader = <div
          onClick={toggleExpand}
          role="button"
          tabIndex={0}
          className={\elative mb-8 flex items-center justify-between cursor-pointer group p-1 transition-all duration-300 \\}
        >
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12 rounded-3xl flex items-center justify-center bg-white/[0.03] border border-white/[0.04] shadow-[0_4px_16px_rgba(0,0,0,0.2)] group-hover:bg-white/[0.06] transition-all duration-300 shrink-0">
              <img src={PHERIELIUM_LOGO_PATH} alt="Pherielium" className="h-[28px] w-[28px] object-contain grayscale brightness-200 opacity-90 group-hover:opacity-100 transition-opacity" />
            </div>
            {isExpanded && (
              <div className="flex items-center min-w-0">
                <span className="font-display font-bold text-[22px] text-white tracking-tight flex items-start gap-[2px]">
                  Pherielium
                  <span className="text-white/30 text-[10px] font-semibold translate-y-[2px]">&reg;</span>
                </span>
              </div>
            )}
          </div>
          
          {isExpanded && (
            <button 
              className="flex items-center justify-center w-8 h-8 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0"
              aria-label="Recolher menu"
            >
              <PanelLeft className="w-5 h-5" />
            </button>
          )}
        </div>;

content = content.replace(oldHeader, newHeader);

fs.writeFileSync(filePath, content);
console.log('Updated Sidebar.tsx header');
