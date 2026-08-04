import { describe, expect, it } from '@jest/globals';
import { classifyManifestDiff, resolveStylesheetSwaps } from '../libs/reload/client/reload-client';

const cssHash = 'aaaa';
const jsHash = 'bbbb';

const baselineManifest = {
    buildId: 1,
    twigVersion: 0,
    assets: {
        'js/yves_default.app.js': jsHash,
        'css/yves_default.app.css': cssHash,
    },
};

describe('classifyManifestDiff', () => {
    it('returns none when only the buildId changed (identical assets and twigVersion)', () => {
        const next = { ...baselineManifest, buildId: 2 };

        expect(classifyManifestDiff(baselineManifest, next)).toBe('none');
    });

    it('returns css-only when only a css asset hash changed', () => {
        const next = {
            buildId: 2,
            twigVersion: 0,
            assets: {
                'js/yves_default.app.js': jsHash,
                'css/yves_default.app.css': 'cccc',
            },
        };

        expect(classifyManifestDiff(baselineManifest, next)).toBe('css-only');
    });

    it('returns full-reload when a js asset hash changed', () => {
        const next = {
            buildId: 2,
            twigVersion: 0,
            assets: {
                'js/yves_default.app.js': 'dddd',
                'css/yves_default.app.css': cssHash,
            },
        };

        expect(classifyManifestDiff(baselineManifest, next)).toBe('full-reload');
    });

    it('returns full-reload when twigVersion was bumped even though assets are unchanged', () => {
        const next = { ...baselineManifest, buildId: 2, twigVersion: 1 };

        expect(classifyManifestDiff(baselineManifest, next)).toBe('full-reload');
    });

    it('returns full-reload when an asset key was added or removed', () => {
        const next = {
            buildId: 2,
            twigVersion: 0,
            assets: {
                'js/yves_default.app.js': jsHash,
                'css/yves_default.new-widget.css': cssHash,
            },
        };

        expect(classifyManifestDiff(baselineManifest, next)).toBe('full-reload');
    });
});

describe('resolveStylesheetSwaps', () => {
    it('swaps the matching stylesheet link href to a cache-busted url and leaves non-matching links out', () => {
        const changedStylesheets = [{ assetKey: 'css/yves_default.app.css', hash: 'cccc' }];
        const matchingLink = { href: '/assets/current/default/css/yves_default.app.css' };
        const unrelatedLink = { href: '/assets/current/default/css/yves_default.util.css' };

        const swaps = resolveStylesheetSwaps(changedStylesheets, [matchingLink, unrelatedLink]);

        expect(swaps).toEqual([
            { link: matchingLink, newHref: '/assets/current/default/css/yves_default.app.css?v=cccc' },
        ]);
    });

    it('replaces any existing query string with the new cache-buster rather than appending to it', () => {
        const changedStylesheets = [{ assetKey: 'css/yves_default.app.css', hash: 'eeee' }];
        const link = { href: '/assets/current/default/css/yves_default.app.css?v=oldhash' };

        const swaps = resolveStylesheetSwaps(changedStylesheets, [link]);

        expect(swaps[0].newHref).toBe('/assets/current/default/css/yves_default.app.css?v=eeee');
    });
});
