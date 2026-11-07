import path from 'node:path';
import assert from 'node:assert/strict';
import {prepareRelease} from './staging-release.mjs';
assert.equal(process.argv.length,2,'No target overrides accepted. Staging only.');
const root=path.resolve('outputs/staging-public-'+new Date().toISOString().replace(/[:.]/g,'-'));
const manifest=prepareRelease(process.cwd(),root);
console.log('PASS: '+manifest.files.length+' staging release checksums; reviewed migrations 0000-0008; matching runtime/frontend; no configuration, secrets, fixtures or public scale files. Local-only package '+root);
