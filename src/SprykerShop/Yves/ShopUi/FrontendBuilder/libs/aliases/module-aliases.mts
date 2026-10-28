import { readFileSync } from 'node:fs';
import glob from 'fast-glob';
import { isYvesLayerRoot } from '../../settings.mts';
import { joinConfigurationPath, toConfigurationPathSegments } from '../typescript/configuration-path.mts';
import type { AliasProvider, PathAliasMap, SourceRoots } from './alias-provider.mts';

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

const toAliasTarget = (themeDirectory: string): string => `./${joinConfigurationPath(themeDirectory, '*')}`;

/** `<Module>/*` for an imported core theme, `src/<Module>/*` for an imported project theme. */
export const moduleAliasProvider: AliasProvider = {
    name: 'module',

    async collect({ context, core, project }: SourceRoots): Promise<PathAliasMap> {
        // In a project the core themes live in vendor/, so every root but the project ones is searched;
        // a project theme of the same name must not take over the core module's alias.
        const coreThemeDirectories = await findThemeDirectories(context, core);
        const projectThemeDirectories = await findThemeDirectories(context, project);
        // Usages are collected from every source root: an eco module in vendor/ imports
        // TraceableEventWidget through its alias, and missing that would drop an alias the build needs.
        const aliasImportNames = await collectAliasImportNames(context, [...core, ...project]);
        const aliases: PathAliasMap = {};

        for (const themeDirectory of coreThemeDirectories) {
            const moduleName = getThemeModuleName(themeDirectory);

            if (aliasImportNames.core.has(moduleName)) {
                aliases[`${moduleName}/*`] = [toAliasTarget(themeDirectory)];
            }
        }

        for (const themeDirectory of projectThemeDirectories) {
            const moduleName = getThemeModuleName(themeDirectory);

            if (aliasImportNames.project.has(moduleName)) {
                aliases[`${PROJECT_THEME_ALIAS_PREFIX}${moduleName}/*`] = [toAliasTarget(themeDirectory)];
            }
        }

        return aliases;
    },

    // Named after whatever the themes import, so any wildcard alias may be one an earlier run emitted.
    ownsAliasName: (aliasName: string): boolean => aliasName.endsWith('/*'),
};
