import { statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

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

// Applies the Sass filesystem conventions to a request that may omit the extension or the
// partial underscore: `x` matches `x.scss`/`_x.scss`, and a directory matches its `index.scss`.
export const resolveWithSassConventions = (requestedPath: string, requestingFilePath: string | null): string | null => {
    const directory = dirname(requestedPath);
    const name = basename(requestedPath);

    if (/\.(?:scss|sass|css)$/i.test(name)) {
        const candidates = name.startsWith('_') ? [requestedPath] : [requestedPath, join(directory, `_${name}`)];

        return pickUnambiguousExistingFile(candidates, requestedPath, requestingFilePath);
    }

    const fileCandidates = name.startsWith('_')
        ? [join(directory, `${name}.scss`)]
        : [join(directory, `${name}.scss`), join(directory, `_${name}.scss`)];
    const fileMatch = pickUnambiguousExistingFile(fileCandidates, requestedPath, requestingFilePath);

    if (fileMatch) {
        return fileMatch;
    }

    return pickUnambiguousExistingFile(
        [join(requestedPath, 'index.scss'), join(requestedPath, '_index.scss')],
        requestedPath,
        requestingFilePath,
    );
};

/**
 * Resolves a Sass load request the way the builder's importer does: the legacy webpack tilde prefix
 * is accepted, aliases win over relative resolution (longest alias first, so an alias that prefixes
 * another cannot shadow it), and `sass:` built-ins resolve to nothing on the filesystem.
 */
export const resolveLoadRequest = (
    request: string,
    requestingFilePath: string,
    aliasList: Record<string, string>,
): string | null => {
    const bareRequest = request.startsWith('~') ? request.slice(1) : request;

    if (bareRequest.startsWith('sass:')) {
        return null;
    }

    const aliasNames = Object.keys(aliasList).sort((nameA, nameB) => nameB.length - nameA.length);

    for (const aliasName of aliasNames) {
        if (bareRequest === aliasName || bareRequest.startsWith(`${aliasName}/`)) {
            return resolveWithSassConventions(
                join(aliasList[aliasName], bareRequest.slice(aliasName.length)),
                requestingFilePath,
            );
        }
    }

    return resolveWithSassConventions(join(dirname(requestingFilePath), bareRequest), requestingFilePath);
};
