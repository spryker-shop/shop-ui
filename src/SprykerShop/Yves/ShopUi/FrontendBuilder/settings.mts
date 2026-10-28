import { dirname, join, resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import glob from 'fast-glob';
import type { BuildHook } from './libs/webpack/build-hooks.mts';
import type { NamespaceConfig } from './libs/sass/namespace-config-parser.mts';
import type { FindSettings } from './libs/webpack/finder.mts';
import type { SourceRoots } from './libs/aliases/alias-provider.mts';

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
    /** Whether `lint` also runs the TypeScript compiler over the Yves sources. */
    typecheck: boolean;
    expectedModeArgument: number;
    generatedBuildConfiguration: GeneratedBuildConfiguration | null;
    buildConfigurationSource: string;
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
    typecheck?: boolean;
}

export interface SourceLayout {
    name: string;
    marker: string;
    sources: Record<string, string>;
    iconSpriteSources: string[];
    coreThemeRoot: string;
    typecheck: boolean;
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
    typecheck: true,
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
    // Off by default: a project's own sources were never type-checked, so turning it on in a minor
    // release would fail the project's lint on code nobody changed.
    typecheck: false,
};

export const sourceLayouts: SourceLayout[] = [monorepoSourceLayout, projectSourceLayout];

// Written by the backend before every build; without it the built-in layout above stays in effect.
export const BUILD_CONFIGURATION_PATH = 'data/cache/Yves/frontend/build-config.json';

export interface GeneratedBuildConfiguration {
    /** Strongest first. */
    coreNamespaces: string[];
    projectNamespaces: string[];
    theme?: string;
    defaultTheme?: string;
}

export const readGeneratedBuildConfiguration = (context: string): GeneratedBuildConfiguration | null => {
    const filePath = join(context, BUILD_CONFIGURATION_PATH);

    if (!existsSync(filePath)) {
        return null;
    }

    const parsed: Partial<GeneratedBuildConfiguration> = JSON.parse(readFileSync(filePath, 'utf8'));

    if (!Array.isArray(parsed.coreNamespaces) || !Array.isArray(parsed.projectNamespaces)) {
        throw new Error(
            `${filePath}: "coreNamespaces" and "projectNamespaces" must be lists of namespace names; ` +
                `regenerate the file with "vendor/bin/console frontend:yves:build".`,
        );
    }

    return parsed as GeneratedBuildConfiguration;
};

const dasherize = (value: string): string => value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

// `src/<Namespace>` when the repository holds the modules, the Composer package directory otherwise.
const resolveNamespaceDirectory = (context: string, namespace: string): string =>
    existsSync(join(context, 'src', namespace)) ? `./src/${namespace}` : `./vendor/${dasherize(namespace)}`;

// `project` is the root that holds the application entry and the key a settings file may replace.
const PROJECT_NAMESPACE = 'Pyz';
const PROJECT_SOURCE_KEY = 'project';

// Every other namespace keeps its lower-cased name, so a key alone does not tell project from core.
const toNamespaceSourceKey = (namespace: string): string =>
    namespace === PROJECT_NAMESPACE ? PROJECT_SOURCE_KEY : namespace.toLowerCase();

const SHOP_UI_HOME_NAMESPACE = 'SprykerShop';
const ICON_SPRITE_THEME_RELATIVE_PATH = 'ShopUi/Theme/default/components/atoms/icon-sprite/icon-sprite.twig';

// The finder lets a later root win, the backend lists the strongest first: both lists are reversed.
// A project root is emitted in both layout shapes (split per module and flat); an empty shape matches nothing.
const buildGeneratedSources = (context: string, generated: GeneratedBuildConfiguration): Record<string, string> => {
    const sources: Record<string, string> = {};

    [...generated.coreNamespaces].reverse().forEach((namespace) => {
        sources[toNamespaceSourceKey(namespace)] = resolveNamespaceDirectory(context, namespace);
    });
    [...generated.projectNamespaces].reverse().forEach((namespace) => {
        const sourceKey = toNamespaceSourceKey(namespace);

        // Split shape last: its key (`project` for Pyz) stays the strongest root, also when a settings file replaces it.
        sources[`${sourceKey}/Yves`] = `${resolveNamespaceDirectory(context, namespace)}/Yves`;
        sources[sourceKey] = `${resolveNamespaceDirectory(context, namespace)}/*/src/${namespace}/Yves`;
    });

    return sources;
};

