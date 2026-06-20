const fs = require("fs");

const API = 'import.meta.env.VITE_API_URL || "http://localhost:3002"';
const BASE = `const API_URL = ${API};`;

const files = [
  "frontend/src/components/Categories.tsx",
  "frontend/src/components/Dashboard.tsx",
  "frontend/src/components/Files.tsx",
  "frontend/src/components/Chat.tsx",
  "frontend/src/components/FloatingChat.tsx",
  "frontend/src/components/Layout.tsx",
  "frontend/src/contexts/ChatContext.tsx",
];

for (const file of files) {
  if (!fs.existsSync(file)) { console.log("Not found:", file); continue; }
  let content = fs.readFileSync(file, "utf8");

  // Fix double-nested replacements - clean them all up
  // Pattern: ${import.meta.env.VITE_API_URL || "${import.meta.env.VITE_API_URL || "http://localhost:3002"}"} 
  content = content.replace(/\$\{import\.meta\.env\.VITE_API_URL \|\| "\$\{import\.meta\.env\.VITE_API_URL \|\| "http:\/\/localhost:3002"\}"\}/g, 
    '${import.meta.env.VITE_API_URL || "http://localhost:3002"}');

  // Fix single quotes wrapping the template - '${...}/api/...' -> `${...}/api/...`
  content = content.replace(/'(\$\{import\.meta\.env\.VITE_API_URL \|\| "http:\/\/localhost:3002"\}[^']*)'/g, 
    '`$1`');

  // Fix double API_URL in Layout
  content = content.replace(
    /const API_URL = import\.meta\.env\.VITE_API_URL \|\| import\.meta\.env\.VITE_API_URL \|\| "\$\{import\.meta\.env\.VITE_API_URL \|\| "http:\/\/localhost:3002"\}";/g,
    BASE
  );

  // Fix ChatContext double
  content = content.replace(
    /const API_URL = import\.meta\.env\.VITE_API_URL \|\| "\$\{import\.meta\.env\.VITE_API_URL \|\| "http:\/\/localhost:3002"\}";/g,
    BASE
  );

  // Fix FloatingChat double
  content = content.replace(
    /: import\.meta\.env\.VITE_API_URL \|\| "\$\{import\.meta\.env\.VITE_API_URL \|\| "http:\/\/localhost:3002"\}";/g,
    `: ${API};`
  );

  // Fix Chat.tsx double
  content = content.replace(
    /const API_URL = process\.env\.REACT_APP_API_URL \|\| import\.meta\.env\.VITE_API_URL \|\| "\$\{import\.meta\.env\.VITE_API_URL \|\| "http:\/\/localhost:3002"\}";/g,
    BASE
  );

  // Fix API_BASE double in Files and Dashboard
  content = content.replace(
    /const API_BASE = `\$\{import\.meta\.env\.VITE_API_URL \|\| "\$\{import\.meta\.env\.VITE_API_URL \|\| "http:\/\/localhost:3002"\}"\}\/api\/files`;/g,
    'const API_BASE = `${import.meta.env.VITE_API_URL || "http://localhost:3002"}/api/files`;'
  );

  // Fix MOVE_API double in Files
  content = content.replace(
    /const MOVE_API = `\$\{import\.meta\.env\.VITE_API_URL \|\| "\$\{import\.meta\.env\.VITE_API_URL \|\| "http:\/\/localhost:3002"\}"\}\/api\/move`;/g,
    'const MOVE_API = `${import.meta.env.VITE_API_URL || "http://localhost:3002"}/api/move`;'
  );

  // Fix CATEGORY_MOVE_API double
  content = content.replace(
    /const CATEGORY_MOVE_API = `\$\{import\.meta\.env\.VITE_API_URL \|\| "\$\{import\.meta\.env\.VITE_API_URL \|\| "http:\/\/localhost:3002"\}"\}\/api\/category-move`;/g,
    'const CATEGORY_MOVE_API = `${import.meta.env.VITE_API_URL || "http://localhost:3002"}/api/category-move`;'
  );

  fs.writeFileSync(file, content, "utf8");
  console.log("Fixed:", file);
}
console.log("Done!");
