// Runs every test/*.test.cjs in sequence, then test/unit/*.test.mjs through node --test. Exits 1 on any failure.
const { spawnSync } = require('child_process'); const fs = require('fs'); const path = require('path');
let failed = 0;
for (const f of fs.readdirSync(__dirname).filter(n => /\.test\.cjs$/.test(n)).sort()) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' });
  if (r.status !== 0) { failed++; console.error(f + ': FAILED'); }
}
const unit = path.join(__dirname, 'unit');
const unitFiles = fs.existsSync(unit) ? fs.readdirSync(unit).filter(n => /\.test\.mjs$/.test(n)).sort().map(n => path.join(unit, n)) : [];
if (unitFiles.length) {
  const r = spawnSync(process.execPath, ['--test', ...unitFiles], { stdio: 'inherit' });
  if (r.status !== 0) { failed++; console.error('unit tests: FAILED'); }
}
process.exit(failed ? 1 : 0);
