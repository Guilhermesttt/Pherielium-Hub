const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'ui', 'ProfileDropdown.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// The dropdown top level div might not have a font specified. I will add font-ui.
content = content.replace(/className="relative shrink-0 font-body"/g, 'className="relative shrink-0 font-ui"');
// If it doesn't have font-body, let's just add font-ui to the root element.
// Let's first check what's there
