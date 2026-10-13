// Loads the browser engine files into Node, in the same order index.html does.
const path = require('path');
for (const f of ['core.js', 'agents.js', 'engine.js', 'advisor.js', 'krishna.js', 'bots.js', 'logger.js', 'stats.js', 'levels.js']) {
  try { require(path.join(__dirname, '..', 'js', f)); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
}
module.exports = globalThis.KURU;
