import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';

// A line-start `@include` is the legacy self-emission convention: the file renders its own CSS the
// moment it is loaded. Indented includes live inside mixin bodies and emit nothing on load.
const TOP_LEVEL_INCLUDE_PATTERN = /^@include /m;
// Any relative style import satisfies the new-builder contract: `./style`, `./style.scss`, or a
// direct `./<name>.scss` import make the entry responsible for the component's CSS.
const STYLE_LOAD_IN_ENTRY_PATTERN = /import\s+(['"])\.\/(?:style(?:\.scss)?|[^'"]*\.scss)\1/;

const readFileOrEmpty = (filePath: string): string => {
    try {
        return readFileSync(filePath, 'utf8');
    } catch {
        return '';
    }
};

/**
 * Finds component styles written against the legacy builder contract ("the file exists, therefore
 * it is in the bundle") that the entry-driven builder would silently skip: the file emits CSS at its
 * top level, and its component declares no entry that loads styles. Modules shipped before the
 * builder migration still contain such components; compiling them keeps their CSS in the bundles
 * until the modules are updated.
 *
 * This reproduces the legacy behavior exactly, not more: the legacy builder force-imported every
 * component `<name>.scss` but never `style.scss` (excluded from its query), so `style.scss`
 * aggregators are deliberately not considered here. Mixin-only files are never rescued either —
 * they emit nothing on load and stay reachable through the mixin index.
 */
export const findLegacyOrphanStyles = ({
    componentStyleFilePaths,
    entryPointFilePaths,
}: {
    componentStyleFilePaths: string[];
    entryPointFilePaths: string[];
}): string[] => {
    const entryFileByDirectory = new Map<string, string>();
    entryPointFilePaths.forEach((entryFilePath) => entryFileByDirectory.set(dirname(entryFilePath), entryFilePath));

    const hasStyleLoadingEntry = (componentDirectory: string): boolean => {
        const entryFilePath = entryFileByDirectory.get(componentDirectory);

        return entryFilePath !== undefined && STYLE_LOAD_IN_ENTRY_PATTERN.test(readFileOrEmpty(entryFilePath));
    };

    return componentStyleFilePaths.filter(
        (filePath) =>
            !hasStyleLoadingEntry(dirname(filePath)) && TOP_LEVEL_INCLUDE_PATTERN.test(readFileOrEmpty(filePath)),
    );
};

export const buildLegacyOrphanStyleNotice = (filePath: string): string =>
    `${filePath} is compiled through the legacy style compatibility path: its component has no entry ` +
    `that loads styles (no index.ts importing them), so the entry-driven builder would drop its ` +
    `self-emitted CSS from the bundles. Update the component to the new contract — add index.ts with ` +
    `"import './style.scss';" and move the top-level @include into style.scss — and this path stops applying.`;
