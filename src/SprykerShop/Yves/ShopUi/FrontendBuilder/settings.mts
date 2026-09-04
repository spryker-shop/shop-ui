import { dirname, join, resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { BuildHook } from './libs/webpack/build-hooks.mts';
import type { NamespaceConfig } from './libs/sass/namespace-config-parser.mts';
import type { FindSettings } from './libs/webpack/finder.mts';

export interface IconSpriteConfig {
    sources: string[];
    target: string;
}

export interface GlobalSettings {
    context: string;
    modes: { dev: string; watch: string; prod: string };
    paths: {
        tsConfig: string;
        namespaceConfig: string;
        iconSprite: IconSpriteConfig;
        coreThemeRoot: string;
        sources: Record<string, string>;
    };
    criticalPatterns: string[];
    buildHooks: BuildHook[];
    expectedModeArgument: number;
}

export interface AppSettings {
    name: string;
    namespaceConfig: NamespaceConfig;
    theme: string;
    paths: {
        tsConfig: string;
        assets: { coreGlobalAssets: string; globalAssets: string; staticAssets: string; currentAssets: string };
        public: string;
        publicStatic: string;
        iconSprite: IconSpriteConfig;
        [sourceName: string]: unknown;
    };
    urls: { assets: string; staticAssets: string };
    criticalPatterns: string[];
    buildHooks: BuildHook[];
    context: string;
    isProductionMode: boolean;
    isInjectionDebuggingEnabled?: boolean;
    find: {
        componentEntryPoints: FindSettings;
        componentStyles: FindSettings;
        shopUiEntryPoints: FindSettings;
    };
}

interface DefineConfigOverrides {
    paths?: {
        sources?: Record<string, string>;
        iconSprite?: Partial<IconSpriteConfig>;
        coreThemeRoot?: string;
    };
    buildHooks?: BuildHook[];
}

export interface SourceLayout {
    name: string;
    marker: string;
    sources: Record<string, string>;
    iconSpriteSources: string[];
    coreThemeRoot: string;
}

const monorepoSourceLayout: SourceLayout = {
    name: 'monorepo (modules in src/)',
    marker: 'src/SprykerShop',
    sources: {
        core: './src/SprykerShop',
        sprykerCore: './src/Spryker',
        eco: './vendor/spryker-eco',
        features: './src/SprykerFeature',
        project: './src/Pyz/*/src/Pyz/Yves',
    },
    iconSpriteSources: [
        './src/Pyz/ShopUi/src/Pyz/Yves/ShopUi/Theme/default/components/atoms/icon-sprite/icon-sprite.twig',
        './src/SprykerShop/ShopUi/src/SprykerShop/Yves/ShopUi/Theme/default/components/atoms/icon-sprite/icon-sprite.twig',
    ],
    coreThemeRoot: './src/SprykerShop/ShopUi/src/SprykerShop/Yves/ShopUi/Theme',
};

const projectSourceLayout: SourceLayout = {
    name: 'project (modules in vendor/)',
    marker: 'vendor/spryker-shop',
    sources: {
        core: './vendor/spryker-shop',
        sprykerCore: './vendor/spryker',
        eco: './vendor/spryker-eco',
        features: './vendor/spryker-feature',
        project: './src/Pyz/Yves',
    },
    iconSpriteSources: [
        './src/Pyz/Yves/ShopUi/Theme/default/components/atoms/icon-sprite/icon-sprite.twig',
        './vendor/spryker-shop/shop-ui/src/SprykerShop/Yves/ShopUi/Theme/default/components/atoms/icon-sprite/icon-sprite.twig',
    ],
    coreThemeRoot: './vendor/spryker-shop/shop-ui/src/SprykerShop/Yves/ShopUi/Theme',
};

export const resolveProjectRoot = (startDirectory: string = process.cwd()): string => {
    let currentDirectory = resolve(startDirectory);

    for (;;) {
        if (existsSync(join(currentDirectory, 'package-lock.json'))) {
            return currentDirectory;
        }

        const parentDirectory = dirname(currentDirectory);

        if (parentDirectory === currentDirectory) {
            throw new Error(
                `Cannot locate the Yves project root above ${resolve(startDirectory)}: no ancestor ` +
                    `directory contains a "package-lock.json".\n` +
                    `The builder resolves every module path from the project root, which it finds by ` +
                    `walking up from the working directory.\n` +
                    `Run the command from inside the project, and run "npm install" first if the ` +
                    `lockfile is missing.\n`,
            );
        }

        currentDirectory = parentDirectory;
    }
};

export const resolveSourceLayout = (context: string = resolveProjectRoot()): SourceLayout => {
    if (existsSync(join(context, monorepoSourceLayout.marker))) {
        return monorepoSourceLayout;
    }

    if (existsSync(join(context, projectSourceLayout.marker))) {
        return projectSourceLayout;
    }

    throw new Error(
        `Cannot determine the Yves source layout for ${context}: neither ` +
            `"${monorepoSourceLayout.marker}" (${monorepoSourceLayout.name}) nor ` +
            `"${projectSourceLayout.marker}" (${projectSourceLayout.name}) exists there.\n` +
            `The builder resolves every component path relative to the current working directory, so ` +
            `it must run from the project root.\n` +
            `Run the build from the project root, install composer dependencies if vendor/ is missing, ` +
            `or declare the source directories explicitly in ./frontend/yves.settings.mts via ` +
            `defineConfig({ paths: { sources: { … } } }).\n`,
    );
};

const detectedSourceLayout = resolveSourceLayout();

export const defaultGlobalSettings: GlobalSettings = {
    context: resolveProjectRoot(),

    modes: {
        dev: 'development',
        watch: 'development-watch',
        prod: 'production',
    },

    paths: {
        tsConfig: './tsconfig.yves.json',
        namespaceConfig: './config/Yves/frontend-build-config.json',
        iconSprite: {
            sources: detectedSourceLayout.iconSpriteSources,
            target: './frontend/assets/global/default/icons/sprite.svg',
        },
        coreThemeRoot: detectedSourceLayout.coreThemeRoot,
        sources: detectedSourceLayout.sources,
    },

    criticalPatterns: ['**/ShopUi/**', '**/CatalogPage/**', '**/HomePage/**', '**/ProductDetailPage/**'],

    buildHooks: [],

    expectedModeArgument: 2,
};

export const defineConfig = (overrides: DefineConfigOverrides = {}): GlobalSettings => {
    const sourcesOverride = overrides?.paths?.sources ?? {};
    const iconSpriteOverride = overrides?.paths?.iconSprite ?? {};
    const buildHooksOverride = overrides?.buildHooks ?? defaultGlobalSettings.buildHooks;

    return {
        ...defaultGlobalSettings,
        buildHooks: buildHooksOverride,
        paths: {
            ...defaultGlobalSettings.paths,
            sources: {
                ...defaultGlobalSettings.paths.sources,
                ...sourcesOverride,
            },
            iconSprite: {
                ...defaultGlobalSettings.paths.iconSprite,
                ...iconSpriteOverride,
            },
            coreThemeRoot: overrides?.paths?.coreThemeRoot ?? defaultGlobalSettings.paths.coreThemeRoot,
        },
    };
};

export const loadProjectGlobalSettings = async (): Promise<GlobalSettings> => {
    const projectOverridePath = join(resolveProjectRoot(), 'frontend', 'yves.settings.mts');

    if (!existsSync(projectOverridePath)) {
        return defaultGlobalSettings;
    }

    try {
        const { default: projectSettings } = await import(pathToFileURL(projectOverridePath).href);

        return projectSettings as GlobalSettings;
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);

        throw new Error(
            `Failed to load project builder settings from ${projectOverridePath}: ${reason}. ` +
                `Node runs this file directly via TypeScript type stripping, so it must use only erasable ` +
                `TypeScript syntax — no enum, no namespace, no constructor parameter properties (they fail at ` +
                `runtime). Use only erasable TypeScript syntax, or check the file for syntax errors.`,
        );
    }
};

