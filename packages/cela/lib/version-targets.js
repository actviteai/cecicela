'use strict';

/**
 * Files in this package that carry its version besides package.json.
 * The root `npm run stamp` rewrites them; `npm test` checks them.
 */

module.exports = {
  json: [],
  // Every semver in these files must be the package version.
  prose: [
    'README.md',
    'skill/SKILL.md',
    'skill/README.md',
    'bridges/project.md',
    'bridges/claude/commands/cela.md',
    // The cela-nat pip package ships with the engine it wraps.
    'nemo/pyproject.toml',
  ],
  // These read package.json at runtime and must not hardcode a version.
  none: ['bin/cela.js', 'lib/installer.js', 'lib/hermes.js', 'lib/skill.js'],
};
