import assert from 'assert';
import fs from 'fs';
import { basename, extname, resolve } from 'path';

/*
 * Tests.
 */

describe('history', async () => {
    const dir = resolve(__dirname);
    const methods = fs
        .readdirSync(dir)
        .filter(d => d[0] !== '.' && d !== 'index.tsx');

    for (const method of methods) {
        describe(method, () => {
            const testDir = resolve(dir, method);
            const tests = fs
                .readdirSync(testDir)
                .filter(f => f[0] !== '.' && f.endsWith('.tsx'))
                .map(f => basename(f, extname(f)));

            for (const test of tests) {
                const module = require(resolve(testDir, test));
                const { input, output, skip } = module;
                const fn = module.default;
                const t = skip ? it.skip : it;

                t(test, async () => {
                    const next = fn(input);
                    const opts = {
                        preserveSelection: true,
                        preserveData: true
                    };
                    const actual = next.toJS(opts);
                    const expected = output.toJS(opts);
                    assert.deepEqual(actual, expected);
                });
            }
        });
    }
});
