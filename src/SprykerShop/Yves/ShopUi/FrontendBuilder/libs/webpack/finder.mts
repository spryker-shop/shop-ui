import { dirname, basename } from 'node:path';
import glob from 'fast-glob';

export interface FindSettings {
    dirs: string[];
    patterns: string[];
    fallbackPatterns?: string[];
    globSettings?: Record<string, unknown>;
}

const defaultGlobSettings = {
    followSymlinkedDirectories: false,
    absolute: true,
    onlyFiles: true,
    onlyDirectories: false,
};

const globAsync = async (
    patterns: string | string[],
    rootConfiguration: Record<string, unknown>,
): Promise<string[] | undefined> => {
    try {
        const files = await glob(patterns, rootConfiguration);

        // fast-glob returns matches in the filesystem's readdir order, which is not stable across
        // machines or runs. Sort lexicographically so entry/style discovery is deterministic.
        return files.sort();
    } catch (error) {
        console.error('An error occurred while globbing the system for entry points.', error);
    }
};

const resolveDirs = async (globDirs: string[]): Promise<string[]> => {
    const sets = await Promise.all(
        globDirs.map(async (dir) => {
            const dirs = await glob(dir, { onlyDirectories: true, absolute: true, unique: true });

            // Sort within each per-pattern expansion so directory discovery is deterministic. The
            // concatenation below keeps the authored tier order across globDirs entries intact, so
            // a later dirs entry's directories still follow an earlier entry's (precedence rule).
            return dirs.sort();
        }),
    );

    // The assertion only types the empty seed array so concat produces string[] instead of never[].
    const all = ([] as string[]).concat(...sets);

    return Array.from(new Set(all));
};

const findFiles = (
    globDirs: string[],
    globPatterns: string[],
    globSettings: Record<string, unknown> | undefined,
): Promise<string[]> =>
    (async () => {
        const resolvedDirs = await resolveDirs(globDirs);

        return resolvedDirs.reduce<Promise<string[]>>(async (resultsPromise, dir) => {
            const rootConfiguration = {
                ...defaultGlobSettings,
                ...globSettings,
                cwd: dir,
            };

            const results = await resultsPromise;
            const globPath = await globAsync(globPatterns, rootConfiguration);

            // globAsync returns undefined only when fast-glob threw (already logged); concat keeps
            // the original behaviour of appending that value rather than short-circuiting.
            return results.concat(globPath as string[]);
        }, Promise.resolve<string[]>([]));
    })();

const find = async (
    globDirs: string[],
    globPatterns: string[],
    globFallbackPatterns: string[],
    globSettings: Record<string, unknown> = {},
): Promise<string[]> => {
    const customThemeFiles = await findFiles(globDirs, globPatterns, globSettings);
    const defaultThemeFiles = globFallbackPatterns.length
        ? await findFiles(globDirs, globFallbackPatterns, globSettings)
        : [];

    return defaultThemeFiles.concat(customThemeFiles);
};

const mergeEntryPoints = async (files: string[]): Promise<string[]> =>
    Object.values(
        files.reduce<Record<string, string>>((map, file) => {
            const dir = dirname(file);
            const name = basename(dir);
            const type = basename(dirname(dir));
            map[`${type}/${name}`] = file;

            return map;
        }, {}),
    );

const findEntryPoints = async (settings: FindSettings): Promise<string[]> => {
    const files = await find(settings.dirs, settings.patterns, settings.fallbackPatterns ?? [], settings.globSettings);

    return mergeEntryPoints(files);
};

export const findComponentEntryPoints = async (settings: FindSettings): Promise<string[]> => findEntryPoints(settings);

export const findComponentStyles = async (settings: FindSettings): Promise<string[]> =>
    find(settings.dirs, settings.patterns, [], settings.globSettings);

export const findAppEntryPoint = async (settings: FindSettings, file: string): Promise<string | undefined> => {
    const config: FindSettings = { ...settings };
    const updatePatterns = (patternCollection: string[]): string[] =>
        patternCollection.map((pattern) => `${pattern}/${file}`);

    config.patterns = updatePatterns(config.patterns);
    config.fallbackPatterns = updatePatterns(config.fallbackPatterns ?? []);

    const entryPoint = await findEntryPoints(config);

    return entryPoint[entryPoint.length - 1];
};
