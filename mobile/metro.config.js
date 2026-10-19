const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The money engine (splits, rounding, debt simplification) is shared with the
// web server so both sides always calculate identically.
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../src/lib/money')];

module.exports = config;
