import type { EntryContributions } from './build-hooks.mts';

export interface WebpackEntrySources {
    vendorEntryPath: string;
    appEntryPath: string;
    basicStylePath: string;
    utilStylePath: string;
    designTokensStylePath: string | null;
    componentEntryPaths: string[];
    criticalComponentEntryPaths: string[];
    nonCriticalComponentEntryPaths: string[];
    criticalRescuedStylePaths: string[];
    nonCriticalRescuedStylePaths: string[];
    hookContributions: EntryContributions;
}

export type WebpackEntries = Record<string, string | string[]>;

export const APP_ENTRY_NAME = 'app';

// Emits nothing under its own name: its stylesheet becomes app.css, see app-stylesheet-plugin.mts.
export const APP_STYLESHEET_ENTRY_NAME = 'app-stylesheet';

// The builder's own entries, the keys `buildWebpackEntries` returns besides the named hook entries.
// A build hook cannot name an entry after one of them; the entry-points test pins both in sync.
export const BUILDER_ENTRY_NAMES = [
    'vendor',
    APP_ENTRY_NAME,
    APP_STYLESHEET_ENTRY_NAME,
    'critical',
    'non-critical',
    'util',
] as const;

/**
 * Assembles the webpack entries of one namespace × theme build.
 *
 * `critical` and `non-critical` are the two stylesheets a layout loads with CSS lazy loading on;
 * app.css is the single stylesheet it loads with lazy loading off, so it carries the same sources in
 * the same order — the flag decides how the CSS is delivered, never what the cascade is. Within a
 * bundle, design tokens and hook files come first so token definitions precede every consumer,
 * `basic.scss` precedes the components, rescued legacy styles precede the declared entries (the
 * legacy bundle laid them out core first, project last, so a project component competing with a
 * rescued vendor rule stays later in the cascade), and `util.scss` closes the non-critical bundle.
 *
 * app.js is the only script a layout loads, and ShopUi mounts the components in the order their
 * entries register them, so `app` lists the components in discovery order. app.css comes from the
 * `app-stylesheet` entry instead, because one entry orders its scripts and its styles alike.
 */
export const buildWebpackEntries = ({
    vendorEntryPath,
    appEntryPath,
    basicStylePath,
    utilStylePath,
    designTokensStylePath,
    componentEntryPaths,
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
        [APP_ENTRY_NAME]: [appEntryPath, ...componentEntryPaths, ...hookContributions.app],
        [APP_STYLESHEET_ENTRY_NAME]: [appEntryPath, ...critical, ...nonCritical, ...hookContributions.app],
        critical,
        'non-critical': nonCritical,
        util: utilStylePath,
    };
};
