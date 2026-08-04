import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { FSWatcher } from 'chokidar';
import {
    createDebouncedTwigBump,
    createTwigWatcher,
    resolveThemeWatchDirectories,
} from '../libs/reload/twig-watcher.mts';
import type { TwigWatcherOptions } from '../libs/reload/twig-watcher.mts';
import { createTwigVersionHolder } from '../libs/reload/manifest-writer.mts';
import type { TwigVersionHolder } from '../libs/reload/manifest-writer.mts';

type WatcherFactory = NonNullable<TwigWatcherOptions['createWatcher']>;

// Kept small: coalescing depends on the gap between successive notifications, not on absolute delay,
// so the exact value is irrelevant once timers are faked. The tests drive it via jest fake timers, so
// there is no real waiting and no dependence on filesystem-event delivery timing.
const DEBOUNCE_MILLISECONDS = 150;

// A Theme `.twig` path built with the platform separator so `isThemeTwigTemplate`'s segment check
// (which splits on `sep`) matches on every OS the suite runs on.
const themeTemplatePath = (fileName: string): string =>
    ['', 'app', 'src', 'ShopUi', 'Theme', 'fixture', 'components', 'card', fileName].join(sep);

let twigVersionHolder: TwigVersionHolder;
let rewriteCallCount: number;

beforeEach(() => {
    twigVersionHolder = createTwigVersionHolder();
    rewriteCallCount = 0;
});

const countingRewrite = (): void => {
    rewriteCallCount += 1;
};

describe('createDebouncedTwigBump', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('bumps the version and rewrites once, only after the debounce window elapses', () => {
        const handleTemplateEvent = createDebouncedTwigBump({
            twigVersionHolder,
            rewriteManifest: countingRewrite,
            debounceMilliseconds: DEBOUNCE_MILLISECONDS,
        });

        handleTemplateEvent(themeTemplatePath('card.twig'));
        // Nothing must fire before the window closes: the client keys a full reload off this bump.
        expect(twigVersionHolder.value).toBe(0);
        expect(rewriteCallCount).toBe(0);

        jest.advanceTimersByTime(DEBOUNCE_MILLISECONDS);

        expect(twigVersionHolder.value).toBe(1);
        expect(rewriteCallCount).toBe(1);
    });

    it('coalesces a burst of Theme .twig changes into a single bump per debounce window', () => {
        const handleTemplateEvent = createDebouncedTwigBump({
            twigVersionHolder,
            rewriteManifest: countingRewrite,
            debounceMilliseconds: DEBOUNCE_MILLISECONDS,
        });

        // Three changes, each landing before the previous window closes, so they collapse to one bump.
        handleTemplateEvent(themeTemplatePath('one.twig'));
        jest.advanceTimersByTime(DEBOUNCE_MILLISECONDS - 10);
        handleTemplateEvent(themeTemplatePath('two.twig'));
        jest.advanceTimersByTime(DEBOUNCE_MILLISECONDS - 10);
        handleTemplateEvent(themeTemplatePath('three.twig'));
        jest.advanceTimersByTime(DEBOUNCE_MILLISECONDS);

        expect(twigVersionHolder.value).toBe(1);
        expect(rewriteCallCount).toBe(1);
    });

    it('does not bump for a non-.twig change', () => {
        const handleTemplateEvent = createDebouncedTwigBump({
            twigVersionHolder,
            rewriteManifest: countingRewrite,
            debounceMilliseconds: DEBOUNCE_MILLISECONDS,
        });

        handleTemplateEvent(themeTemplatePath('card.scss'));
        jest.advanceTimersByTime(DEBOUNCE_MILLISECONDS * 2);

        expect(twigVersionHolder.value).toBe(0);
        expect(rewriteCallCount).toBe(0);
    });

    it('does not bump for a .twig file outside a Theme path segment', () => {
        const handleTemplateEvent = createDebouncedTwigBump({
            twigVersionHolder,
            rewriteManifest: countingRewrite,
            debounceMilliseconds: DEBOUNCE_MILLISECONDS,
        });

        handleTemplateEvent(['', 'app', 'src', 'templates', 'orphan.twig'].join(sep));
        jest.advanceTimersByTime(DEBOUNCE_MILLISECONDS * 2);

        expect(twigVersionHolder.value).toBe(0);
        expect(rewriteCallCount).toBe(0);
    });
});

