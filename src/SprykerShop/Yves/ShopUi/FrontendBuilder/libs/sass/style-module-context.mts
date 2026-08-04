import { readFileSync } from 'node:fs';
import { resolveLoadRequest } from './sass-path-resolution.mts';

const LOAD_REQUEST_PATTERN = /@(?:use|forward|import)\s+(['"])([^'"]+)\1/g;
const OWN_USE_PATTERN = /@use\s+['"]/;

const readFileOrEmpty = (filePath: string): string => {
    try {
        return readFileSync(filePath, 'utf8');
    } catch {
        return '';
    }
};

/**
 * Walks every `@use`/`@forward`/`@import` request reachable from the shared stylesheets, so callers
 * can tell whether a file is part of shared itself. Nothing inside that closure may load shared —
 * that would make shared load through itself.
 */
export const collectSharedClosure = (sharedRootPaths: string[], aliasList: Record<string, string>): Set<string> => {
    const closure = new Set<string>();
    const pending = sharedRootPaths.filter((filePath) => filePath.length > 0);

    while (pending.length) {
        const filePath = pending.pop()!;

        if (closure.has(filePath)) {
            continue;
        }

        closure.add(filePath);

        for (const match of readFileOrEmpty(filePath).matchAll(LOAD_REQUEST_PATTERN)) {
            const resolvedPath = resolveLoadRequest(match[2], filePath, aliasList);

            if (resolvedPath && !closure.has(resolvedPath)) {
                pending.push(resolvedPath);
            }
        }
    }

    return closure;
};

/**
 * Decides whether a file from the style graph needs the shared banner injected.
 *
 * A Sass file declaring its own `@use` is compiled as its own module, and members the style root
 * loaded with `@use … as *` do not reach it — unlike members the root pulled in with `@import`,
 * which become real members of the root's module. Such a file therefore needs shared loaded into it
 * directly, or every `$setting-*`/`helper-*` reference in it fails with a bare "Undefined variable".
 *
 * Two kinds of files are deliberately left alone:
 *   - files without their own `@use`, which do inherit the root's context — injecting would turn
 *     them into modules and cut them off from the members the root supplies through `@import`;
 *   - files already wired into the shared graph (shared itself, anything it loads, and anything that
 *     loads a piece of it), where a second path to the same members would either be a module loop or
 *     an ambiguous-member conflict.
 */
export const createStyleFileInjectionDecider = ({
    sharedRootPaths,
    aliasList,
}: {
    sharedRootPaths: string[];
    aliasList: Record<string, string>;
}): ((filePath: string, content: string) => boolean) => {
    const sharedClosure = collectSharedClosure(sharedRootPaths, aliasList);

    return (filePath: string, content: string): boolean => {
        if (sharedClosure.has(filePath) || !OWN_USE_PATTERN.test(content)) {
            return false;
        }

        return ![...content.matchAll(LOAD_REQUEST_PATTERN)].some((match) => {
            const resolvedPath = resolveLoadRequest(match[2], filePath, aliasList);

            return resolvedPath !== null && sharedClosure.has(resolvedPath);
        });
    };
};
