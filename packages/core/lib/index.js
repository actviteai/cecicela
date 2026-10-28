'use strict';

/**
 * @actvite/core (private): the code ceci, cela, trouble, and the cecicela
 * bundle share. Never published on its own. `npm run sync` copies this
 * directory into each package's lib/core/, so every npm tarball carries the
 * exact core it was tested with and needs no dependency.
 */

module.exports = {
  fsx: require('./fsx'),
  gen: require('./gen'),
  handoff: require('./handoff'),
  harness: require('./harness'),
  install: require('./install'),
  versions: require('./versions'),
};
