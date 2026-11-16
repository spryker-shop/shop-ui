// Duplicated on purpose: the Gui, ShopUi and ZedUi FrontendBuilders each carry this file until they share a package.
import { isAbsolute } from 'node:path';
import { glob as tinyGlob, globSync as tinyGlobSync, isDynamicPattern } from 'tinyglobby';
import type { GlobOptions } from 'tinyglobby';

export type { GlobOptions };

const PATH_SEPARATOR = '/';

// The directories of a pattern before its first wildcard: `/a/b/*/c` gives `/a/b`, a static `/a/b/c` gives `/a/b`.
const toStaticBaseSegments = (pattern: string): string[] => {
    const segments = pattern.split(PATH_SEPARATOR);
    const firstDynamicSegmentIndex = segments.findIndex((segment) => isDynamicPattern(segment));

    return firstDynamicSegmentIndex === -1 ? segments.slice(0, -1) : segments.slice(0, firstDynamicSegmentIndex);
};

const findCommonStaticBase = (patterns: string[]): string => {
    const [firstSegments, ...otherSegmentLists] = patterns.map(toStaticBaseSegments);
    const firstDifferentIndex = firstSegments.findIndex((segment, index) =>
        otherSegmentLists.some((segments) => segments[index] !== segment),
    );
    const commonSegments = firstDifferentIndex === -1 ? firstSegments : firstSegments.slice(0, firstDifferentIndex);

    return commonSegments.join(PATH_SEPARATOR) || PATH_SEPARATOR;
};

const toTinyGlobOptions = (patterns: string[], options: GlobOptions): GlobOptions => {
    // tinyglobby reads a pattern that names a directory as everything below it; the builders mean the path itself.
    const tinyGlobOptions: GlobOptions = { ...options, expandDirectories: false };

    // Without a `cwd`, tinyglobby crawls an absolute pattern from the common ancestor of the pattern and the process
    // directory. With `followSymbolicLinks: false` the crawl then stops at any symlinked directory on the way, such
    // as `/var` → `/private/var` on macOS, and finds nothing. The pattern's own static base avoids that walk.
    // Absolute patterns return absolute paths.
    if (options.cwd === undefined && patterns.length > 0 && patterns.every((pattern) => isAbsolute(pattern))) {
        return { ...tinyGlobOptions, cwd: findCommonStaticBase(patterns), absolute: true };
    }

    return tinyGlobOptions;
};

// tinyglobby marks a directory with a trailing slash; the builders compare and join paths without one.
const removeDirectoryMarkers = (paths: string[]): string[] =>
    paths.map((path) => (path.length > 1 && path.endsWith(PATH_SEPARATOR) ? path.slice(0, -1) : path));

const toPatternList = (patterns: string | string[]): string[] => (Array.isArray(patterns) ? patterns : [patterns]);

/**
 * Finds the paths that match the patterns. A `!`-prefixed pattern excludes, as `ignore` does.
 * The result is unique but not sorted: sort it where the order matters.
 */
export const glob = async (patterns: string | string[], options: GlobOptions = {}): Promise<string[]> => {
    const patternList = toPatternList(patterns);

    return removeDirectoryMarkers(await tinyGlob(patternList, toTinyGlobOptions(patternList, options)));
};

/** The synchronous variant of {@link glob}. */
export const globSync = (patterns: string | string[], options: GlobOptions = {}): string[] => {
    const patternList = toPatternList(patterns);

    return removeDirectoryMarkers(tinyGlobSync(patternList, toTinyGlobOptions(patternList, options)));
};
