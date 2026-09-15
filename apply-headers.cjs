const fs = require('fs');
const path = require('path');

const homePath = path.join(__dirname, 'src', 'pages', 'Home.tsx');
let homeContent = fs.readFileSync(homePath, 'utf8');

homeContent = homeContent.replace(/bg-white\/\[0\.04\] border border-white\/\[0\.08\]/g, 'bg-white/[0.03] border border-white/[0.1] shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-3xl saturate-150');
homeContent = homeContent.replace(/"border-white\/\[0\.08\] bg-white\/\[0\.04\] text-white\/40 hover:bg-white\/\[0\.07\] hover:text-white\/60"/g, '"bg-white/[0.03] border border-white/[0.1] shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-3xl saturate-150 text-white/40 hover:bg-white/[0.07] hover:text-white/60"');
homeContent = homeContent.replace(/border border-white\/\[0\.08\] shadow-\[0_24px_48px_rgba\(0,0,0,0\.6\),inset_0_1px_0_rgba\(255,255,255,0\.12\)\] glass-panel/g, 'border border-white/[0.1] bg-white/[0.03] shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-3xl saturate-150');

fs.writeFileSync(homePath, homeContent);

const profilePath = path.join(__dirname, 'src', 'components', 'ui', 'ProfileDropdown.tsx');
let profileContent = fs.readFileSync(profilePath, 'utf8');
profileContent = profileContent.replace(/<DropdownMenu>/g, '<DropdownMenu>\n      <div className="font-ui">');
profileContent = profileContent.replace(/<\/DropdownMenu>/g, '</div>\n    </DropdownMenu>');

fs.writeFileSync(profilePath, profileContent);
console.log('Updated Home.tsx and ProfileDropdown.tsx');
