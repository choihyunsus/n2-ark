// n2-ark — Cross-platform mapping file copy with BOM stripping
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'compiler', 'mappings');
const dest = path.join(__dirname, '..', 'dist', 'compiler', 'mappings');

fs.mkdirSync(dest, { recursive: true });

const files = fs.readdirSync(src).filter(f => f.endsWith('.json'));
for (const file of files) {
  let content = fs.readFileSync(path.join(src, file), 'utf-8');
  // Strip UTF-8 BOM if present (prevents JSON.parse failures)
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  fs.writeFileSync(path.join(dest, file), content);
}

console.error(`[n2-ark] Copied ${files.length} mapping files to dist/ (BOM-safe)`);
