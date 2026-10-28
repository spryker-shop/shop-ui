import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import getConfiguration from '../configs/development.mts';
import type { AppSettings } from '../settings.mts';
import type { BuildConfiguration } from '../libs/webpack/compiler.mts';

interface FakeLoaderContext {
    addDependency: (filePath: string) => void;
    addMissingDependency: (filePath: string) => void;
}

interface SassImporter {
    canonicalize(requestUrl: string, canonicalizeContext: { containingUrl: URL | null }): Promise<URL | null>;
}

interface SassLoaderOptions {
    sassOptions: (loaderContext: FakeLoaderContext) => { importers: SassImporter[] };
}

const CONFIGURATION_FILE_NAME = 'tsconfig.yves.json';
const SHARED_ALIAS = '@shared/ai-commerce/*';
const CORE_ONLY_SHARED_TARGETS = ['./core-shared/*'];
const PROJECT_FIRST_SHARED_TARGETS = ['./project-shared/*', './core-shared/*'];
const GLOBAL_ASSETS_DIRECTORY = 'assets/global';
const STATIC_ASSETS_DIRECTORY = 'assets/static';
const temporaryRoots: string[] = [];

const writeFile = (context: string, relativePath: string, content: string): void => {
    mkdirSync(dirname(join(context, relativePath)), { recursive: true });
    writeFileSync(join(context, relativePath), content);
};

const writeAliasConfiguration = (context: string, sharedAliasTargets: string[]): void => {
    writeFile(
        context,
        CONFIGURATION_FILE_NAME,
        JSON.stringify({
            compilerOptions: { paths: { 'ShopUi/*': ['./core-shop-ui/*'], [SHARED_ALIAS]: sharedAliasTargets } },
        }),
    );
};

// The smallest context the full configuration factory accepts: the core shared stylesheet the importer
// insists on, one global and one static assets directory (each copy plugin rejects an empty pattern list),
// a core Shared theme with one partial, and no project Shared theme files at all.
const createContext = (sharedAliasTargets: string[]): string => {
    const context = mkdtempSync(join(tmpdir(), 'yves-builder-development-configuration-'));
    temporaryRoots.push(context);
    mkdirSync(join(context, GLOBAL_ASSETS_DIRECTORY), { recursive: true });
    mkdirSync(join(context, STATIC_ASSETS_DIRECTORY), { recursive: true });
    writeFile(context, 'core-shop-ui/styles/shared.scss', '');
    writeFile(context, 'core-shared/Chat/_ping.scss', 'chat-ping { color: core; }\n');
    writeAliasConfiguration(context, sharedAliasTargets);

    return context;
};

const appSettingsFor = (context: string): AppSettings => ({
    name: 'yves_default',
    namespaceConfig: { namespace: 'Yves', defaultTheme: 'default', themes: ['default'], codeBucket: '' },
    theme: 'default',
    paths: {
        tsConfig: `./${CONFIGURATION_FILE_NAME}`,
        assets: {
            coreGlobalAssets: 'assets/core-global',
            globalAssets: GLOBAL_ASSETS_DIRECTORY,
            staticAssets: STATIC_ASSETS_DIRECTORY,
            currentAssets: 'assets/current',
        },
        // Absolute and never created: the factory cleans these directories, and a relative path would
        // resolve against the process working directory instead of the temporary context.
        public: join(context, 'public'),
        publicStatic: join(context, 'public-static'),
        // No sprite source, so the extractor stops before it writes anything.
        iconSprite: { sources: [], target: join(context, 'sprite.svg') },
    },
    urls: { assets: 'assets/current/default', staticAssets: 'assets/static' },
    criticalPatterns: [],
    buildHooks: [],
    context,
    isProductionMode: false,
    find: {
        componentEntryPoints: { dirs: [], patterns: [] },
        componentStyles: { dirs: [], patterns: [] },
        shopUiEntryPoints: { dirs: [join(context, 'project')], patterns: [] },
    },
});

const readCacheVersion = (configuration: BuildConfiguration): string | undefined => {
    const { cache } = configuration.webpack;

    return typeof cache === 'object' && cache.type === 'filesystem' ? cache.version : undefined;
};

const findSassLoaderOptions = (configuration: BuildConfiguration): SassLoaderOptions => {
    for (const rule of configuration.webpack.module?.rules ?? []) {
        if (!rule || rule === '...' || !Array.isArray(rule.use)) {
            continue;
        }

        for (const useEntry of rule.use) {
            if (useEntry && typeof useEntry === 'object' && useEntry.loader === 'sass-loader') {
                // webpack types loader options as an untyped record; sassOptions is the function development.mts sets.
                return useEntry.options as unknown as SassLoaderOptions;
            }
        }
    }

    throw new Error(
        'The development configuration (configs/development.mts) has no sass-loader entry in module.rules. ' +
            'Update this test to the new place of the Sass loader options.',
    );
};

beforeEach(() => {
    // The icon sprite extractor reports the missing sprite source on the console; it is not under test here.
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    jest.restoreAllMocks();

    while (temporaryRoots.length > 0) {
        rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
    }
});

describe('the webpack cache version', () => {
    it('stays the same when the configuration is built twice from identical settings', async () => {
        const appSettings = appSettingsFor(createContext(PROJECT_FIRST_SHARED_TARGETS));

        const firstVersion = readCacheVersion(await getConfiguration(appSettings));
        const secondVersion = readCacheVersion(await getConfiguration(appSettings));

        expect(firstVersion).toEqual(expect.any(String));
        expect(secondVersion).toBe(firstVersion);
    });

    it('changes when only the target list of an alias changes', async () => {
        const context = createContext(CORE_ONLY_SHARED_TARGETS);
        const appSettings = appSettingsFor(context);
        const coreOnlyVersion = readCacheVersion(await getConfiguration(appSettings));

        writeAliasConfiguration(context, PROJECT_FIRST_SHARED_TARGETS);
        const projectFirstVersion = readCacheVersion(await getConfiguration(appSettings));

        expect(projectFirstVersion).toEqual(expect.any(String));
        expect(projectFirstVersion).not.toBe(coreOnlyVersion);
    });
});

describe('the sass-loader options', () => {
    it('registers every project candidate the importer missed as a missing dependency of the loader, in order', async () => {
        const context = createContext(PROJECT_FIRST_SHARED_TARGETS);
        const { sassOptions } = findSassLoaderOptions(await getConfiguration(appSettingsFor(context)));
        const missingDependencies: string[] = [];
        const loaderContext: FakeLoaderContext = {
            addDependency: () => undefined,
            addMissingDependency: (filePath) => missingDependencies.push(filePath),
        };

        const [importer] = sassOptions(loaderContext).importers;
        await importer.canonicalize('@shared/ai-commerce/Chat/ping', { containingUrl: null });

        expect(missingDependencies).toEqual([
            join(context, 'project-shared/Chat/ping.scss'),
            join(context, 'project-shared/Chat/_ping.scss'),
            join(context, 'project-shared/Chat/ping/index.scss'),
            join(context, 'project-shared/Chat/ping/_index.scss'),
        ]);
    });
});
