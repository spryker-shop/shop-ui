import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from '@jest/globals';

// This suite guards the base-hook contract against the REAL repository source (not fixtures):
// every `@content`-bearing component mixin under SprykerShop and SprykerFeature must carry exactly
// one guarded `-base-hook` opt-in, its file must declare a file-local `@use 'sass:meta'`, and no
// first-party file may define a `-base-hook` mixin (that suffix is reserved for customer overrides).

interface MixinRecord {
    filePath: string;
    mixinName: string;
}

const componentPathFragment = `${sep}Theme${sep}default${sep}components${sep}`;

function resolveRepositoryRoot(startDirectory: string): string {
    let directory = startDirectory;
    while (true) {
        if (existsSync(join(directory, 'src', 'SprykerShop')) && existsSync(join(directory, 'src', 'SprykerFeature'))) {
            return directory;
        }
        const parent = dirname(directory);
        if (parent === directory) {
            throw new Error(
                `Could not locate the repository root above ${startDirectory}. ` +
                    `No ancestor directory contains both src/SprykerShop and src/SprykerFeature. ` +
                    `Run this test from within the suite checkout so the base-hook source scan can find its targets.`,
            );
        }
        directory = parent;
    }
}

function collectScssFilesRecursively(directory: string, collected: string[]): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') {
            continue;
        }
        const fullPath = join(directory, entry.name);
        if (entry.isDirectory()) {
            collectScssFilesRecursively(fullPath, collected);
        } else if (entry.isFile() && entry.name.endsWith('.scss')) {
            collected.push(fullPath);
        }
    }
}

function collectComponentStyleFiles(repositoryRoot: string): string[] {
    const searchRoots = [join(repositoryRoot, 'src', 'SprykerShop'), join(repositoryRoot, 'src', 'SprykerFeature')];
    const files: string[] = [];
    for (const searchRoot of searchRoots) {
        collectScssFilesRecursively(searchRoot, files);
    }
    return files.filter((filePath) => filePath.includes(componentPathFragment)).sort();
}

function skipString(source: string, index: number): number {
    const quote = source[index];
    let i = index + 1;
    while (i < source.length) {
        if (source[i] === '\\') {
            i += 2;
            continue;
        }
        if (source[i] === quote) {
            return i + 1;
        }
        i += 1;
    }
    return i;
}

function skipLineComment(source: string, index: number): number {
    const newline = source.indexOf('\n', index);
    return newline < 0 ? source.length : newline;
}

function skipBlockComment(source: string, index: number): number {
    const end = source.indexOf('*/', index + 2);
    return end < 0 ? source.length : end + 2;
}

// Returns the index of the brace matching the block/interpolation opener at openIndex, honouring
// strings and comments so that braces inside them are never miscounted.
function matchBrace(source: string, openIndex: number): number {
    let depth = 0;
    let i = openIndex;
    while (i < source.length) {
        const character = source[i];
        if (character === '"' || character === "'") {
            i = skipString(source, i);
            continue;
        }
        if (character === '/' && source[i + 1] === '/') {
            i = skipLineComment(source, i);
            continue;
        }
        if (character === '/' && source[i + 1] === '*') {
            i = skipBlockComment(source, i);
            continue;
        }
        if (character === '{') {
            depth += 1;
        } else if (character === '}') {
            depth -= 1;
            if (depth === 0) {
                return i;
            }
        }
        i += 1;
    }
    return -1;
}

// Finds the first real block-opening brace at or after start. Interpolation openers (`#{`) are
// skipped whole so a selector like `&--#{$action}` is never mistaken for a block.
function findBlockOpen(source: string, start: number): number {
    let i = start;
    while (i < source.length) {
        const character = source[i];
        if (character === '"' || character === "'") {
            i = skipString(source, i);
            continue;
        }
        if (character === '/' && source[i + 1] === '/') {
            i = skipLineComment(source, i);
            continue;
        }
        if (character === '/' && source[i + 1] === '*') {
            i = skipBlockComment(source, i);
            continue;
        }
        if (character === '{') {
            if (i > 0 && source[i - 1] === '#') {
                i = matchBrace(source, i) + 1;
                continue;
            }
            return i;
        }
        i += 1;
    }
    return -1;
}

const mixinDefinitionPattern = /@mixin\s+([A-Za-z0-9_-]+)/g;
const contentDirectivePattern = /@content\b/;

function collectContentMixinNames(source: string): string[] {
    const names: string[] = [];
    for (const match of source.matchAll(mixinDefinitionPattern)) {
        const openIndex = findBlockOpen(source, (match.index ?? 0) + match[0].length);
        if (openIndex < 0) {
            continue;
        }
        const closeIndex = matchBrace(source, openIndex);
        if (closeIndex < 0) {
            continue;
        }
        const body = source.slice(openIndex, closeIndex + 1);
        if (contentDirectivePattern.test(body)) {
            names.push(match[1]);
        }
    }
    return names;
}

