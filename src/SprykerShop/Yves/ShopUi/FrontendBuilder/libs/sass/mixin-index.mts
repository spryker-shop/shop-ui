import { readFile } from 'node:fs/promises';

export interface MixinIndex {
    resolveDependencies: (content: string, filePath: string) => string[];
    getFingerprint: () => string;
}

// Maps every top-level `@mixin` name in the component style tree to the file defining it, so the
// Sass injection importer can inject `@use '<owner>' as *;` for cross-component mixin references.
// Watch-mode limitation (v1): the index and its injection edge map live for one compilation
// session — mixin additions/renames and `@include` removals during watch take effect only after
// a watch restart.

const TOP_LEVEL_MIXIN_PATTERN = /^@mixin\s+([\w-]+)/gm;
const ANY_MIXIN_PATTERN = /@mixin\s+([\w-]+)/g;
const INCLUDE_PATTERN = /@include\s+([\w.-]+)/g;

// Removes `//` and `/* */` comments while preserving string literals and newlines, so the
// line-start anchor of the top-level-mixin pattern keeps working on the stripped source.
const stripComments = (source: string): string => {
    let stripped = '';
    let index = 0;

    while (index < source.length) {
        const character = source[index];
        const nextCharacter = source[index + 1];

        if (character === '/' && nextCharacter === '/') {
            while (index < source.length && source[index] !== '\n') {
                index += 1;
            }

            continue;
        }

        if (character === '/' && nextCharacter === '*') {
            index += 2;

            while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
                if (source[index] === '\n') {
                    stripped += '\n';
                }

                index += 1;
            }

            index += 2;
            continue;
        }

        if (character === "'" || character === '"') {
            const quote = character;
            stripped += character;
            index += 1;

            while (index < source.length && source[index] !== quote) {
                if (source[index] === '\\') {
                    stripped += source[index];
                    index += 1;
                }

                if (index < source.length) {
                    stripped += source[index];
                    index += 1;
                }
            }

            if (index < source.length) {
                stripped += source[index];
                index += 1;
            }

            continue;
        }

        stripped += character;
        index += 1;
    }

    return stripped;
};

const extractTopLevelMixinNames = (strippedSource: string): string[] =>
    [...strippedSource.matchAll(TOP_LEVEL_MIXIN_PATTERN)].map(([, mixinName]) => mixinName);

const levenshteinDistance = (firstWord: string, secondWord: string): number => {
    const distances: number[][] = Array.from({ length: firstWord.length + 1 }, (unusedRow, rowIndex) => {
        const row = new Array<number>(secondWord.length + 1).fill(0);
        row[0] = rowIndex;

        return row;
    });

    for (let columnIndex = 1; columnIndex <= secondWord.length; columnIndex += 1) {
        distances[0][columnIndex] = columnIndex;
    }

    for (let rowIndex = 1; rowIndex <= firstWord.length; rowIndex += 1) {
        for (let columnIndex = 1; columnIndex <= secondWord.length; columnIndex += 1) {
            const substitutionCost = firstWord[rowIndex - 1] === secondWord[columnIndex - 1] ? 0 : 1;
            distances[rowIndex][columnIndex] = Math.min(
                distances[rowIndex - 1][columnIndex] + 1,
                distances[rowIndex][columnIndex - 1] + 1,
                distances[rowIndex - 1][columnIndex - 1] + substitutionCost,
            );
        }
    }

    return distances[firstWord.length][secondWord.length];
};

const findClosestMixinNames = (unknownName: string, knownNames: Iterable<string>, limit = 3): string[] =>
    [...knownNames]
        .map((knownName) => ({ knownName, distance: levenshteinDistance(unknownName, knownName) }))
        .sort((firstEntry, secondEntry) => firstEntry.distance - secondEntry.distance)
        .slice(0, limit)
        .map((entry) => entry.knownName);

/**
 * Builds the mixin dependency index. `componentStyleFilePaths` must arrive in finder directory
 * order: on duplicate mixin names the later file wins, mirroring the legacy "last @import wins"
 * precedence. That order is `core, sprykerCore, eco, features, project` (project last) — so a
 * project mixin overrides a same-named feature mixin. This is a deliberate divergence from
 * master's legacy builder, whose dir order was core, sprykerCore, eco, project, features
 * (features last), which gave a feature module priority over a same-named project mixin —
 * semantics nobody intended. This is inert for CSS output today (zero duplicate mixin names
 * across the scanned set, `__tests__/**` excluded) but is the contract; see the `sources` note
 * in settings.mts. `sharedStyleFilePaths` (the `Theme/*\/styles/**` graph) forms
 * the exclusion set — those mixins are provided by the injected shared module (layer 1).
 */
