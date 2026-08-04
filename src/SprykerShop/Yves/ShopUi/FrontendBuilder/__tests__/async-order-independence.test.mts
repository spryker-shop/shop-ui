import { jest, describe, it, expect } from '@jest/globals';
import { readFileSync, readdir as realReaddir } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// These tests pin the async pipeline's order-safety: results must depend only on input order, never
// on which asynchronous read settles first. A refactor to completion-order accumulation would pass
// the rest of the suite but must fail here.

const fixturesDirectory = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixturePath = (...segments: string[]): string => join(fixturesDirectory, ...segments);

// createMixinIndex reads component sources through `node:fs/promises` readFile. Routing that read
// through a swappable implementation lets a single test force an adversarial settle order without
// touching source. The default reads synchronously off disk, so the mock is transparent until a
// test opts in. node:fs (readFileSync, readdir) is deliberately NOT mocked, so it supplies real
// file contents and a real directory reader to build the delayed behaviour on top of.
let readFileImplementation: (filePath: string, encoding: BufferEncoding) => Promise<string> = async (
    filePath,
    encoding,
) => readFileSync(filePath, encoding);

jest.unstable_mockModule('node:fs/promises', () => ({
    readFile: (filePath: string, encoding: BufferEncoding) => readFileImplementation(filePath, encoding),
}));

// ESM mock ordering: the module under test must be imported AFTER the mock is registered, so its
// `import { readFile } from 'node:fs/promises'` binds to the mock.
const { createMixinIndex } = await import('../libs/sass/mixin-index.mts');
const { findComponentStyles } = await import('../libs/webpack/finder.mts');

describe('mixin ownership under adversarial read completion order (async pipeline)', () => {
    it('resolves a duplicated mixin to the later input file even when the earlier file read completes last', async () => {
        const earlierProbePath = fixturePath('async-order', 'earlier-probe.scss');
        const laterProbePath = fixturePath('async-order', 'later-probe.scss');

        // Structural ordering (no timing race): the earlier file's read is gated on a promise the
        // later file's read releases only after it resolves, so the earlier read is guaranteed to
        // settle strictly last regardless of the scheduler.
        let releaseEarlierRead = (): void => undefined;
        const earlierReadGate = new Promise<void>((resolve) => {
            releaseEarlierRead = resolve;
        });
        const completionOrder: string[] = [];

        readFileImplementation = async (filePath, encoding) => {
            const content = readFileSync(filePath, encoding);

            if (filePath === laterProbePath) {
                completionOrder.push('later');
                releaseEarlierRead();

                return content;
            }

            await earlierReadGate;
            completionOrder.push('earlier');

            return content;
        };

        try {
            const mixinIndex = await createMixinIndex({
                componentStyleFilePaths: [earlierProbePath, laterProbePath],
                sharedStyleFilePaths: [],
            });

            const owners = mixinIndex.resolveDependencies(
                '@include duplicate-probe;',
                fixturePath('async-order', 'consumer.scss'),
            );

            // Precondition: the adversarial gate genuinely reversed settle order relative to input.
            expect(completionOrder).toEqual(['later', 'earlier']);
            // Contract: ownership follows input position (project-last precedence), not settle order.
            expect(owners).toEqual([laterProbePath]);
        } finally {
            readFileImplementation = async (filePath, encoding) => readFileSync(filePath, encoding);
        }
    });
});

describe('finder tier ordering under adversarial glob completion order (async pipeline)', () => {
    it('lists an earlier dirs entry before a later one even when the earlier tier readdir is delayed', async () => {
        const fixtureRoot = fixturePath('finder-ordering');
        const adversarialReaddirDelayMilliseconds = 40;

        // fast-glob accepts a custom filesystem adapter through the glob settings; missing members
        // fall back to fast-glob's defaults. Delaying readdir only for the first dirs entry (z-tier)
        // makes that tier the last to finish its directory reads, so a completion-order accumulator
        // would emit it after the second tier. The authored tier order must survive.
        const delayedFileSystemAdapter = {
            // fast-glob's readdir is a Node-style callback with several overloads; forwarding the
            // arguments verbatim across this third-party boundary is the one place `any` is needed.
            readdir: (...readdirArguments: any[]): void => {
                const directoryPath = String(readdirArguments[0]);
                const delayMilliseconds = directoryPath.includes('z-tier') ? adversarialReaddirDelayMilliseconds : 0;
                setTimeout(() => (realReaddir as (...args: any[]) => void)(...readdirArguments), delayMilliseconds);
            },
        };

        const files = await findComponentStyles({
            dirs: [fixturePath('finder-ordering', 'z-tier', '*'), fixturePath('finder-ordering', 'a-tier')],
            patterns: ['**/Theme/fixture/components/atoms/comp/comp.scss'],
            globSettings: { fs: delayedFileSystemAdapter },
        });

        const tierOf = (file: string): string => relative(fixtureRoot, file).split('/Theme/')[0];

        expect(files.map(tierOf)).toEqual(['z-tier/a', 'z-tier/b', 'z-tier/c', 'a-tier']);
    });
});