// The ShopUi package directory is `ShopUi` in the monorepo and `shop-ui` under vendor/.
const resolveGeneratedCoreThemeRoot = (context: string): string => {
    const pattern = `${resolveNamespaceDirectory(context, SHOP_UI_HOME_NAMESPACE).replace(/^\.\//, '')}/*/src/SprykerShop/Yves/ShopUi/Theme`;
    const matches = glob.sync(pattern, { cwd: context, onlyDirectories: true }).sort();

    if (matches.length !== 1) {
        throw new Error(
            `Cannot locate the core ShopUi theme from ${join(context, BUILD_CONFIGURATION_PATH)}: ` +
                `${matches.length === 0 ? `nothing matches ${pattern}` : `several match: ${matches.join(', ')}`}.\n` +
                `The builder derives the core theme root from the "${SHOP_UI_HOME_NAMESPACE}" namespace of the file.\n` +
                `Check that the ShopUi module is installed, or set paths.coreThemeRoot in ./${PROJECT_SETTINGS_RELATIVE_PATH}.\n`,
        );
    }

    return `./${matches[0]}`;
};

// Defaults, then the generated file, then the project settings on top: a `paths` value the settings
// changed survives, so a root from `frontend/yves.settings.mts` is scanned after the generated ones.
export const applyGeneratedBuildConfiguration = (
    settings: GlobalSettings,
    generated: GeneratedBuildConfiguration | null,
): GlobalSettings => {
    if (generated === null) {
        return settings;
    }

    const isProjectValue = (value: unknown, defaultValue: unknown): boolean =>
        JSON.stringify(value) !== JSON.stringify(defaultValue);
    const projectSources = Object.fromEntries(
        Object.entries(settings.paths.sources).filter(
            ([key, root]) => defaultGlobalSettings.paths.sources[key] !== root,
        ),
    );
    const coreThemeRoot = isProjectValue(settings.paths.coreThemeRoot, defaultGlobalSettings.paths.coreThemeRoot)
        ? settings.paths.coreThemeRoot
        : resolveGeneratedCoreThemeRoot(settings.context);
    const iconSpriteSources = generated.projectNamespaces.flatMap((namespace) => [
        `${resolveNamespaceDirectory(settings.context, namespace)}/ShopUi/src/${namespace}/Yves/${ICON_SPRITE_THEME_RELATIVE_PATH}`,
        `${resolveNamespaceDirectory(settings.context, namespace)}/Yves/${ICON_SPRITE_THEME_RELATIVE_PATH}`,
    ]);

    return {
        ...settings,
        paths: {
            ...settings.paths,
            tsConfig: resolveYvesConfigurationPath(settings.context, { coreThemeRoot }),
            iconSprite: {
                ...settings.paths.iconSprite,
                sources: isProjectValue(
                    settings.paths.iconSprite.sources,
                    defaultGlobalSettings.paths.iconSprite.sources,
                )
                    ? settings.paths.iconSprite.sources
                    : [
                          ...iconSpriteSources,
                          `${coreThemeRoot}/${ICON_SPRITE_THEME_RELATIVE_PATH.replace(/^ShopUi\/Theme\//, '')}`,
                      ],
            },
            coreThemeRoot,
            sources: { ...buildGeneratedSources(settings.context, generated), ...projectSources },
        },
        generatedBuildConfiguration: generated,
        buildConfigurationSource: `generated (${join(settings.context, BUILD_CONFIGURATION_PATH)})`,
    };
};

const OWNED_SOURCE_PREFIX = './src/';
export const YVES_DIRECTORY_NAME = 'Yves';