export const createMixinIndex = async ({
    componentStyleFilePaths,
    sharedStyleFilePaths,
    isInjectionDebuggingEnabled = false,
}: {
    componentStyleFilePaths: string[];
    sharedStyleFilePaths: string[];
    isInjectionDebuggingEnabled?: boolean;
}): Promise<MixinIndex> => {
    const mixinNamesForFile = async (filePath: string): Promise<string[]> =>
        extractTopLevelMixinNames(stripComments(await readFile(filePath, 'utf8')));

    const componentMixinNameLists = await Promise.all(componentStyleFilePaths.map(mixinNamesForFile));
    const sharedMixinNameLists = await Promise.all(sharedStyleFilePaths.map(mixinNamesForFile));

    const mixinOwnerByName = new Map<string, string>();
    componentStyleFilePaths.forEach((filePath, fileIndex) => {
        for (const mixinName of componentMixinNameLists[fileIndex]) {
            mixinOwnerByName.set(mixinName, filePath);
        }
    });

    const sharedMixinNames = new Set(sharedMixinNameLists.flat());

    const fingerprint = JSON.stringify({
        mixinOwners: [...mixinOwnerByName.entries()].sort(([firstName], [secondName]) =>
            firstName.localeCompare(secondName),
        ),
        sharedMixinNames: [...sharedMixinNames].sort(),
    });

    const logInjectionDebug = (message: string): void => {
        if (isInjectionDebuggingEnabled) {
            console.log(`[debug-injection] ${message}`);
        }
    };

    // filePath -> Set of owner files whose `@use` this index caused to be injected. Grown lazily
    // as files resolve; a cycle in it means the injected `@use` statements cannot compile, and
    // failing here yields a readable chain instead of a compiler "module loop" error.
    const injectionEdges = new Map<string, Set<string>>();

    const findInjectionPath = (
        startFilePath: string,
        targetFilePath: string,
        visitedFilePaths = new Set<string>(),
    ): string[] | null => {
        if (startFilePath === targetFilePath) {
            return [startFilePath];
        }

        visitedFilePaths.add(startFilePath);

        for (const nextFilePath of injectionEdges.get(startFilePath) ?? []) {
            if (visitedFilePaths.has(nextFilePath)) {
                continue;
            }

            const pathFromNext = findInjectionPath(nextFilePath, targetFilePath, visitedFilePaths);

            if (pathFromNext) {
                return [startFilePath, ...pathFromNext];
            }
        }

        return null;
    };

    const registerInjectionEdge = (filePath: string, ownerFilePath: string): void => {
        const edgeTargets = injectionEdges.get(filePath) ?? new Set();
        injectionEdges.set(filePath, edgeTargets);
        edgeTargets.add(ownerFilePath);

        const cyclePath = findInjectionPath(ownerFilePath, filePath);

        if (cyclePath) {
            throw new Error(
                `Mixin injection dependency cycle: ${[filePath, ...cyclePath].join(' → ')}. Each file in the ` +
                    `chain @includes a mixin owned by the next one, so the injected @use statements form a loop ` +
                    `Sass cannot compile. Move the shared mixin into the ShopUi Theme styles (the shared graph) ` +
                    `or into a component none of these files depends on. If you recently removed an @include ` +
                    `while watch was running, restart the watch — the dependency edge map is rebuilt on start.`,
            );
        }
    };

    const resolveDependencies = (content: string, filePath: string): string[] => {
        const strippedContent = stripComments(content);
        const locallyDefinedNames = new Set([...strippedContent.matchAll(ANY_MIXIN_PATTERN)].map(([, name]) => name));
        const ownerFilePaths: string[] = [];

        for (const [, includedName] of strippedContent.matchAll(INCLUDE_PATTERN)) {
            // Dot-separated names are module members (`map.get`-style namespaces or Sass
            // built-ins) — they resolve through their `@use` statement, never through the index.
            if (includedName.includes('.')) {
                continue;
            }

            if (locallyDefinedNames.has(includedName)) {
                logInjectionDebug(`mixin "${includedName}" in ${filePath} → defined locally`);
                continue;
            }

            if (sharedMixinNames.has(includedName)) {
                logInjectionDebug(`mixin "${includedName}" in ${filePath} → provided by shared styles (layer 1)`);
                continue;
            }

            const ownerFilePath = mixinOwnerByName.get(includedName);

            if (!ownerFilePath) {
                // A `-base-hook` include is the optional customer-extension slot: the component
                // wraps it in `@if meta.mixin-exists(<mixin>-base-hook)`, so an unresolved hook is
                // the normal case — no project defined it, and it simply contributes nothing.
                // Skipping here (instead of throwing) lets the guarded include compile away to zero
                // output. A hook a project DOES define owns an index entry and is resolved by the
                // owner branch below like any other mixin, discovered via project-last precedence.
                if (includedName.endsWith('-base-hook')) {
                    logInjectionDebug(
                        `optional base-hook "${includedName}" in ${filePath} → no owner defined; skipped ` +
                            `(the component guards it with @if meta.mixin-exists, so it contributes nothing)`,
                    );
                    continue;
                }

                const candidates = findClosestMixinNames(includedName, [
                    ...mixinOwnerByName.keys(),
                    ...sharedMixinNames,
                ]);
                const candidateSummary = candidates.length
                    ? `Closest matches: ${candidates.join(', ')}.`
                    : 'The index is empty — check the component style source directories.';

                throw new Error(
                    `Unknown mixin "${includedName}" referenced in ${filePath}. It is not defined locally, not ` +
                        `provided by the shared styles, and not found in the mixin index. ${candidateSummary} ` +
                        `Check the mixin name or run the build with --debug-injection.`,
                );
            }

            if (ownerFilePath === filePath) {
                continue;
            }

            registerInjectionEdge(filePath, ownerFilePath);
            logInjectionDebug(`mixin "${includedName}" in ${filePath} → ${ownerFilePath}`);

            if (!ownerFilePaths.includes(ownerFilePath)) {
                ownerFilePaths.push(ownerFilePath);
            }
        }

        return ownerFilePaths;
    };

    return {
        resolveDependencies,
        getFingerprint: () => fingerprint,
    };
};
