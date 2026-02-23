#!/usr/bin/env node
/**
 * Wrapper for 7za.exe that:
 * 1. Replaces -snld flag with -snl (ignore symlinks instead of creating them)
 * 2. Returns exit code 0 even when 7zip exits with 2 (warnings/symlink errors)
 */
const { spawnSync } = require('child_process');
const path = require('path');

const real7za = path.join(__dirname, '..', 'node_modules', '7zip-bin', 'win', 'x64', '7za_orig.exe');
const args = process.argv.slice(2).map(a => a === '-snld' ? '-snl' : a);

const result = spawnSync(real7za, args, { stdio: 'inherit' });
process.exit(result.status === 2 ? 0 : (result.status || 0));
