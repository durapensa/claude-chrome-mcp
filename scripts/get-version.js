#!/usr/bin/env node
/**
 * Centralized version management utility
 * Reads version from VERSION file for consistent project-wide versioning
 */

const fs = require('fs');
const path = require('path');

function getVersion() {
  const versionFile = path.join(__dirname, '../VERSION');
  try {
    return fs.readFileSync(versionFile, 'utf8').trim();
  } catch (error) {
    console.error('Error reading VERSION file:', error.message);
    process.exit(1);
  }
}

// If called directly, output the version
if (require.main === module) {
  console.log(getVersion());
}

module.exports = { getVersion };