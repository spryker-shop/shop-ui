// Browser-side live-reload client. This file is bundle code (component-style TypeScript compiled by
// the babel-loader pipeline), NOT builder-executed code: no node: imports and no .mts. It is only
// ever part of an entry when the development-watch config injects it, so production/one-shot bundles
// never contain it (plan constraint 1) and never poll for a manifest (plan constraint 4).

// __RELOAD_MANIFEST_URL__ is injected by the development-watch DefinePlugin and declared ambiently in
// reload-globals.d.ts so tsc resolves it. In any config that does not define it the client is not
// part of an entry, so no dead code ships.

// State-preserving reload lives in a sibling module to keep both files within the Yves TypeScript
// max-lines budget. No file extension in the specifier because tsconfig.base has
// allowImportingTsExtensions off.
import { reloadPreservingState, restorePreservedState } from './reload-state';

// The manifest shape written by the builder's manifest-writer (Phase 1). Redeclared here rather than
// imported because the writer is builder-only .mts code that must never enter the browser bundle.
interface DevBuildManifest {
    buildId: number;
    twigVersion: number;
    assets: Record<string, string>;
}

export type ManifestDiffKind = 'none' | 'css-only' | 'full-reload';

export interface StylesheetChange {
    assetKey: string;
    hash: string;
}

export interface StylesheetLink {
    href: string;
}

export interface StylesheetSwap {
    link: StylesheetLink;
    newHref: string;
}

// Hardcoded client constant (not a settings key). End-to-end reload latency is dominated by rebuild
// plus asset sync/serving, NOT by this interval (measured: a shorter interval did not move it), so
// polling faster buys nothing and only multiplies noise — every poll is a network request that the
// app's fetch/WebProfiler logging surfaces in devtools. One request per second keeps detection
// responsive while keeping that noise (and the network panel) manageable.
const POLL_INTERVAL_MILLISECONDS = 1000;

/**
 * Decides what the client must do given the previous and next manifests. `buildId` is intentionally
 * ignored because it changes on every compilation; the decision rests on asset hashes and
 * `twigVersion` only. A changed set of asset keys (an entry point appeared or vanished) forces a full
 * reload because a CSS hot-swap can only reason about links already present on the page.
 */
export const classifyManifestDiff = (previous: DevBuildManifest, next: DevBuildManifest): ManifestDiffKind => {
    if (previous.twigVersion !== next.twigVersion) {
        return 'full-reload';
    }

    const previousKeys = Object.keys(previous.assets);
    const nextKeys = Object.keys(next.assets);

    if (previousKeys.length !== nextKeys.length) {
        return 'full-reload';
    }

    let hasCssChange = false;

    for (const assetKey of nextKeys) {
        const previousHash = previous.assets[assetKey];

        if (previousHash === undefined) {
            return 'full-reload';
        }

        if (previousHash === next.assets[assetKey]) {
            continue;
        }

        if (assetKey.endsWith('.js')) {
            return 'full-reload';
        }

        if (assetKey.endsWith('.css')) {
            hasCssChange = true;
        }
    }

    return hasCssChange ? 'css-only' : 'none';
};

const collectChangedStylesheets = (previous: DevBuildManifest, next: DevBuildManifest): StylesheetChange[] => {
    const changedStylesheets: StylesheetChange[] = [];

    for (const assetKey of Object.keys(next.assets)) {
        if (!assetKey.endsWith('.css')) {
            continue;
        }

        if (previous.assets[assetKey] === next.assets[assetKey]) {
            continue;
        }

        changedStylesheets.push({ assetKey, hash: next.assets[assetKey] });
    }

    return changedStylesheets;
};

// The manifest key is an output-relative POSIX path (e.g. `css/yves_default.app.css`); a page link's
// href is the served URL whose pathname ends with that key. Comparing the query-stripped tail is
// enough to pair them without a DOM/URL dependency, keeping this pure and node-testable.
const linkMatchesAsset = (href: string, assetKey: string): boolean => {
    const [pathWithoutQuery] = href.split('?');

    return pathWithoutQuery.endsWith(`/${assetKey}`) || pathWithoutQuery === assetKey;
};

const buildCacheBustedHref = (href: string, hash: string): string => {
    const [pathWithoutQuery] = href.split('?');

    return `${pathWithoutQuery}?v=${hash}`;
};

/**
 * Pairs each changed CSS asset with the page `<link>` elements that reference it and returns the
 * href swaps to apply, each carrying a `?v=<hash>` cache-buster. Pure: it never touches the DOM, so
 * the shell injects the live `<link>` nodes and this stays testable with plain link-like objects.
 */
export const resolveStylesheetSwaps = (
    changedStylesheets: StylesheetChange[],
    documentLinks: StylesheetLink[],
): StylesheetSwap[] => {
    const swaps: StylesheetSwap[] = [];

    for (const change of changedStylesheets) {
        for (const link of documentLinks) {
            if (!linkMatchesAsset(link.href, change.assetKey)) {
                continue;
            }

            swaps.push({ link, newHref: buildCacheBustedHref(link.href, change.hash) });
        }
    }

    return swaps;
};

const fetchManifest = async (): Promise<DevBuildManifest | undefined> => {
    try {
        const response = await fetch(`${__RELOAD_MANIFEST_URL__}?t=${Date.now()}`, { cache: 'no-store' });

        if (!response.ok) {
            return undefined;
        }

        return (await response.json()) as DevBuildManifest;
    } catch {
        // Silent by contract (plan constraint 4): a page served without a manifest — e.g. a
        // production build in the public dir — must log nothing and must not throw. A missing or
        // unreachable manifest is a normal state here, not an error.
        return undefined;
    }
};

const applyStylesheetSwaps = (swaps: StylesheetSwap[]): void => {
    for (const swap of swaps) {
        swap.link.href = swap.newHref;
    }
};

const startPolling = (): void => {
    let baselineManifest: DevBuildManifest | undefined;

    const pollOnce = async (): Promise<void> => {
        const nextManifest = await fetchManifest();

        if (nextManifest === undefined) {
            return;
        }

        // First successful fetch is the baseline (plan): no reload on the first poll.
        if (baselineManifest === undefined) {
            baselineManifest = nextManifest;

            return;
        }

        const diffKind = classifyManifestDiff(baselineManifest, nextManifest);

        if (diffKind === 'none') {
            return;
        }

        if (diffKind === 'full-reload') {
            reloadPreservingState();

            return;
        }

        const documentLinks = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
        applyStylesheetSwaps(
            resolveStylesheetSwaps(collectChangedStylesheets(baselineManifest, nextManifest), documentLinks),
        );
        baselineManifest = nextManifest;
    };

    setInterval(() => {
        void pollOnce();
    }, POLL_INTERVAL_MILLISECONDS);
};

// Webpack executes this entry file at page load, but jest also imports the module in a Node
// environment that has no DOM and no injected constant. Bootstrapping only when both the DOM and the
// manifest URL exist means importing the pure functions under test never starts a timer, and a
// production bundle that somehow lacked the constant would stay inert (typeof on an undeclared
// identifier is 'undefined', never a ReferenceError).
if (typeof document !== 'undefined' && typeof __RELOAD_MANIFEST_URL__ !== 'undefined') {
    // This client is prepended to entry.app and runs early, so on a fresh navigation the DOM may still
    // be parsing. Restore once it is ready — immediately if parsing already finished, otherwise on
    // DOMContentLoaded — before polling begins.
    if (document.readyState !== 'loading') {
        restorePreservedState();
    } else {
        document.addEventListener('DOMContentLoaded', restorePreservedState, { once: true });
    }

    startPolling();
}
