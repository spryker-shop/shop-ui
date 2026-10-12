import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { componentKeyOf } from './finder.mts';

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

export interface ShadowedLegacyStyle {
    filePath: string;
    /** The entry point of the directory that provides the component instead. */
    providedBy: string;
}

export interface LegacyStyleRescueResult {
    rescuedFilePaths: string[];
    shadowed: ShadowedLegacyStyle[];
}

/**
 * Finds component styles written against the legacy builder contract ("the file exists, therefore
 * it is in the bundle") that the entry-driven builder would silently skip: the file emits CSS at its
 * top level, and its component declares no entry that loads styles. Modules shipped before the
 * builder migration still contain such components; compiling them keeps their CSS in the bundles
 * until the modules are updated.
 *
 * A component is provided by exactly one directory: the one whose entry point won the finder's
 * precedence (later source over earlier, current theme over default theme). A self-emitting file
 * of any other directory for the same component is shadowed — it is not compiled, whether or not
 * the providing directory ships styles of its own, because the override meant to replace it — and
 * it is reported, so a project can see where styles went.
 *
 * Within the providing directory this reproduces the legacy behavior exactly, not more: the legacy
 * builder force-imported every component `<name>.scss` but never `style.scss` (excluded from its
 * query), so `style.scss` aggregators are deliberately not considered here. Mixin-only files are
 * never rescued either — they emit nothing on load and stay reachable through the mixin index.
 */
export const findLegacyOrphanStyles = ({
    componentStyleFilePaths,
    entryPointFilePaths,
}: {
    componentStyleFilePaths: string[];
    entryPointFilePaths: string[];
}): LegacyStyleRescueResult => {
    const entryFileByComponent = new Map<string, string>();
    entryPointFilePaths.forEach((entryFilePath) =>
        entryFileByComponent.set(componentKeyOf(entryFilePath), entryFilePath),
    );

    const result: LegacyStyleRescueResult = { rescuedFilePaths: [], shadowed: [] };

    componentStyleFilePaths.forEach((filePath) => {
        if (!TOP_LEVEL_INCLUDE_PATTERN.test(readFileOrEmpty(filePath))) {
            return;
        }

        const entryFilePath = entryFileByComponent.get(componentKeyOf(filePath));

        if (entryFilePath === undefined) {
            result.rescuedFilePaths.push(filePath);

            return;
        }

        if (dirname(entryFilePath) !== dirname(filePath)) {
            result.shadowed.push({ filePath, providedBy: entryFilePath });

            return;
        }

        if (!STYLE_LOAD_IN_ENTRY_PATTERN.test(readFileOrEmpty(entryFilePath))) {
            result.rescuedFilePaths.push(filePath);
        }
    });

    return result;
};

export const buildLegacyOrphanStyleNotice = (filePath: string): string =>
    `${filePath} is compiled through the legacy style compatibility path: its component has no entry ` +
    `that loads styles (no index.ts importing them), so the entry-driven builder would drop its ` +
    `self-emitted CSS from the bundles. Update the component to the new contract — add index.ts with ` +
    `"import './style.scss';" and move the top-level @include into style.scss — and this path stops applying.`;

export const buildShadowedLegacyStyleNotice = (filePath: string, providedBy: string): string =>
    `${filePath} is not compiled: ${providedBy} provides the component ${componentKeyOf(filePath)} and takes ` +
    `precedence, so this self-emitting file would only add back styles the override replaced. If these styles ` +
    `are still wanted, load the file from the providing component (import it from its style.scss) or remove ` +
    `the override.`;
