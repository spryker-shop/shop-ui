import { join, resolve } from 'node:path';
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
        assets: { globalAssets: string; staticAssets: string; currentAssets: string };
        public: string;
        publicStatic: string;
        iconSprite: IconSpriteConfig;
        // The source scan roots (`core`, `sprykerCore`, …) are spread in here, so any extra key is a path.
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
    };
    buildHooks?: BuildHook[];
}

export interface SourceLayout {
    name: string;
    marker: string;
    sources: Record<string, string>;
    iconSpriteSources: string[];
}

// The key order of `sources` is load-bearing in both layouts: `assetsSourceDirs =
// Object.values(...)` drives the component CSS emission order and the mixin-index precedence
// ("later entry wins"). `project` is listed last — a deliberate divergence from master's legacy
// builder, whose dir order was core, sprykerCore, eco, project, features (features last), giving a
// feature module priority over a same-named project mixin, a semantics nobody intended. With
// `project` last, a project mixin overrides a same-named feature mixin, mirroring the legacy "last
// @import wins" precedence customers actually expect for project-level overrides. This is inert for
// CSS output today (zero duplicate mixin names across the scanned set, verified) — the CSS output
// under this order was proven equivalent to the legacy builder's before that comparison tooling was
// retired.
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
};

/**
 * Picks the source layout by probing the project tree for a marker directory.
 *
 * The monorepo keeps every shop, core and feature module in `src/`; a project install receives them
 * from composer under `vendor/`. The markers are mutually exclusive in practice: only the monorepo
 * has `src/SprykerShop`, and only a project install has `vendor/spryker-shop` (the monorepo's vendor
 * tree carries `spryker/` and `spryker-eco/`, never `spryker-shop/`). When both are present the
 * monorepo wins, because a checkout that owns the modules in `src/` is the authoritative copy.
 *
 * Detection probes the project tree rather than the builder's own path on purpose: Node resolves
 * symlinks in `import.meta.url`, so a module symlinked into `vendor/` by a composer path repository
 * would otherwise report the monorepo layout inside a project.
 */
export const resolveSourceLayout = (context: string = process.cwd()): SourceLayout => {
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
    context: process.cwd(),

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
        sources: detectedSourceLayout.sources,
    },

    // Patterns for components that must be bundled in the critical chunk (above the fold)
    criticalPatterns: ['**/ShopUi/**', '**/CatalogPage/**', '**/HomePage/**', '**/ProductDetailPage/**'],

    // Project-supplied build hooks run before webpack assembly. Each hook is { name, run(appSettings) }
    // and may return entry contributions ({ critical?, app?, nonCritical? }) that are merged into the
    // corresponding webpack entries. The builder ships none; projects register their own via
    // defineConfig({ buildHooks: [myHook] }) — see libs/webpack/build-hooks.mts for the contract.
    buildHooks: [],

    expectedModeArgument: 2,
};

/**
 * Builds project-level builder settings by merging the supported overrides into the defaults.
 *
 * A project on the standard layout needs no override at all: `resolveSourceLayout` already points
 * the source directories at `vendor/`. Override only when the layout deviates from that.
 *
 * Projects may override:
 *   - `paths.sources`     — where the builder looks for component assets to build
 *   - `paths.iconSprite`  — icon sprite source/target locations
 *   - `buildHooks`        — project build steps run before webpack assembly (e.g. design tokens)
 *
 * All other fields are fixed and inherited from `defaultGlobalSettings`.
 *
 */
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
        },
    };
};

/**
 * Resolves the project-level builder settings. Loads `./frontend/yves.settings.mts` when present
 * — its default export replaces the defaults — otherwise returns the packaged defaults. Every
 * entry point that needs global settings (build.mts, the stylelint runner) calls this, so the
 * discovery rule lives in exactly one place.
 */
export const loadProjectGlobalSettings = async (): Promise<GlobalSettings> => {
    const projectOverridePath = join(process.cwd(), 'frontend', 'yves.settings.mts');

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
        // Builder Jest fixtures live under `__tests__/fixtures/**` and contain component-shaped
        // `.scss` (e.g. duplicate `probe-mixin` definitions in project-override). They must never
        // enter the production style/entry scan: they would break the zero-duplicate-mixin-name
        // invariant and let injection resolve against non-shipped files.
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
