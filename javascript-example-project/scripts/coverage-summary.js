// Prints the coverage numbers from the last `npm run test:coverage` run as a
// Markdown table. CI appends this to the GitHub Actions job summary; you can
// also run it locally with `npm run coverage:summary`.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');
if (!fs.existsSync(file)) {
  console.error('No coverage/coverage-summary.json found. Run `npm run test:coverage` first.');
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(file, 'utf8'));
const root = path.join(__dirname, '..');
const rows = Object.entries(summary).map(([name, data]) => {
  const label = name === 'total' ? '**All files**' : path.relative(root, name);
  const pct = (metric) => `${data[metric].pct}% (${data[metric].covered}/${data[metric].total})`;
  return `| ${label} | ${pct('statements')} | ${pct('branches')} | ${pct('functions')} | ${pct('lines')} |`;
});

console.log('| File | Statements | Branches | Functions | Lines |');
console.log('|---|---|---|---|---|');
// Put the total row last.
console.log(rows.filter((r) => !r.startsWith('| **')).join('\n'));
console.log(rows.find((r) => r.startsWith('| **')));
