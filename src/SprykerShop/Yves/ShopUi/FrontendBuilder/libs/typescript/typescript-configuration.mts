import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import glob from 'fast-glob';
import {
    buildYvesThemePattern,
    getProjectSourceRoots,
    isYvesLayerRoot,
    YVES_CONFIGURATION_FILE_NAME,
    resolveProjectRoot,
    resolveSourceLayout,
    resolveYvesConfigurationPath,
    sourceLayouts,
    type GlobalSettings,
    type SourceLayout,
} from '../../settings.mts';
import {
    buildParentDirectoryLadder,
    buildRelativeReference,
    joinConfigurationPath,
    toConfigurationPathSegments,
} from './configuration-path.mts';
import { readConfigurationFile, reconcileEntryList, type TypeScriptConfiguration } from './configuration-file.mts';
import {
    PROJECT_CONFIGURATION_FILE_NAME,
    reconcileSolutionConfiguration,
    type SolutionReconciliation,
} from './solution-configuration.mts';

export { YVES_CONFIGURATION_FILE_NAME };
export const DEFAULTS_CONFIGURATION_FILE_NAME = 'tsconfig.defaults.json';

// Formerly the project root tsconfig.json; the root now only carries what a project overrides.
const SHARED_COMPILER_OPTIONS: Record<string, unknown> = {
    sourceMap: true,
    noImplicitAny: false,
    declaration: false,
    emitDecoratorMetadata: true,
    experimentalDecorators: true,
    noEmitHelpers: true,
    importHelpers: true,
    skipLibCheck: true,
    skipDefaultLibCheck: true,
    removeComments: true,
    useDefineForClassFields: false,
    moduleResolution: 'bundler',
    target: 'es2020',
    module: 'esnext',
    lib: ['dom', 'esnext'],
    strict: false,
};

const SHARED_EXCLUDED_PATHS = ['**/node_modules/**', '**/*.spec.ts', '**/*.test.ts', 'public', 'dist', '**/dist/**'];
// The builder's own fixtures sit under a Theme path, so the Yves include would otherwise reach them.
const BUILDER_TESTS_PATH = '**/FrontendBuilder/__tests__/**';

// The builder is the sibling of the core ShopUi theme root in both layouts.
const BUILDER_DIRECTORY_NAME = 'FrontendBuilder';

// Browser bundle code shipped inside the builder; it is compiled with the Yves sources, not as builder code.
const RELOAD_CLIENT_BUILDER_RELATIVE_PATTERN = 'libs/reload/client/**/*.ts';

const TYPESCRIPT_FILE_PATTERN = '*.ts';

const MODULE_THEME_DIRECTORY_PATTERN = '*/src/*/Yves/*/Theme/default';
// A root that already ends in the Yves layer holds the modules directly, as a project's src/Pyz/Yves does.
const LAYER_THEME_DIRECTORY_PATTERN = '*/Theme/default';

// Project themes are addressed as `src/<Module>/…`, so they never take over a core module's name.
const PROJECT_THEME_ALIAS_PREFIX = 'src/';

/**
 * A module earns an alias when its theme is actually imported through one. Emitting one per module
 * would put 133 entries into `resolve.alias`, and that map also drives Sass resolution here, so a
 * generated alias is not free: it can shadow a package name or a partial. The hand-maintained list
 * this replaces had already drifted — it named two modules nothing imports and omitted none —
 * which is the divergence the generation removes.
 */
