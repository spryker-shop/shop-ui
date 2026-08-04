import { sep } from 'node:path';
import type { Stats } from 'node:fs';
import glob from 'fast-glob';
import { watch } from 'chokidar';
import type { FSWatcher } from 'chokidar';
import type { TwigVersionHolder } from './manifest-writer.mts';

// The plan calls for a ~100 ms debounce so a burst of editor writes (a single save can surface as
// an `add` immediately followed by a `change`) collapses into one version bump and one rewrite.
const DEFAULT_TWIG_DEBOUNCE_MILLISECONDS = 100;

// Theme templates live under a `Theme` path segment (`.../ShopUi/Theme/default/...`). Matching the
// segment reproduces the plan's `**/Theme/**/*.twig` intent now that chokidar v4 has no glob support:
// v4 (rewritten in TypeScript) dropped v3-style glob patterns entirely, so filtering is done here.
const isThemeTwigTemplate = (changedPath: string): boolean =>
    changedPath.endsWith('.twig') && changedPath.split(sep).includes('Theme');

export interface DebouncedTwigBumpOptions {
    twigVersionHolder: TwigVersionHolder;
    rewriteManifest: () => void;
    debounceMilliseconds?: number;
}

/**
 * Builds the handler that turns a stream of changed-path notifications into a single debounced
 * `twigVersion` bump: it keeps only Theme `.twig` files and collapses a burst (a single editor save
 * can surface as an `add` immediately followed by a `change`) into one bump plus one manifest rewrite.
 *
 * It is deliberately separated from chokidar so the bump/coalesce/filter contract can be tested with
 * jest fake timers and synthetic paths — deterministically. Driving it through a real filesystem
 * watcher instead flaked hard under a cold-cache parallel jest run: with 15 ts-jest suites saturating
 * the CPU, macOS fsevents notifications for a just-written file were delivered many seconds late or
 * dropped entirely, so a real-fs test could not distinguish "event lost" from "debounce broken".
 */
export const createDebouncedTwigBump = ({
    twigVersionHolder,
    rewriteManifest,
    debounceMilliseconds = DEFAULT_TWIG_DEBOUNCE_MILLISECONDS,
}: DebouncedTwigBumpOptions): ((changedPath: string) => void) => {
    let debounceTimer: NodeJS.Timeout | undefined;

    const scheduleBump = (): void => {
        if (debounceTimer !== undefined) {
            clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
            debounceTimer = undefined;
            twigVersionHolder.value += 1;
            rewriteManifest();
        }, debounceMilliseconds);

        // A pending twig bump must never keep the watch process alive on its own.
        debounceTimer.unref();
    };

    return (changedPath: string): void => {
        if (!isThemeTwigTemplate(changedPath)) {
            return;
        }

        scheduleBump();
    };
};

export interface TwigWatcherOptions {
    watchedDirectories: string[];
    twigVersionHolder: TwigVersionHolder;
    rewriteManifest: () => void;
    debounceMilliseconds?: number;
    // Injectable so a test can supply a synthetic watcher and drive `add`/`change`/`unlink` events
    // deterministically; production always uses chokidar's real `watch`.
    createWatcher?: typeof watch;
}

/**
 * Resolves the `componentEntryPoints.dirs` list (relative module-root patterns, one of which — the
 * project `src/Pyz` Yves glob — is itself a glob) down to the concrete `Theme` directories beneath
 * those roots, and returns only those.
 *
 * Handing chokidar the module roots directly is what caused the production EMFILE flood: chokidar v4
 * opens a watch descriptor for every subdirectory it recurses into, and the roots are enormous
 * (`src/Spryker` alone holds ~34k directories), so the process blows past the OS descriptor limit and
 * the watcher dies. Only `Theme` trees hold templates (~207 directories across all modules), so each
 * root is globbed for its `Theme` directories and only those are watched. This both matches the
 * plan's Theme-template intent and keeps the descriptor count orders of magnitude lower.
 *
 * Resolution mirrors the webpack finder (resolve roots, then glob within each) and happens once at
 * watch start, matching the finder's one-shot discovery (the "new component ⇒ restart watch"
 * limitation is by design). `node_modules` is excluded defensively: a resolved module root should
 * never contain a vendored `Theme` tree, but the ignore keeps a stray symlinked dependency from
 * re-introducing the flood.
 */
export const resolveThemeWatchDirectories = async (componentEntryPointDirectories: string[]): Promise<string[]> => {
    const resolvedModuleDirectorySets = await Promise.all(
        componentEntryPointDirectories.map((directoryPattern) =>
            glob(directoryPattern, { onlyDirectories: true, absolute: true, unique: true }),
        ),
    );

    const themeDirectorySets = await Promise.all(
        resolvedModuleDirectorySets.flat().map((moduleDirectory) =>
            glob('**/Theme', {
                cwd: moduleDirectory,
                onlyDirectories: true,
                absolute: true,
                unique: true,
                ignore: ['**/node_modules/**'],
            }),
        ),
    );

    return Array.from(new Set(themeDirectorySets.flat()));
};

// The watcher can be pointed at ~207 Theme directories; dumping every path into an error string would
// produce a multi-kilobyte console line. Summarize to a count plus a few examples so the message stays
// actionable without flooding the terminal (the same terminal the EMFILE flood used to overwhelm).
const describeWatchedDirectories = (directories: string[]): string => {
    const maximumListedDirectories = 3;

    if (directories.length <= maximumListedDirectories) {
        return directories.join(', ');
    }

    const listedDirectories = directories.slice(0, maximumListedDirectories).join(', ');
    const remainingCount = directories.length - maximumListedDirectories;

    return `${listedDirectories} and ${remainingCount} more Theme directories`;
};

/**
 * Watches the given directories for `.twig` template edits and, on a debounced change, bumps the
 * shared `twigVersion` holder and asks the manifest writer to rewrite the manifest. A template edit
 * never triggers a webpack recompile, so the manifest's `assets` map is unchanged — only
 * `twigVersion` moves, which is exactly what the browser client keys a full reload off.
 */
export const createTwigWatcher = ({
    watchedDirectories,
    twigVersionHolder,
    rewriteManifest,
    debounceMilliseconds,
    createWatcher = watch,
}: TwigWatcherOptions): FSWatcher => {
    const watcher = createWatcher(watchedDirectories, {
        // The initial directory scan must not bump the version: it reflects state already on disk.
        ignoreInitial: true,
        // v4 has no globs, so restrict to `.twig` at the file level with a predicate. Directories
        // return `false` here (their stats are not a file) so recursion into Theme trees is kept.
        ignored: (targetPath: string, stats?: Stats): boolean =>
            Boolean(stats?.isFile()) && !targetPath.endsWith('.twig'),
    });

    const handleTemplateEvent = createDebouncedTwigBump({ twigVersionHolder, rewriteManifest, debounceMilliseconds });

    watcher
        .on('add', handleTemplateEvent)
        .on('change', handleTemplateEvent)
        .on('unlink', handleTemplateEvent)
        .on('error', (error: unknown): void => {
            const reason = error instanceof Error ? error.message : String(error);

            // A watcher error must not crash the build; report it actionably and keep the build alive.
            console.error(
                `Yves dev live-reload Twig watcher failed while watching ${describeWatchedDirectories(watchedDirectories)}. ` +
                    `Reason: ${reason}. ` +
                    `Check that these Theme directories exist and are readable, then restart npm run yves:watch.`,
            );
        });

    return watcher;
};