// Only the sources the repository itself contains are linted. In a project layout the core, eco and
// feature roots point into vendor/, which is installed code and not ours to report on.
export const getOwnedSourceRoots = (globalSettings: GlobalSettings): string[] =>
    Object.values(globalSettings.paths.sources).filter((sourceRoot) => sourceRoot.startsWith(OWNED_SOURCE_PREFIX));

const isSourceKeyOfNamespace = (sourceKey: string, namespaceSourceKey: string): boolean =>
    sourceKey === namespaceSourceKey || sourceKey.startsWith(`${namespaceSourceKey}/`);

// The backend namespace list decides what is project code; without it only the `project` key is.
// A root a settings file adds under any other key counts as core.
const getProjectNamespaceSourceKeys = (globalSettings: GlobalSettings): string[] =>
    globalSettings.generatedBuildConfiguration?.projectNamespaces.map(toNamespaceSourceKey) ?? [PROJECT_SOURCE_KEY];

/** One list per project namespace, strongest namespace first, as `KernelConstants::PROJECT_NAMESPACES` orders them. */
const getProjectSourceRootsByNamespace = (globalSettings: GlobalSettings): string[][] =>
    getProjectNamespaceSourceKeys(globalSettings).map((namespaceSourceKey) =>
        Object.entries(globalSettings.paths.sources)
            .filter(([sourceKey]) => isSourceKeyOfNamespace(sourceKey, namespaceSourceKey))
            .map(([, sourceRoot]) => sourceRoot),
    );

// In source order, the strongest last, as the finder lets a later root win.
export const getProjectSourceRoots = (globalSettings: GlobalSettings): string[] => {
    const namespaceSourceKeys = getProjectNamespaceSourceKeys(globalSettings);

    return Object.entries(globalSettings.paths.sources)
        .filter(([sourceKey]) =>
            namespaceSourceKeys.some((namespaceSourceKey) => isSourceKeyOfNamespace(sourceKey, namespaceSourceKey)),
        )
        .map(([, sourceRoot]) => sourceRoot);
};

// Classified once here; the alias providers take the split as given. The project roots of one namespace stay
// together, the strongest namespace first.
export const getSourceRoots = (globalSettings: GlobalSettings): SourceRoots => {
    const projectSourceRoots = getProjectSourceRootsByNamespace(globalSettings).flat();

    return {
        context: globalSettings.context,
        core: Object.values(globalSettings.paths.sources).filter(
            (sourceRoot) => !projectSourceRoots.includes(sourceRoot),
        ),
        project: projectSourceRoots,
    };
};

export const isYvesLayerRoot = (sourceRoot: string): boolean => sourceRoot.endsWith(`/${YVES_DIRECTORY_NAME}`);

// A source root that does not already end in the Yves layer still has to reach it, otherwise the
// pattern also matches themes belonging to other layers, such as the Configurator applications.
export const buildYvesThemePattern = (sourceRoot: string, filePattern: string): string =>
    isYvesLayerRoot(sourceRoot)
        ? `${sourceRoot}/**/Theme/**/${filePattern}`
        : `${sourceRoot}/**/${YVES_DIRECTORY_NAME}/**/Theme/**/${filePattern}`;

export const BUILDER_TESTS_PATTERN = '**/FrontendBuilder/__tests__/**';

export const PROJECT_SETTINGS_RELATIVE_PATH = 'frontend/yves.settings.mts';

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

export const YVES_CONFIGURATION_FILE_NAME = 'tsconfig.yves.json';

// A project that keeps its own copy at the root owns it; otherwise it is generated next to the builder.
export const resolveYvesConfigurationPath = (context: string, layout: Pick<SourceLayout, 'coreThemeRoot'>): string =>
    existsSync(join(context, YVES_CONFIGURATION_FILE_NAME))
        ? `./${YVES_CONFIGURATION_FILE_NAME}`
        : `${dirname(layout.coreThemeRoot)}/FrontendBuilder/${YVES_CONFIGURATION_FILE_NAME}`;