// Any quoted string, not only `from`/`@use`/`@import`: lazy components are registered through
// `import(/* webpackChunkName: … */ 'Module/…')`, often across lines. Over-matching costs nothing, since
// an alias is only emitted for a module whose theme directory exists.
const CORE_ALIAS_IMPORT_PATTERN = /['"]([A-Z][A-Za-z0-9]*)\//g;
const PROJECT_ALIAS_IMPORT_PATTERN = /['"]src\/([A-Z][A-Za-z0-9]*)\//g;

interface AliasImportNames {
    core: Set<string>;
    project: Set<string>;
}

const collectAliasImportNames = async (context: string, sourceRoots: string[]): Promise<AliasImportNames> => {
    const names: AliasImportNames = { core: new Set(), project: new Set() };
    const files = await glob(
        sourceRoots.map((sourceRoot) => `${sourceRoot}/**/Theme/**/*.{ts,scss}`),
        {
            cwd: context,
            absolute: true,
            onlyFiles: true,
            followSymbolicLinks: false,
            ignore: ['**/node_modules/**', '**/__tests__/**'],
        },
    );

    for (const file of files) {
        const content = readFileSync(file, 'utf8');

        for (const match of content.matchAll(CORE_ALIAS_IMPORT_PATTERN)) {
            names.core.add(match[1]);
        }

        for (const match of content.matchAll(PROJECT_ALIAS_IMPORT_PATTERN)) {
            names.project.add(match[1]);
        }
    }

    return names;
};

const findThemeDirectories = async (context: string, sourceRoots: string[]): Promise<string[]> =>
    (
        await Promise.all(
            sourceRoots.map((sourceRoot) =>
                glob(
                    joinConfigurationPath(
                        sourceRoot,
                        isYvesLayerRoot(sourceRoot) ? LAYER_THEME_DIRECTORY_PATTERN : MODULE_THEME_DIRECTORY_PATTERN,
                    ),
                    { cwd: context, onlyDirectories: true, followSymbolicLinks: false },
                ),
            ),
        )
    )
        .flat()
        .sort();

// `…/<Module>/Theme/default`: the module is the segment above `Theme`.
const getThemeModuleName = (themeDirectory: string): string => toConfigurationPathSegments(themeDirectory).slice(-3)[0];

const buildBuilderDirectory = (layout: SourceLayout): string =>
    joinConfigurationPath(...toConfigurationPathSegments(layout.coreThemeRoot).slice(0, -1), BUILDER_DIRECTORY_NAME);

const buildIncludePatterns = (sourceRoots: string[], builderDirectory: string): string[] => [
    ...sourceRoots.map((sourceRoot) => buildYvesThemePattern(sourceRoot, TYPESCRIPT_FILE_PATTERN)),
    joinConfigurationPath(builderDirectory, RELOAD_CLIENT_BUILDER_RELATIVE_PATTERN),
];

const buildBuilderLadders = (): string[] =>
    sourceLayouts.map((layout) => buildParentDirectoryLadder(buildBuilderDirectory(layout)));

// Covers every layout, so switching layouts replaces the previous layout's entries instead of leaving them.
const buildRecognisedIncludeEntries = (): string[] => {
    const entries = sourceLayouts.flatMap((layout) =>
        buildIncludePatterns(Object.values(layout.sources), buildBuilderDirectory(layout)),
    );

    return [
        ...new Set(
            ['', ...buildBuilderLadders()].flatMap((ladder) =>
                entries.map((entry) => joinConfigurationPath(ladder, entry)),
            ),
        ),
    ];
};

// The project root comes last, so the options a project sets there override the builder defaults.
const buildGeneratedExtends = (parentDirectoryLadder: string): string[] => [
    `./${DEFAULTS_CONFIGURATION_FILE_NAME}`,
    buildRelativeReference(parentDirectoryLadder, PROJECT_CONFIGURATION_FILE_NAME),
];

export const resolveYvesConfigurationLocation = (
    context: string = resolveProjectRoot(),
): { filePath: string; directory: string } => {
    const configurationPath = resolveYvesConfigurationPath(context, resolveSourceLayout(context));
    const directory = joinConfigurationPath(...toConfigurationPathSegments(configurationPath).slice(0, -1));

    return { filePath: join(context, configurationPath), directory };
};

export const reconcileDefaultsConfiguration = (
    globalSettings: GlobalSettings,
): { filePath: string; configuration: TypeScriptConfiguration } => {
    const directory = buildBuilderDirectory(resolveSourceLayout(globalSettings.context));
    const parentDirectoryLadder = buildParentDirectoryLadder(directory);
    const configurationPath = joinConfigurationPath(directory, DEFAULTS_CONFIGURATION_FILE_NAME);

    return {
        filePath: join(globalSettings.context, configurationPath),
        configuration: {
            compilerOptions: {
                ...SHARED_COMPILER_OPTIONS,
                // Path-bearing options resolve against this file, so they climb back to the project root.
                typeRoots: [joinConfigurationPath(parentDirectoryLadder, 'node_modules/@types')],
                rootDir: parentDirectoryLadder,
            },
            // An exclude glob resolves against this file as well, the `**/` ones included.
            exclude: [...SHARED_EXCLUDED_PATHS, BUILDER_TESTS_PATH].map((excludedPath) =>
                joinConfigurationPath(parentDirectoryLadder, excludedPath),
            ),
        },
    };
};

export const reconcileProjectSolution = (globalSettings: GlobalSettings): SolutionReconciliation => {
    const { context } = globalSettings;
    const { directory } = resolveYvesConfigurationLocation(context);
    const equivalentReferencePaths = [
        YVES_CONFIGURATION_FILE_NAME,
        ...sourceLayouts.map((layout) =>
            joinConfigurationPath(buildBuilderDirectory(layout), YVES_CONFIGURATION_FILE_NAME),
        ),
    ];

    return reconcileSolutionConfiguration(context, {
        referencePath: `./${joinConfigurationPath(directory, YVES_CONFIGURATION_FILE_NAME)}`,
        isEquivalentReference: (referencePath) => equivalentReferencePaths.includes(referencePath),
    });
};

export const reconcileYvesConfiguration = async (
    globalSettings: GlobalSettings,
): Promise<{ filePath: string; configuration: TypeScriptConfiguration }> => {
    const { context } = globalSettings;
    const { filePath, directory } = resolveYvesConfigurationLocation(context);
    const parentDirectoryLadder = buildParentDirectoryLadder(directory);
    const sourceRoots = Object.values(globalSettings.paths.sources);
    const projectSourceRoots = getProjectSourceRoots(globalSettings);

    // In a project the core themes live in vendor/, so every root but the project ones is searched;
    // a project theme of the same name must not take over the core module's alias.
    const coreThemeDirectories = await findThemeDirectories(
        context,
        sourceRoots.filter((sourceRoot) => !projectSourceRoots.includes(sourceRoot)),
    );
    const projectThemeDirectories = await findThemeDirectories(context, projectSourceRoots);

    // Usages are collected from every source root: an eco module in vendor/ imports
    // TraceableEventWidget through its alias, and missing that would drop an alias the build needs.
    const aliasImportNames = await collectAliasImportNames(context, sourceRoots);
    const paths: Record<string, string[]> = { '*': [buildRelativeReference(parentDirectoryLadder, '*')] };
    const addThemeAlias = (aliasName: string, themeDirectory: string): void => {
        paths[`${aliasName}/*`] = [
            buildRelativeReference(parentDirectoryLadder, joinConfigurationPath(themeDirectory, '*')),
        ];
    };

    for (const themeDirectory of coreThemeDirectories) {
        const moduleName = getThemeModuleName(themeDirectory);

        if (aliasImportNames.core.has(moduleName)) {
            addThemeAlias(moduleName, themeDirectory);
        }
    }

    for (const themeDirectory of projectThemeDirectories) {
        const moduleName = getThemeModuleName(themeDirectory);

        if (aliasImportNames.project.has(moduleName)) {
            addThemeAlias(`${PROJECT_THEME_ALIAS_PREFIX}${moduleName}`, themeDirectory);
        }
    }

    const configuration: TypeScriptConfiguration = readConfigurationFile(filePath) ?? {
        extends: buildGeneratedExtends(parentDirectoryLadder),
        compilerOptions: {},
    };

    // Generated like `paths`; a copy the project keeps in its root keeps whatever it extends.
    if (directory !== '') {
        configuration.extends = buildGeneratedExtends(parentDirectoryLadder);
    }

    const compilerOptions = configuration.compilerOptions ?? {};
    const handWrittenAliases = Object.fromEntries(
        Object.entries(compilerOptions.paths ?? {}).filter(
            ([aliasName]) => !aliasName.endsWith('/*') || aliasName === '*',
        ),
    );
    compilerOptions.paths = Object.fromEntries(
        Object.entries({ ...handWrittenAliases, ...paths }).sort(([left], [right]) => left.localeCompare(right)),
    );
    configuration.compilerOptions = compilerOptions;

    // Only the Yves sources, so this program no longer overlaps the Back Office and Merchant Portal ones.
    const recognisedIncludeEntries = buildRecognisedIncludeEntries();
    configuration.include = reconcileEntryList(
        configuration.include,
        buildIncludePatterns(sourceRoots, buildBuilderDirectory(resolveSourceLayout(context))).map((includePattern) =>
            joinConfigurationPath(parentDirectoryLadder, includePattern),
        ),
        (existingEntry) => recognisedIncludeEntries.includes(existingEntry),
    );

    return { filePath, configuration };
};