describe('createTwigWatcher', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    // A synthetic watcher: chokidar's FSWatcher is an EventEmitter, so emitting `add`/`change`/`unlink`
    // on this stand-in exercises the exact `.on(...)` wiring in createTwigWatcher without depending on
    // real filesystem-event delivery (the source of the cold-cache flake).
    const createSyntheticWatcher = (): { watcher: FSWatcher; emitter: EventEmitter } => {
        const emitter = new EventEmitter();
        const watcher = Object.assign(emitter, {
            close: (): Promise<void> => Promise.resolve(),
        }) as unknown as FSWatcher;

        return { watcher, emitter };
    };

    it('routes add, change and unlink Theme .twig events through the debounced bump', () => {
        const { watcher: syntheticWatcher, emitter } = createSyntheticWatcher();
        let receivedDirectories: readonly string[] | undefined;

        const createWatcher = ((watchedPaths: readonly string[]): FSWatcher => {
            receivedDirectories = watchedPaths;

            return syntheticWatcher;
        }) as unknown as WatcherFactory;

        createTwigWatcher({
            watchedDirectories: ['/app/src/ShopUi/Theme'],
            twigVersionHolder,
            rewriteManifest: countingRewrite,
            debounceMilliseconds: DEBOUNCE_MILLISECONDS,
            createWatcher,
        });

        // The watcher must be pointed at exactly the directories it was given — never the module roots.
        expect(receivedDirectories).toEqual(['/app/src/ShopUi/Theme']);

        emitter.emit('add', themeTemplatePath('card.twig'));
        jest.advanceTimersByTime(DEBOUNCE_MILLISECONDS);
        expect(twigVersionHolder.value).toBe(1);

        emitter.emit('change', themeTemplatePath('card.twig'));
        jest.advanceTimersByTime(DEBOUNCE_MILLISECONDS);
        expect(twigVersionHolder.value).toBe(2);

        emitter.emit('unlink', themeTemplatePath('card.twig'));
        jest.advanceTimersByTime(DEBOUNCE_MILLISECONDS);
        expect(twigVersionHolder.value).toBe(3);

        expect(rewriteCallCount).toBe(3);
    });

    it('reports a summarized, actionable error without throwing when the watcher errors', () => {
        const { watcher: syntheticWatcher, emitter } = createSyntheticWatcher();
        const manyDirectories = Array.from({ length: 207 }, (_unused, index) => `/app/module-${index}/Theme`);
        const createWatcher = (() => syntheticWatcher) as unknown as WatcherFactory;
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        try {
            createTwigWatcher({
                watchedDirectories: manyDirectories,
                twigVersionHolder,
                rewriteManifest: countingRewrite,
                createWatcher,
            });

            expect(() => emitter.emit('error', new Error('EMFILE: too many open files, watch'))).not.toThrow();

            const loggedMessage = consoleErrorSpy.mock.calls[0]?.[0];
            expect(loggedMessage).toContain('EMFILE: too many open files, watch');
            // Summarized, not a multi-kilobyte dump of all 207 directories.
            expect(loggedMessage).toContain('204 more Theme directories');
            expect(loggedMessage).toContain('restart npm run yves:watch');
            expect(loggedMessage).not.toContain('/app/module-42/Theme');
        } finally {
            consoleErrorSpy.mockRestore();
        }
    });
});

describe('resolveThemeWatchDirectories', () => {
    let workspaceRoot: string;

    beforeEach(() => {
        workspaceRoot = mkdtempSync(join(tmpdir(), 'yves-twig-watcher-'));
    });

    afterEach(() => {
        rmSync(workspaceRoot, { recursive: true, force: true });
    });

    it('resolves a module root to its nested Theme directory, never the root itself', async () => {
        // The module root holds a large non-Theme subtree alongside the Theme tree; the resolver must
        // return only the Theme directory so chokidar never recurses into the non-Theme subtree — the
        // production EMFILE cause.
        const themeDirectory = join(workspaceRoot, 'ShopUi', 'Theme');
        mkdirSync(join(themeDirectory, 'default', 'components', 'card'), { recursive: true });
        mkdirSync(join(workspaceRoot, 'ShopUi', 'not-theme', 'deep', 'subtree'), { recursive: true });

        const resolved = await resolveThemeWatchDirectories([workspaceRoot]);

        expect(resolved).toEqual([themeDirectory]);
    });

    it('expands a glob root pattern to the Theme directory beneath every matching module', async () => {
        const alphaTheme = join(workspaceRoot, 'AlphaModule', 'Yves', 'Foo', 'Theme');
        const betaTheme = join(workspaceRoot, 'BetaModule', 'Yves', 'Bar', 'Theme');
        mkdirSync(alphaTheme, { recursive: true });
        mkdirSync(betaTheme, { recursive: true });
        // A sibling module with no Theme tree must contribute nothing.
        mkdirSync(join(workspaceRoot, 'GammaModule', 'Yves', 'Baz'), { recursive: true });

        const resolved = await resolveThemeWatchDirectories([join(workspaceRoot, '*', 'Yves')]);

        expect(resolved.sort()).toEqual([alphaTheme, betaTheme].sort());
    });

    it('ignores Theme directories that live under node_modules', async () => {
        const realTheme = join(workspaceRoot, 'ShopUi', 'Theme');
        mkdirSync(realTheme, { recursive: true });
        mkdirSync(join(workspaceRoot, 'node_modules', 'some-package', 'Theme'), { recursive: true });

        const resolved = await resolveThemeWatchDirectories([workspaceRoot]);

        expect(resolved).toEqual([realTheme]);
    });
});
