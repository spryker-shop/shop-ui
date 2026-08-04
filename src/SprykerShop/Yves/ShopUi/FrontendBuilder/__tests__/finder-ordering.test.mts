import { basename, dirname, relative } from 'node:path';
import { describe, it, expect } from '@jest/globals';
import { findComponentStyles, findComponentEntryPoints } from '../libs/webpack/finder.mts';
import { fixturePath } from './helpers/compile-fixture.mts';

const stylePatterns = ['**/Theme/fixture/components/atoms/*/*.scss'];
const entryPatterns = ['**/Theme/fixture/components/atoms/*/index.ts'];

describe('finder file ordering within a directory (plan phase 1)', () => {
    it('returns component style files in lexicographic order regardless of the filesystem readdir order', async () => {
        // The three component directories were created out of order (b, a, c) so the result only
        // comes back sorted if the finder sorts, not because the filesystem happened to be ordered.
        const files = await findComponentStyles({
            dirs: [fixturePath('finder-ordering', 'single-dir')],
            patterns: stylePatterns,
        });

        expect(files.map((file) => basename(file))).toEqual(['a.scss', 'b.scss', 'c.scss']);
    });
});

describe('finder directory expansion ordering (plan phase 1)', () => {
    it('sorts the directories a magic pattern expands to while keeping a later dirs entry after an earlier one', async () => {
        const fixtureRoot = fixturePath('finder-ordering');

        // First dirs entry is a magic pattern expanding to z-tier/{b,a,c}; second is the plain
        // a-tier directory. a-tier sorts before z-tier globally, so if tier order were lost it
        // would move to the front. It must stay last because it is the second dirs entry.
        const files = await findComponentStyles({
            dirs: [fixturePath('finder-ordering', 'z-tier', '*'), fixturePath('finder-ordering', 'a-tier')],
            patterns: ['**/Theme/fixture/components/atoms/comp/comp.scss'],
        });

        const tierOf = (file: string): string => relative(fixtureRoot, file).split('/Theme/')[0];

        expect(files.map(tierOf)).toEqual(['z-tier/a', 'z-tier/b', 'z-tier/c', 'a-tier']);
    });
});

describe('finder entry point merge precedence (plan phase 1)', () => {
    it('keeps the later dirs entry file win for a duplicated component type and name', async () => {
        const projectButton = fixturePath(
            'finder-ordering',
            'entry-project/Theme/fixture/components/atoms/button/index.ts',
        );

        // Both tiers define atoms/button; entry-project is the later dirs entry and must win the
        // last-wins dedup in mergeEntryPoints, collapsing the pair to the single project file.
        const entryPoints = await findComponentEntryPoints({
            dirs: [fixturePath('finder-ordering', 'entry-core'), fixturePath('finder-ordering', 'entry-project')],
            patterns: entryPatterns,
        });

        expect(entryPoints).toEqual([projectButton]);
        expect(basename(dirname(dirname(projectButton)))).toBe('atoms');
    });
});