function collectHookDefinitionNames(source: string): string[] {
    const names: string[] = [];
    for (const match of source.matchAll(mixinDefinitionPattern)) {
        if (match[1].endsWith('-base-hook')) {
            names.push(match[1]);
        }
    }
    return names;
}

function occurrenceCount(source: string, needle: string): number {
    return source.split(needle).length - 1;
}

const repositoryRoot = resolveRepositoryRoot(dirname(fileURLToPath(import.meta.url)));
const componentStyleFiles = collectComponentStyleFiles(repositoryRoot);

const contentMixins: MixinRecord[] = [];
const filesWithContentMixin = new Set<string>();
const hookDefinitions: MixinRecord[] = [];
const fileSources = new Map<string, string>();

for (const filePath of componentStyleFiles) {
    const source = readFileSync(filePath, 'utf8');
    fileSources.set(filePath, source);
    for (const mixinName of collectContentMixinNames(source)) {
        contentMixins.push({ filePath, mixinName });
        filesWithContentMixin.add(filePath);
    }
    for (const hookName of collectHookDefinitionNames(source)) {
        hookDefinitions.push({ filePath, mixinName: hookName });
    }
}

function toRepositoryRelative(filePath: string): string {
    return filePath.slice(repositoryRoot.length + 1);
}

// If the scan finds zero @content-bearing component mixins, the three conformance tests below would
// each iterate over an empty set and pass vacuously, silently green-washing a broken glob. Fail
// loudly at setup so the real tests can never run against an empty scan.
if (contentMixins.length === 0) {
    const scannedRoots = [
        join(repositoryRoot, 'src', 'SprykerShop'),
        join(repositoryRoot, 'src', 'SprykerFeature'),
    ].join(', ');
    throw new Error(
        `The base-hook conformance scan under ${scannedRoots} found no @content-bearing mixins — ` +
            `the glob no longer matches the repository layout. ` +
            `Verify the FrontendBuilder location and the Theme/default/components path conventions.`,
    );
}

describe('base-hook conformance across component source', () => {
    it('guards every @content-bearing component mixin with exactly one matching base-hook opt-in', () => {
        const violations: string[] = [];
        for (const { filePath, mixinName } of contentMixins) {
            const source = fileSources.get(filePath) ?? '';
            // Compare against a whitespace-stripped copy so a guard prettier wrapped across lines
            // (the longest mixin names overflow the 120-column limit) still counts as one match.
            const compactSource = source.replace(/\s+/g, '');
            const guardCount = occurrenceCount(compactSource, `meta.mixin-exists(${mixinName}-base-hook)`);
            const includeCount = occurrenceCount(compactSource, `@include${mixinName}-base-hook;`);
            if (guardCount !== 1 || includeCount !== 1) {
                violations.push(
                    `${toRepositoryRelative(filePath)}: mixin "${mixinName}" has ${guardCount} ` +
                        `meta.mixin-exists(${mixinName}-base-hook) guard(s) and ${includeCount} ` +
                        `@include ${mixinName}-base-hook; statement(s), expected exactly one of each.`,
                );
            }
        }
        if (violations.length > 0) {
            throw new Error(
                `Base-hook guard contract violated. Each @content-bearing component mixin must contain exactly one ` +
                    `guarded "@if meta.mixin-exists(<name>-base-hook) { @include <name>-base-hook; }" block at its ` +
                    `base position. Add or de-duplicate the guard in:\n${violations.join('\n')}`,
            );
        }
        expect(violations).toEqual([]);
    });

    it("declares a file-local @use 'sass:meta' in every file that defines a guarded mixin", () => {
        const violations: string[] = [];
        for (const filePath of filesWithContentMixin) {
            const source = fileSources.get(filePath) ?? '';
            const header = source.split('@mixin')[0];
            if (!header.includes("@use 'sass:meta';")) {
                violations.push(toRepositoryRelative(filePath));
            }
        }
        violations.sort();
        if (violations.length > 0) {
            throw new Error(
                `Missing file-local "@use 'sass:meta';". Every component file that guards a mixin with ` +
                    `meta.mixin-exists must import sass:meta at the top of its @use block. ` +
                    `Add "@use 'sass:meta';" to:\n${violations.join('\n')}`,
            );
        }
        expect(violations).toEqual([]);
    });

    it('never defines a *-base-hook mixin in first-party source (the suffix is reserved for customer hooks)', () => {
        const violations = hookDefinitions
            .map(({ filePath, mixinName }) => `${toRepositoryRelative(filePath)}: defines @mixin ${mixinName}`)
            .sort();
        if (violations.length > 0) {
            throw new Error(
                `First-party source must not define any "-base-hook" mixin — that suffix is reserved for customer ` +
                    `override hooks resolved optionally by the builder. Rename or remove the definition in:\n` +
                    `${violations.join('\n')}`,
            );
        }
        expect(violations).toEqual([]);
    });
});
