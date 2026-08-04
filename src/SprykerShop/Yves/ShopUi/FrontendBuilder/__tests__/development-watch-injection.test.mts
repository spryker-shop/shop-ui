import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import webpack from 'webpack';
import type { AppSettings } from '../settings.mts';
import type { BuildConfiguration } from '../libs/webpack/compiler.mts';

// The real development.mts config runs heavy filesystem work (entry-point finder, sass, icon sprite
// extraction, directory cleaning). This suite is about the watch override's wiring, so the base
// config is mocked with a minimal fixture and the override behavior is asserted in isolation.
const basePlugin = new webpack.DefinePlugin({ __NAME__: "'yves'" });

const baseAppEntry = ['/abs/app.ts', '/abs/component.entry.ts'];

const createBaseConfiguration = (): BuildConfiguration => ({
    namespace: 'YvesShop',
    theme: 'default',
    componentEntryPointsLength: 1,
    stylesLength: 1,
    webpack: {
        entry: {
            app: [...baseAppEntry],
            vendor: '/abs/vendor.ts',
        },
        plugins: [basePlugin],
    },
});

jest.unstable_mockModule('../configs/development.mts', () => ({
    default: async () => createBaseConfiguration(),
}));

const appSettings = {
    context: '/abs/context',
    urls: { assets: 'assets/current/default' },
    paths: { public: 'public/Yves/assets/default' },
    // Empty so resolveThemeWatchDirectories does no filesystem work: this suite asserts config
    // wiring, not the Twig watcher's runtime behavior (covered by twig-watcher.test.mts).
    find: { componentEntryPoints: { dirs: [] } },
} as unknown as AppSettings;

const importConfigurationWatchMode = async () => (await import('../configs/development-watch.mts')).default;

const isReloadClientPath = (entry: unknown): boolean =>
    typeof entry === 'string' && entry.endsWith('libs/reload/client/reload-client.ts');

const isReloadDefinePlugin = (plugin: unknown): boolean =>
    plugin instanceof webpack.DefinePlugin &&
    Object.prototype.hasOwnProperty.call(plugin.definitions, '__RELOAD_MANIFEST_URL__');

beforeEach(() => {
    delete process.env.SPRYKER_FRONTEND_RELOAD;
});

afterEach(() => {
    delete process.env.SPRYKER_FRONTEND_RELOAD;
});

describe('development-watch reload injection', () => {
    it('prepends the reload client as the first element of entry.app, keeping the base entries after it', () => {
        return importConfigurationWatchMode().then(async (configurationWatchMode) => {
            const configuration = await configurationWatchMode(appSettings);
            const appEntry = (configuration.webpack.entry as { app: string[] }).app;

            expect(isReloadClientPath(appEntry[0])).toBe(true);
            expect(appEntry.slice(1)).toEqual(baseAppEntry);
        });
    });

    it('keeps the base plugins and adds exactly the three reload plugins (manifest writer + DefinePlugin + Twig watcher start)', () => {
        return importConfigurationWatchMode().then(async (configurationWatchMode) => {
            const configuration = await configurationWatchMode(appSettings);
            const plugins = configuration.webpack.plugins ?? [];

            expect(plugins).toContain(basePlugin);
            expect(plugins.length).toBe(4);
            expect(plugins.some(isReloadDefinePlugin)).toBe(true);
        });
    });

    it('defines __RELOAD_MANIFEST_URL__ as the manifest served under the assets url', () => {
        return importConfigurationWatchMode().then(async (configurationWatchMode) => {
            const configuration = await configurationWatchMode(appSettings);
            const reloadDefinePlugin = (configuration.webpack.plugins ?? []).find(isReloadDefinePlugin) as
                | webpack.DefinePlugin
                | undefined;

            expect(reloadDefinePlugin?.definitions.__RELOAD_MANIFEST_URL__).toBe(
                JSON.stringify('/assets/current/default/dev-build-manifest.json'),
            );
        });
    });

    it('injects no client and no reload constants when SPRYKER_FRONTEND_RELOAD=0 (kill switch)', () => {
        process.env.SPRYKER_FRONTEND_RELOAD = '0';

        return importConfigurationWatchMode().then(async (configurationWatchMode) => {
            const configuration = await configurationWatchMode(appSettings);
            const appEntry = (configuration.webpack.entry as { app: string[] }).app;
            const plugins = configuration.webpack.plugins ?? [];

            expect(appEntry).toEqual(baseAppEntry);
            expect(configuration.webpack.watch).toBe(true);
            expect(plugins).toEqual([basePlugin]);
        });
    });
});
