import type { EntryContributions } from './build-hooks.mts';

export interface WebpackEntrySources {
    vendorEntryPath: string;
    appEntryPath: string;
    basicStylePath: string;
    utilStylePath: string;
    designTokensStylePath: string | null;
    criticalComponentEntryPaths: string[];
    nonCriticalComponentEntryPaths: string[];
    criticalRescuedStylePaths: string[];
    nonCriticalRescuedStylePaths: string[];
    hookContributions: EntryContributions;
}

export type WebpackEntries = Record<string, string | string[]>;

// The builder's own entries, the keys `buildWebpackEntries` returns besides the named hook entries.
// A build hook cannot name an entry after one of them; the entry-points test pins both in sync.
export const BUILDER_ENTRY_NAMES = ['vendor', 'app', 'critical', 'non-critical', 'util'] as const;

/**
 * Assembles the webpack entries of one namespace × theme build.
 *
 * `critical` and `non-critical` are the two stylesheets a layout loads with CSS lazy loading on;
 * `app` is the single stylesheet it loads with lazy loading off, so it carries the same sources in
 * the same order — the flag decides how the CSS is delivered, never what the cascade is. Within a
 * bundle, design tokens and hook files come first so token definitions precede every consumer,
 * `basic.scss` precedes the components, rescued legacy styles precede the declared entries (the
 * legacy bundle laid them out core first, project last, so a project component competing with a
 * rescued vendor rule stays later in the cascade), and `util.scss` closes the non-critical bundle.
 */
export const buildWebpackEntries = ({
    vendorEntryPath,
    appEntryPath,
    basicStylePath,
    utilStylePath,
    designTokensStylePath,
    criticalComponentEntryPaths,
    nonCriticalComponentEntryPaths,
    criticalRescuedStylePaths,
    nonCriticalRescuedStylePaths,
    hookContributions,
}: WebpackEntrySources): WebpackEntries => {
    const critical = [
        ...(designTokensStylePath === null ? [] : [designTokensStylePath]),
        ...hookContributions.critical,
        basicStylePath,
        ...criticalRescuedStylePaths,
        ...criticalComponentEntryPaths,
    ];
    const nonCritical = [
        ...hookContributions.nonCritical,
        ...nonCriticalRescuedStylePaths,
        ...nonCriticalComponentEntryPaths,
        utilStylePath,
    ];

    return {
        // Named hook entries first, so the builder's own names below stay in charge of their bundles.
        ...hookContributions.entries,
        vendor: vendorEntryPath,
        app: [appEntryPath, ...critical, ...nonCritical, ...hookContributions.app],
        critical,
        'non-critical': nonCritical,
        util: utilStylePath,
    };
};