const entryPointParts = [
    'components/atoms/*/index.ts',
    'components/molecules/*/index.ts',
    'components/organisms/*/index.ts',
    'templates/*/index.ts',
    'views/*/index.ts',
];

const entryPointsCollection = (pathPattern: string): string[] =>
    entryPointParts.map((element) => `${pathPattern}/${element}`);

interface NamespaceJson {
    path: string;
    staticPath: string;
    namespaces: NamespaceConfig[];
}

const getNamespaceJson = (pathToConfig: string): NamespaceJson => JSON.parse(readFileSync(pathToConfig, 'utf8'));

const getAppSettingsByTheme = (
    namespaceConfig: NamespaceConfig,
    theme: string,
    pathToConfig: string,
    globalSettings: GlobalSettings,
) => {
    const name = 'yves_default';
    const namespaceJson = getNamespaceJson(pathToConfig);
    const assetsSourcePath = globalSettings.paths.sources;

    const getPublicUrl = () =>
        namespaceJson.path
            .replace(/%SPRYKER_BUILD_HASH%/gi, process.env.SPRYKER_BUILD_HASH || 'current')
            .replace(/%namespace%/gi, namespaceConfig.namespace)
            .replace(/%theme%/gi, theme);

    const getPublicStaticUrl = () => namespaceJson.staticPath;

    const getAllCodeBuckets = () => namespaceJson.namespaces.map((namespace) => namespace.codeBucket);

    const ignoreModulesCollection = () =>
        getAllCodeBuckets()
            .filter((suffix) => suffix !== namespaceConfig.codeBucket)
            .map((suffix) => `!**/*${suffix}/Theme/**`);

    const ignoreFiles = [
        '!config',
        '!data',
        '!deploy',
        '!node_modules',
        '!public',
        '!test',
        '!**/__tests__/**',
        ...ignoreModulesCollection(),
    ];

    const urls = {
        assets: getPublicUrl(),
        staticAssets: getPublicStaticUrl(),
    };

    const paths = {
        tsConfig: globalSettings.paths.tsConfig,
        assets: {
            coreGlobalAssets: join(globalSettings.paths.coreThemeRoot, theme, 'assets'),
            globalAssets: `./frontend/assets/global/${theme}`,
            staticAssets: './frontend/static',
            currentAssets: join('./frontend/assets', namespaceConfig.namespace, theme),
        },
        public: join('./public/Yves', urls.assets),
        publicStatic: resolve('./public/Yves', urls.staticAssets),
        iconSprite: globalSettings.paths.iconSprite,
        ...assetsSourcePath,
    };

    const isDefaultTheme = theme === namespaceConfig.defaultTheme;
    const getThemeName = (isFallbackPattern: boolean): string =>
        isFallbackPattern ? namespaceConfig.defaultTheme : theme;
    const isFallbackPatternAndDefaultTheme = (isFallbackPattern: boolean): boolean =>
        isFallbackPattern && isDefaultTheme;

    const customThemeEntryPointPatterns = (isFallbackPattern = false) => {
        if (isFallbackPatternAndDefaultTheme(isFallbackPattern)) {
            return [];
        }

        return [
            ...entryPointsCollection(`**/Theme/${getThemeName(isFallbackPattern)}`),
            ...entryPointsCollection(`**/*${namespaceConfig.codeBucket}/Theme/${getThemeName(isFallbackPattern)}`),
            ...ignoreFiles,
        ];
    };

    const shopUiEntryPointsPattern = (isFallbackPattern = false) => {
        if (isFallbackPatternAndDefaultTheme(isFallbackPattern)) {
            return [];
        }

        return [
            `./ShopUi/Theme/${getThemeName(isFallbackPattern)}`,
            `./ShopUi${namespaceConfig.codeBucket}/Theme/${getThemeName(isFallbackPattern)}`,
        ];
    };

    const isProductionMode = () => {
        const currentMode = process.argv.slice(globalSettings.expectedModeArgument)[0];

        return currentMode === globalSettings.modes.prod;
    };

    const assetsSourceDirs = Object.values(assetsSourcePath);

    return {
        name,
        namespaceConfig,
        theme,
        paths,
        urls,
        criticalPatterns: globalSettings.criticalPatterns,
        buildHooks: globalSettings.buildHooks,
        context: globalSettings.context,
        isProductionMode: isProductionMode(),
        find: {
            componentEntryPoints: {
                dirs: assetsSourceDirs,
                patterns: customThemeEntryPointPatterns(),
                fallbackPatterns: customThemeEntryPointPatterns(true),
            },
            componentStyles: {
                dirs: assetsSourceDirs,
                patterns: [
                    `**/Theme/${namespaceConfig.defaultTheme}/components/atoms/*/*.scss`,
                    `**/Theme/${namespaceConfig.defaultTheme}/components/molecules/*/*.scss`,
                    `**/Theme/${namespaceConfig.defaultTheme}/components/organisms/*/*.scss`,
                    `**/Theme/${namespaceConfig.defaultTheme}/templates/*/*.scss`,
                    `**/Theme/${namespaceConfig.defaultTheme}/views/*/*.scss`,
                    `!**/Theme/${namespaceConfig.defaultTheme}/**/style.scss`,
                    ...ignoreFiles,
                ],
            },
            shopUiEntryPoints: {
                dirs: [join(globalSettings.context, assetsSourcePath.project)],
                patterns: [...shopUiEntryPointsPattern()],
                fallbackPatterns: [...shopUiEntryPointsPattern(true)],
            },
        },
    };
};

export const getAppSettings = (
    namespaceConfigList: NamespaceConfig[],
    pathToConfig: string,
    globalSettings: GlobalSettings,
): AppSettings[] => {
    const appSettings: AppSettings[] = [];

    namespaceConfigList.forEach((namespaceConfig) => {
        namespaceConfig.themes.forEach((theme) => {
            appSettings.push(getAppSettingsByTheme(namespaceConfig, theme, pathToConfig, globalSettings));
        });
    });

    return appSettings;
};
