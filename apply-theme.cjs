const fs = require('fs');
const path = require('path');

const files = [
  'src/pages/FriendsPage.tsx',
  'src/pages/SettingsPage.tsx',
  'src/components/game-detail/GameDetailAchievements.tsx',
  'src/components/game-detail/GameDetailActions.tsx',
  'src/components/game-detail/GameDetailHeader.tsx',
  'src/components/game-detail/GameDetailPanel.tsx',
  'src/components/game-detail/GameDetailSocialMods.tsx',
  'src/components/game-detail/GameDetailStats.tsx'
];

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Remove backdrop blur classes
    content = content.replace(/backdrop-blur-\[?[a-zA-Z0-9]+\]?/g, '');
    
    // Replace hover:bg-white/[0.XX] to hover:bg-[#222222]
    content = content.replace(/hover:bg-white\/\[0\.\d+\]/g, 'hover:bg-[#222222]');
    
    // Replace bg-white/[0.XX] to bg-[var(--color-surface)]
    content = content.replace(/bg-white\/\[0\.\d+\]/g, 'bg-[var(--color-surface)]');
    
    // Replace border-white/[0.XX] to border-[var(--color-ui-detail)]
    content = content.replace(/border-white\/\[0\.\d+\]/g, 'border-[var(--color-ui-detail)]');
    
    // Replace specific dark hexes with bg-[var(--color-surface)]
    content = content.replace(/bg-\[#(1C1C1E|0F0F12|0A0A0A|171717)\](\/\d+)?/gi, 'bg-[var(--color-surface)]');
    
    fs.writeFileSync(filePath, content);
    console.log('Updated ' + file);
  }
});
