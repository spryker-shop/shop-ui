import { statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { AliasList } from '../webpack/alias.mts';

export const isExistingFile = (filePath: string): boolean =>
    statSync(filePath, { throwIfNoEntry: false })?.isFile() ?? false;

const pickUnambiguousExistingFile = (
    candidatePaths: string[],
    requestedPath: string,
    requestingFilePath: string | null,
): string | null => {
    const existingFiles = [...new Set(candidatePaths)].filter(isExistingFile);

    if (existingFiles.length > 1) {
        throw new Error(
            `Ambiguous Sass request "${requestedPath}" from ${requestingFilePath ?? 'the compilation entry point'}: ` +
                `${existingFiles.join(' and ')} both exist, and Sass forbids choosing between a partial and a ` +
                `non-partial of the same name. Rename or delete one of these files.`,
        );
    }

    return existingFiles[0] ?? null;
};

const SASS_FILE_EXTENSION_PATTERN = /\.(?:scss|sass|css)$/i;

// `x` matches `x.scss`/`_x.scss`; a request that names its extension matches itself and its partial.
const buildFileCandidatePaths = (requestedPath: string): string[] => {
    const directory = dirname(requestedPath);
    const name = basename(requestedPath);

    if (SASS_FILE_EXTENSION_PATTERN.test(name)) {
        return name.startsWith('_') ? [requestedPath] : [requestedPath, join(directory, `_${name}`)];
    }

    return name.startsWith('_')
        ? [join(directory, `${name}.scss`)]
        : [join(directory, `${name}.scss`), join(directory, `_${name}.scss`)];
};

// Only an extensionless request may name a directory.
const buildIndexCandidatePaths = (requestedPath: string): string[] =>
    SASS_FILE_EXTENSION_PATTERN.test(basename(requestedPath))
        ? []
        : [join(requestedPath, 'index.scss'), join(requestedPath, '_index.scss')];

// Applies the Sass filesystem conventions to a request that may omit the extension or the
// partial underscore: `x` matches `x.scss`/`_x.scss`, and a directory matches its `index.scss`.
export const resolveWithSassConventions = (requestedPath: string, requestingFilePath: string | null): string | null =>
    pickUnambiguousExistingFile(buildFileCandidatePaths(requestedPath), requestedPath, requestingFilePath) ??
    pickUnambiguousExistingFile(buildIndexCandidatePaths(requestedPath), requestedPath, requestingFilePath);

// webpack tries the targets of an alias in order and takes the first that resolves; a Sass load through
// the same alias has to land on the same file, or a project file would shadow the core one in scripts only.
// Every candidate a missed target offered is reported: creating one of them later changes the result,
// so a persistent cache has to treat each as a dependency that does not exist yet.
export const resolveThroughAliasTargets = (
    aliasTarget: AliasList[string],
    pathBelowAlias: string,
    requestingFilePath: string | null,
    onCandidateMissing: (candidatePath: string) => void = () => undefined,
): string | null => {
    for (const targetPath of [aliasTarget].flat()) {
        const requestedPath = join(targetPath, pathBelowAlias);
        const resolvedPath = resolveWithSassConventions(requestedPath, requestingFilePath);

        if (resolvedPath !== null) {
            return resolvedPath;
        }

        for (const candidatePath of [
            ...buildFileCandidatePaths(requestedPath),
            ...buildIndexCandidatePaths(requestedPath),
        ]) {
            onCandidateMissing(candidatePath);
        }
    }

    return null;
};

/**
 * Resolves a Sass load request the way the builder's importer does: the legacy webpack tilde prefix
 * is accepted, aliases win over relative resolution (longest alias first, so an alias that prefixes
 * another cannot shadow it), and `sass:` built-ins resolve to nothing on the filesystem.
 */
export const resolveLoadRequest = (
    request: string,
    requestingFilePath: string,
    aliasList: AliasList,
): string | null => {
    const bareRequest = request.startsWith('~') ? request.slice(1) : request;

    if (bareRequest.startsWith('sass:')) {
        return null;
    }

    const aliasNames = Object.keys(aliasList).sort((nameA, nameB) => nameB.length - nameA.length);

    for (const aliasName of aliasNames) {
        if (bareRequest === aliasName || bareRequest.startsWith(`${aliasName}/`)) {
            return resolveThroughAliasTargets(
                aliasList[aliasName],
                bareRequest.slice(aliasName.length),
                requestingFilePath,
            );
        }
    }

    return resolveWithSassConventions(join(dirname(requestingFilePath), bareRequest), requestingFilePath);
};
