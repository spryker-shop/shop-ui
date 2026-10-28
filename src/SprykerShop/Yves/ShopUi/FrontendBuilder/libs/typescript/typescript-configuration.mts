import { join } from 'node:path';
import {
    buildYvesThemePattern,
    getSourceRoots,
    YVES_CONFIGURATION_FILE_NAME,
    resolveProjectRoot,
    resolveSourceLayout,
    resolveYvesConfigurationPath,
    sourceLayouts,
    type GlobalSettings,
    type SourceLayout,
} from '../../settings.mts';
import { collectPathAliases, isProvidedAliasName } from '../aliases/alias-provider.mts';
import { SHARED_THEME_OPTIONS, pathAliasProviders } from '../aliases/path-alias-providers.mts';
import { buildSharedThemeSourcePatterns } from '../aliases/shared-theme-aliases.mts';
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

const buildBuilderDirectory = (layout: SourceLayout): string =>
    joinConfigurationPath(...toConfigurationPathSegments(layout.coreThemeRoot).slice(0, -1), BUILDER_DIRECTORY_NAME);

// The Shared themes reach the program through imports anyway, but an editor opens a file only with the paths of a
// project whose include matches it, and without those the `@shared` imports do not resolve.
const buildIncludePatterns = (sourceRoots: string[], builderDirectory: string): string[] => [
    ...sourceRoots.map((sourceRoot) => buildYvesThemePattern(sourceRoot, TYPESCRIPT_FILE_PATTERN)),
    ...new Set(sourceRoots.flatMap((sourceRoot) => buildSharedThemeSourcePatterns(sourceRoot, SHARED_THEME_OPTIONS))),
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
    const generatedAliases = await collectPathAliases(pathAliasProviders, getSourceRoots(globalSettings));
    const paths: Record<string, string[]> = { '*': [buildRelativeReference(parentDirectoryLadder, '*')] };

    for (const [aliasName, aliasTargets] of Object.entries(generatedAliases)) {
        paths[aliasName] = aliasTargets.map((aliasTarget) =>
            buildRelativeReference(parentDirectoryLadder, aliasTarget),
        );
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
    // Only a wildcard alias is ever generated here, so a bare one is the project's own whatever its name.
    const handWrittenAliases = Object.fromEntries(
        Object.entries(compilerOptions.paths ?? {}).filter(
            ([aliasName]) => !(aliasName.endsWith('/*') && isProvidedAliasName(pathAliasProviders, aliasName)),
        ),
    );
    compilerOptions.paths = Object.fromEntries(
        Object.entries({ ...handWrittenAliases, ...paths }).sort(([left], [right]) => left.localeCompare(right)),
    );
    configuration.compilerOptions = compilerOptions;

    // The Yves sources and the Shared themes; only the Shared themes overlap the Back Office program, both compile them.
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
