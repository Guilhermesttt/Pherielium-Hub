const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'Sidebar.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Increase logo size and remove border
const oldLogoContainer = <div className="relative w-10 h-10 rounded-2xl flex items-center justify-center bg-white/[0.05] border border-white/[0.1] shadow-[0_4px_16px_rgba(0,0,0,0.2)] group-hover:bg-white/[0.08] group-hover:shadow-[0_4px_20px_rgba(255,255,255,0.05)] transition-all duration-300 shrink-0">
              <img src={PHERIELIUM_LOGO_PATH} alt="Pherielium" className="h-[22px] w-[22px] object-contain grayscale brightness-200 opacity-90 group-hover:opacity-100 transition-opacity" />;
const newLogoContainer = <div className="relative w-12 h-12 flex items-center justify-center bg-transparent group-hover:bg-white/[0.04] rounded-2xl transition-all duration-300 shrink-0">
              <img src={PHERIELIUM_LOGO_PATH} alt="Pherielium" className="h-[28px] w-[28px] object-contain grayscale brightness-200 opacity-90 group-hover:opacity-100 transition-opacity" />;
content = content.replace(oldLogoContainer, newLogoContainer);

// Increase Pherielium font size
content = content.replace('className="font-display font-bold text-[17px] text-white', 'className="font-display font-bold text-[22px] text-white');

// Add horizontal line between groups
const oldMapStart =           {SIDEBAR_NAVIGATION_GROUPS.map((group) => {
            const isCollapsible = COLLAPSIBLE_GROUP_KEYS.has(group.key);
            const isOpen = !isCollapsible || Boolean(expandedGroups[group.key]);
            const items = group.ids
              .map((id) => SIDEBAR_CATEGORIES.find((item) => item.id === id))
              .filter((item): item is (typeof SIDEBAR_CATEGORIES)[number] => Boolean(item));
            const isGroupActive = items.some((item) => item.id === activeCategory);

            return (
              <div key={group.key} role="group" className="flex w-full flex-col gap-1.5">;

const newMapStart =           {SIDEBAR_NAVIGATION_GROUPS.map((group, index) => {
            const isCollapsible = COLLAPSIBLE_GROUP_KEYS.has(group.key);
            const isOpen = !isCollapsible || Boolean(expandedGroups[group.key]);
            const items = group.ids
              .map((id) => SIDEBAR_CATEGORIES.find((item) => item.id === id))
              .filter((item): item is (typeof SIDEBAR_CATEGORIES)[number] => Boolean(item));
            const isGroupActive = items.some((item) => item.id === activeCategory);

            return (
              <React.Fragment key={group.key}>
                {index > 0 && (
                  <div className="w-full h-[1px] my-1 shrink-0 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
                )}
                <div role="group" className="flex w-full flex-col gap-1.5">;

content = content.replace(oldMapStart, newMapStart);

// Close the React.Fragment
const oldMapEnd =                 </AnimatePresence>
              </div>
            );
          })}
        </nav>;

const newMapEnd =                 </AnimatePresence>
              </div>
              </React.Fragment>
            );
          })}
        </nav>;

content = content.replace(oldMapEnd, newMapEnd);

fs.writeFileSync(filePath, content);
console.log('Sidebar.tsx updated');
