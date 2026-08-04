/**
 * Built-in design-tokens step.
 *
 * Runs once per namespace × theme, before webpack assembly. When the project ships a
 * `design-tokens/design-tokens.json` under its global assets, the step generates
 * `design-tokens.css` in the project styles directory and contributes it to the `critical`
 * entry, so token definitions precede any component styles that consume them.
 *
 * Everything about the step is optional: a project without a tokens source is skipped
 * silently, and `style-dictionary` itself is an optional dependency — without it the step
 * serves a committed `design-tokens.css` when one exists.
 */

import { join, sep } from 'node:path';
import { existsSync } from 'node:fs';
import glob from 'fast-glob';
import type { AppSettings } from '../../settings.mts';

// Local token shape instead of style-dictionary's own type exports: the step must keep working
// across library minor versions, and it has to accept both DTCG tokens ($value) and legacy
// tokens (value).
interface DesignToken {
    $value?: unknown;
    value?: unknown;
    path: string[];
}

const getTokenValue = (token: DesignToken): unknown => token.$value ?? token.value;

// `any` at the third-party boundary: style-dictionary is optional and its types are absent
// when the package is not installed, so the module surface cannot be typed statically.
type StyleDictionaryModule = any;

export type StyleDictionaryLoader = () => Promise<StyleDictionaryModule | null>;

// Availability is probed via import.meta.resolve rather than by catching the import() error,
// so a present-but-broken installation still fails the build loudly instead of silently
// falling back to a stale file.
const loadInstalledStyleDictionary: StyleDictionaryLoader = async () => {
    // A non-literal specifier keeps TypeScript from resolving the module's types, which do not
    // exist when the optional package is not installed.
    const specifier = 'style-dictionary';

    try {
        import.meta.resolve(specifier);
    } catch {
        return null;
    }

    const { default: StyleDictionary } = await import(specifier);

    return StyleDictionary;
};

// The step runs once per namespace × theme; transform registration is global to the
// style-dictionary module and must not repeat for the same module instance.
const modulesWithRegisteredTransforms = new WeakSet<object>();

const registerTransforms = (StyleDictionary: StyleDictionaryModule): void => {
    if (modulesWithRegisteredTransforms.has(StyleDictionary)) {
        return;
    }
    modulesWithRegisteredTransforms.add(StyleDictionary);

    StyleDictionary.registerTransform({
        name: 'name/kebab-custom',
        type: 'name',
        transform: ({ path }: DesignToken) => path.slice(1).join('-'),
    });

    StyleDictionary.registerTransform({
        name: 'value/px-custom',
        type: 'value',
        filter: (token: DesignToken) =>
            typeof getTokenValue(token) === 'number' && !token.path.join('.').toLowerCase().includes('weight'),
        transform: (token: DesignToken) => `${getTokenValue(token)}px`,
    });

    StyleDictionary.registerFileHeader({
        name: 'generated-header',
        fileHeader: () => {
            const now = new Date();
            const date = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            return [`Generated at: ${date} ${time}`];
        },
    });
};

// The project sources directory may be a glob in the monorepo layout (./src/Pyz/*/src/Pyz/Yves),
// so it is expanded to a real directory before use. style-dictionary treats buildPath as a
// directory prefix and requires the trailing separator.
const resolveStylesBuildPath = (appSettings: AppSettings): string => {
    const [projectSourcesDirectory] = appSettings.find.shopUiEntryPoints.dirs;
    const stylesPattern = join(projectSourcesDirectory, `ShopUi/Theme/${appSettings.theme}/styles`);
    const [resolvedDirectory] = glob.sync(stylesPattern, { onlyDirectories: true, absolute: true, unique: true });

    return `${resolvedDirectory ?? stylesPattern}${sep}`;
};

/**
 * Returns the absolute path of the design-tokens CSS to prepend to the `critical` entry, or
 * `null` when the project does not use design tokens (no tokens source and no committed CSS).
 *
 * The loader parameter exists for tests only — production callers use the default, which
 * resolves the optionally-installed style-dictionary package.
 */
export const buildDesignTokensCss = async (
    appSettings: AppSettings,
    loadStyleDictionary: StyleDictionaryLoader = loadInstalledStyleDictionary,
): Promise<string | null> => {
    const buildPath = resolveStylesBuildPath(appSettings);
    const cssFilePath = join(buildPath, 'design-tokens.css');
    const assetsRoot = join(appSettings.context, appSettings.paths.assets.globalAssets);
    const sourceTokensPath = join(assetsRoot, 'design-tokens/design-tokens.json');

    if (!existsSync(sourceTokensPath)) {
        // No tokens source: a committed CSS is still honored as a pre-built artifact; otherwise
        // the project simply does not use design tokens and the step is skipped silently.
        return existsSync(cssFilePath) ? cssFilePath : null;
    }

    const StyleDictionary = await loadStyleDictionary();

    if (!StyleDictionary) {
        if (existsSync(cssFilePath)) {
            console.info(`style-dictionary is not installed — using the committed ${cssFilePath} as is.`);

            return cssFilePath;
        }

        console.warn(
            `Design tokens source ${sourceTokensPath} exists, but style-dictionary is not installed ` +
                `and no pre-built ${cssFilePath} was found — design tokens are skipped for this build. ` +
                `Install it (npm install --save-dev style-dictionary) to generate design-tokens.css, ` +
                `or commit a pre-built design-tokens.css.`,
        );

        return null;
    }

    registerTransforms(StyleDictionary);

    await new StyleDictionary({
        log: { verbosity: 'silent', warnings: 'disabled', errors: 'error' },
        source: [sourceTokensPath],
        platforms: {
            css: {
                buildPath,
                transforms: ['attribute/cti', 'name/kebab-custom', 'color/css', 'value/px-custom'],
                files: [
                    {
                        destination: 'design-tokens.css',
                        format: 'css/variables',
                        options: { selector: ':root', outputReferences: true, fileHeader: 'generated-header' },
                    },
                ],
            },
        },
    }).buildAllPlatforms();

    console.info(`Built design tokens CSS: ${cssFilePath}`);

    return cssFilePath;
};
