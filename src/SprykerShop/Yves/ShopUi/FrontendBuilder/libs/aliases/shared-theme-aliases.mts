// Duplicated on purpose: the Gui and ShopUi FrontendBuilders each carry this file until they share a package.
import { join } from 'node:path';
import glob from 'fast-glob';
import { dasherize, joinConfigurationPath, toConfigurationPathSegments } from '../typescript/configuration-path.mts';
import type { AliasProvider, PathAliasMap, SourceRoots } from './alias-provider.mts';

// Frontend code one module ships to several applications lives in its Shared layer, beside Yves and Zed.
// Project directories first, core last: the first existing file wins, so a project file shadows the core one.
const SHARED_ALIAS_PREFIX = '@shared/';
const SHARED_LAYER_DIRECTORY_NAME = 'Shared';
const SHARED_THEME_SUFFIX = 'Theme/default';
const TYPESCRIPT_SOURCE_PATTERN = '**/*.ts';
const MODULE_SHARED_THEME_DIRECTORY_PATTERN = `*/src/*/${SHARED_LAYER_DIRECTORY_NAME}/*/${SHARED_THEME_SUFFIX}`;
const LAYER_SHARED_THEME_DIRECTORY_PATTERN = `${SHARED_LAYER_DIRECTORY_NAME}/*/${SHARED_THEME_SUFFIX}`;

export interface SharedThemeAliasOptions {
    /** The application layer the builder compiles, `Zed` or `Yves`. */
    applicationLayerDirectoryName: string;
    /** Whether a root that does not end in that layer is searched in the flat `Shared/<Module>` shape as well. */
    searchesFlatSharedLayerOfNamespaceRoots: boolean;
}

const isApplicationLayerRoot = (sourceRoot: string, options: SharedThemeAliasOptions): boolean =>
    toConfigurationPathSegments(sourceRoot).at(-1) === options.applicationLayerDirectoryName;

// A root that already ends in the application layer, as a project's `src/Pyz/Zed` or `src/Pyz/Yves` does,
// keeps its Shared layer in the sibling directory.
const toSiblingSharedDirectory = (applicationLayerRoot: string): string =>
    joinConfigurationPath(
        ...toConfigurationPathSegments(applicationLayerRoot).slice(0, -1),
        SHARED_LAYER_DIRECTORY_NAME,
    );

// A namespace root such as `src/Pyz` holds both the per-module shape and the flat `Shared/<Module>` one.
const buildSharedThemeDirectoryPatterns = (sourceRoot: string, options: SharedThemeAliasOptions): string[] => {
    if (isApplicationLayerRoot(sourceRoot, options)) {
        return [joinConfigurationPath(toSiblingSharedDirectory(sourceRoot), '*', SHARED_THEME_SUFFIX)];
    }

    const modulePattern = joinConfigurationPath(sourceRoot, MODULE_SHARED_THEME_DIRECTORY_PATTERN);

    return options.searchesFlatSharedLayerOfNamespaceRoots
        ? [modulePattern, joinConfigurationPath(sourceRoot, LAYER_SHARED_THEME_DIRECTORY_PATTERN)]
        : [modulePattern];
};

/**
 * Include globs for the TypeScript of the Shared themes one source root holds, built from the directory rule the
 * aliases use, so a generated tsconfig claims exactly the files its `@shared` aliases point at.
 */
export const buildSharedThemeSourcePatterns = (sourceRoot: string, options: SharedThemeAliasOptions): string[] =>
    buildSharedThemeDirectoryPatterns(sourceRoot, options).map((directoryPattern) =>
        joinConfigurationPath(directoryPattern, TYPESCRIPT_SOURCE_PATTERN),
    );

const findSharedThemeDirectories = async (
    context: string,
    sourceRoot: string,
    options: SharedThemeAliasOptions,
): Promise<string[]> =>
    (
        await glob(buildSharedThemeDirectoryPatterns(sourceRoot, options), {
            cwd: context,
            onlyDirectories: true,
            onlyFiles: false,
            unique: true,
            followSymbolicLinks: false,
        })
    ).sort();

