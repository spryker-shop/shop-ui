/**
 * Built-in design-tokens step.
 *
 * Runs once per namespace × theme, before webpack assembly. When the project ships a
 * `design-tokens/design-tokens.json` under its global assets, the step generates
 * `design-tokens.css` in the project styles directory and contributes it to the `critical`
 * entry, so token definitions precede any component styles that consume them.
 *
 * The tokens source switches the step on: without it nothing is generated and style-dictionary is
 * not even loaded; a committed `design-tokens.css` is still served when there is one.
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

// `any` at the third-party boundary: the step registers transforms through style-dictionary's
// static API, and tests substitute a fake module with the same surface.
type StyleDictionaryModule = any;

export type StyleDictionaryLoader = () => Promise<StyleDictionaryModule>;

// Loaded on demand: most builds have no tokens source, and the library is large.
const loadStyleDictionary: StyleDictionaryLoader = async () => (await import('style-dictionary')).default;

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
 * The loader parameter exists for tests only.
 */
export const buildDesignTokensCss = async (
    appSettings: AppSettings,
    loadModule: StyleDictionaryLoader = loadStyleDictionary,
): Promise<string | null> => {
    const buildPath = resolveStylesBuildPath(appSettings);
    const cssFilePath = join(buildPath, 'design-tokens.css');
    const assetsRoot = join(appSettings.context, appSettings.paths.assets.globalAssets);
    const sourceTokensPath = join(assetsRoot, 'design-tokens/design-tokens.json');

    // No tokens source: a committed CSS is still honored as a pre-built artifact; otherwise the
    // project does not use design tokens.
    if (!existsSync(sourceTokensPath)) {
        return existsSync(cssFilePath) ? cssFilePath : null;
    }

    const StyleDictionary = await loadModule();

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
