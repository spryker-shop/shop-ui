import { describe, it, expect } from '@jest/globals';
import { BUILDER_ENTRY_NAMES, buildWebpackEntries } from '../libs/webpack/entry-points.mts';
import type { WebpackEntrySources } from '../libs/webpack/entry-points.mts';

const sources: WebpackEntrySources = {
    vendorEntryPath: '/abs/vendor.ts',
    appEntryPath: '/abs/app.ts',
    basicStylePath: '/abs/basic.scss',
    utilStylePath: '/abs/util.scss',
    designTokensStylePath: '/abs/design-tokens.css',
    criticalComponentEntryPaths: ['/abs/ShopUi/molecules/a/index.ts'],
    nonCriticalComponentEntryPaths: ['/abs/CartPage/molecules/b/index.ts'],
    criticalRescuedStylePaths: ['/abs/ShopUi/molecules/legacy/legacy.scss'],
    nonCriticalRescuedStylePaths: ['/abs/CartPage/molecules/legacy/legacy.scss'],
    hookContributions: {
        critical: ['/abs/hook-critical.css'],
        app: ['/abs/hook-app.ts'],
        nonCritical: ['/abs/hook-non-critical.css'],
        entries: { print: ['/abs/print.scss'] },
    },
};

describe('webpack entry assembly', () => {
    it('orders the critical bundle as design tokens, hook files, basic.scss, rescued styles, component entries', () => {
        expect(buildWebpackEntries(sources).critical).toEqual([
            '/abs/design-tokens.css',
            '/abs/hook-critical.css',
            '/abs/basic.scss',
            '/abs/ShopUi/molecules/legacy/legacy.scss',
            '/abs/ShopUi/molecules/a/index.ts',
        ]);
    });

    it('orders the non-critical bundle as hook files, rescued styles, component entries, util.scss', () => {
        expect(buildWebpackEntries(sources)['non-critical']).toEqual([
            '/abs/hook-non-critical.css',
            '/abs/CartPage/molecules/legacy/legacy.scss',
            '/abs/CartPage/molecules/b/index.ts',
            '/abs/util.scss',
        ]);
    });

    it('composes app from app.ts, the critical bundle, the non-critical bundle and the app hook files', () => {
        const entries = buildWebpackEntries(sources);

        expect(entries.app).toEqual([
            '/abs/app.ts',
            ...(entries.critical as string[]),
            ...(entries['non-critical'] as string[]),
            '/abs/hook-app.ts',
        ]);
    });

    it('keeps vendor.ts and util.scss as their own entries', () => {
        const entries = buildWebpackEntries(sources);

        expect(entries.vendor).toBe('/abs/vendor.ts');
        expect(entries.util).toBe('/abs/util.scss');
    });

    it('adds every named hook entry as an additional webpack entry', () => {
        expect(buildWebpackEntries(sources).print).toEqual(['/abs/print.scss']);
    });

    it('returns exactly the builder entry names a build hook may not reuse, besides the named hook entries', () => {
        const entries = buildWebpackEntries({
            ...sources,
            hookContributions: { ...sources.hookContributions, entries: {} },
        });

        expect(Object.keys(entries).sort()).toEqual([...BUILDER_ENTRY_NAMES].sort());
    });

    it('starts the critical bundle with the hook files when the project has no design tokens', () => {
        const entries = buildWebpackEntries({ ...sources, designTokensStylePath: null });

        expect((entries.critical as string[])[0]).toBe('/abs/hook-critical.css');
    });
});
