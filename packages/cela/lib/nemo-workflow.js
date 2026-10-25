'use strict';

/**
 * nemo/instructions.md -> the system_prompt block of nemo/examples/workflow.yaml.
 * NeMo wants YAML; the prose is written once and rendered into it. The root
 * `npm run sync` writes the result; lib/check-static.js fails when it drifts.
 */

const fs = require('fs');
const path = require('path');

const WORKFLOW = 'nemo/examples/workflow.yaml';
const INSTRUCTIONS = 'nemo/instructions.md';

function renderWorkflow(root = path.resolve(__dirname, '..')) {
  const yaml = fs.readFileSync(path.join(root, WORKFLOW), 'utf8');
  const prose = fs.readFileSync(path.join(root, INSTRUCTIONS), 'utf8').replace(/\r\n/g, '\n').trimEnd();
  const block = prose.split('\n').map((line) => (line ? `    ${line}` : '')).join('\n');
  const match = /^( {2}system_prompt: \|\n)((?: {4}.*\n|\n)+)/m.exec(yaml);
  if (!match) throw new Error(`${WORKFLOW}: no "  system_prompt: |" block to render instructions.md into`);
  return `${yaml.slice(0, match.index)}${match[1]}${block}\n${yaml.slice(match.index + match[0].length)}`;
}

module.exports = { INSTRUCTIONS, WORKFLOW, renderWorkflow };