// `…/<Module>/Theme/default`: the module is the segment above `Theme`.
const getSharedThemeModuleName = (sharedThemeDirectory: string): string =>
    toConfigurationPathSegments(sharedThemeDirectory).slice(-3)[0];

// Two core directories for one module leave `@shared` without a single fallback, so neither may win silently.
const assertSingleCoreSharedThemeDirectory = (
    context: string,
    moduleName: string,
    coreDirectory: string,
    otherCoreDirectory: string,
): void => {
    if (coreDirectory === otherCoreDirectory) {
        return;
    }

    throw new Error(
        `The Shared theme of module "${moduleName}" exists in two core source roots: ` +
            `${join(context, coreDirectory)} and ${join(context, otherCoreDirectory)}.\n` +
            `"${SHARED_ALIAS_PREFIX}${dasherize(moduleName)}/*" must fall back to exactly one core directory, ` +
            `and choosing one would hide the other's files.\n` +
            `Remove the module from one of the core namespaces, or, if one of them is the project's own code, ` +
            `register its namespace in KernelConstants::PROJECT_NAMESPACES so it shadows the core module.\n`,
    );
};

const toAliasTarget = (sharedThemeDirectory: string): string => `./${joinConfigurationPath(sharedThemeDirectory, '*')}`;

/**
 * Every module that ships a Shared theme gets its alias, imported or not: the `@shared` prefix cannot shadow a
 * package name or a partial. Project directories follow the backend namespace order, as the twig loader does, so
 * both resolve the same file.
 */
export const createSharedThemeAliasProvider = (options: SharedThemeAliasOptions): AliasProvider => ({
    name: 'shared-theme',

    async collect({ context, core, project }: SourceRoots): Promise<PathAliasMap> {
        const coreDirectoryByModule = new Map<string, string>();
        const projectDirectoriesByModule = new Map<string, string[]>();

        for (const sourceRoot of core) {
            for (const sharedThemeDirectory of await findSharedThemeDirectories(context, sourceRoot, options)) {
                const moduleName = getSharedThemeModuleName(sharedThemeDirectory);
                const coreDirectory = coreDirectoryByModule.get(moduleName);

                if (coreDirectory !== undefined) {
                    assertSingleCoreSharedThemeDirectory(context, moduleName, coreDirectory, sharedThemeDirectory);
                }

                coreDirectoryByModule.set(moduleName, sharedThemeDirectory);
            }
        }

        for (const sourceRoot of project) {
            for (const sharedThemeDirectory of await findSharedThemeDirectories(context, sourceRoot, options)) {
                const moduleName = getSharedThemeModuleName(sharedThemeDirectory);
                const projectDirectories = projectDirectoriesByModule.get(moduleName) ?? [];

                if (!projectDirectories.includes(sharedThemeDirectory)) {
                    projectDirectoriesByModule.set(moduleName, [...projectDirectories, sharedThemeDirectory]);
                }
            }
        }

        const aliases: PathAliasMap = {};

        for (const moduleName of new Set([...projectDirectoriesByModule.keys(), ...coreDirectoryByModule.keys()])) {
            const aliasModuleName = dasherize(moduleName);
            const coreDirectory = coreDirectoryByModule.get(moduleName);
            const coreDirectories = coreDirectory === undefined ? [] : [coreDirectory];

            aliases[`${SHARED_ALIAS_PREFIX}${aliasModuleName}/*`] = [
                ...(projectDirectoriesByModule.get(moduleName) ?? []),
                ...coreDirectories,
            ].map(toAliasTarget);
        }

        return aliases;
    },

    ownsAliasName: (aliasName: string): boolean => aliasName.startsWith(SHARED_ALIAS_PREFIX),
});