export const defaultGlobalSettings: GlobalSettings = {
    context: resolveProjectRoot(),

    modes: {
        dev: 'development',
        watch: 'development-watch',
        prod: 'production',
    },

    paths: {
        tsConfig: resolveYvesConfigurationPath(resolveProjectRoot(), detectedSourceLayout),
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

    typecheck: detectedSourceLayout.typecheck,

    expectedModeArgument: 2,

    generatedBuildConfiguration: null,
    buildConfigurationSource: `built-in defaults (no ${BUILD_CONFIGURATION_PATH}; the backend generates it)`,
};

export const defineConfig = (overrides: DefineConfigOverrides = {}): GlobalSettings => {
    const sourcesOverride = overrides?.paths?.sources ?? {};
    const iconSpriteOverride = overrides?.paths?.iconSprite ?? {};
    const buildHooksOverride = overrides?.buildHooks ?? defaultGlobalSettings.buildHooks;

    return {
        ...defaultGlobalSettings,
        buildHooks: buildHooksOverride,
        typecheck: overrides?.typecheck ?? defaultGlobalSettings.typecheck,
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
    const projectOverridePath = join(resolveProjectRoot(), PROJECT_SETTINGS_RELATIVE_PATH);

    const generated = readGeneratedBuildConfiguration(defaultGlobalSettings.context);

    if (!existsSync(projectOverridePath)) {
        return applyGeneratedBuildConfiguration(defaultGlobalSettings, generated);
    }

    try {
        const { default: projectSettings } = await import(pathToFileURL(projectOverridePath).href);

        return applyGeneratedBuildConfiguration(projectSettings as GlobalSettings, generated);
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

const componentStyleParts = [
    'components/atoms/*/*.scss',
    'components/molecules/*/*.scss',
    'components/organisms/*/*.scss',
    'templates/*/*.scss',
    'views/*/*.scss',
];

export interface NamespaceJson {
    path: string;
    staticPath: string;
    namespaces: NamespaceConfig[];
}

// The namespace file stays the source of the URL, the code buckets and the namespaces with their own
// themes; the backend configuration adds the theme it is configured with and sets the default theme.
export const resolveNamespaceJson = (pathToConfig: string, globalSettings: GlobalSettings): NamespaceJson => {
    const namespaceJson: NamespaceJson = JSON.parse(readFileSync(pathToConfig, 'utf8'));
    const generated = globalSettings.generatedBuildConfiguration;

    if (generated === null) {
        return namespaceJson;
    }

    return {
        ...namespaceJson,
        namespaces: namespaceJson.namespaces.map((entry) => {
            const defaultTheme = generated.defaultTheme || entry.defaultTheme;
            const addsTheme =
                Boolean(generated.theme) &&
                generated.theme !== defaultTheme &&
                !entry.themes.includes(generated.theme!);

            return { ...entry, defaultTheme, themes: addsTheme ? [...entry.themes, generated.theme!] : entry.themes };
        }),
    };
};

const getAppSettingsByTheme = (
    namespaceConfig: NamespaceConfig,
    theme: string,
    pathToConfig: string,
    globalSettings: GlobalSettings,
) => {
    const name = 'yves_default';
    const namespaceJson = resolveNamespaceJson(pathToConfig, globalSettings);
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

    // Component style files feed the mixin index and the legacy style rescue. Like the entry points,
    // they are collected from the default theme first and the current theme after it, so a
    // current-theme mixin wins over the default-theme one of the same name, project last within
    // each theme. `style.scss` aggregators only include, they define nothing worth indexing.
    const componentStylePatterns = (isFallbackPattern = false) => {
        if (isFallbackPatternAndDefaultTheme(isFallbackPattern)) {
            return [];
        }

        const themeName = getThemeName(isFallbackPattern);

        return [
            ...componentStyleParts.map((element) => `**/Theme/${themeName}/${element}`),
            `!**/Theme/${themeName}/**/style.scss`,
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
                patterns: componentStylePatterns(),
                fallbackPatterns: componentStylePatterns(true),
            },
            shopUiEntryPoints: {
                dirs: getProjectSourceRoots(globalSettings).map((sourceRoot) =>
                    join(globalSettings.context, sourceRoot),
                ),
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
