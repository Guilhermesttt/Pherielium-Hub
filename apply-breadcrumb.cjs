const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'home', 'InteractiveBreadcrumb.tsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(/<span>CHECKPOINT<\/span>/g, '');
content = content.replace(/className="rounded-lg px-2 py-1 text-\[9\.5px\] font-black uppercase tracking-\[0\.32em\] font-body"/g, 'className="rounded-lg px-2 py-1 text-[13px] font-medium font-ui capitalize"');
content = content.replace(/\{categoryLabel \|\| activeCategory\}/g, '{(categoryLabel || activeCategory).toLowerCase()}');

fs.writeFileSync(filePath, content);
console.log('Updated InteractiveBreadcrumb.tsx');
