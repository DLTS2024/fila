import path from 'node:path';
import assert from 'node:assert/strict';
import {validateRelease} from './staging-release.mjs';
assert.equal(process.argv.length,3,'Supply the local staging artifact directory.');
const manifest=validateRelease(process.cwd(),path.resolve(process.argv[2]));
console.log('PASS: '+manifest.files.length+' staging artifact paths, checksums, exact inputs, migration pins and isolation guards. No deployment.');
