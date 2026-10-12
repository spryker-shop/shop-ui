import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from '@jest/globals';
import {
    defaultGlobalSettings,
    defineConfig,
    getAppSettings,
    getOwnedSourceRoots,
    type GlobalSettings,
} from '../settings.mts';

const CUSTOM_NAMESPACE_ROOT = './src/Acme/Yves';
const temporaryRoots: string[] = [];

const writeNamespaceConfig = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'yves-builder-namespace-'));
    temporaryRoots.push(root);
    const configurationPath = join(root, 'frontend-build-config.json');
    writeFileSync(
        configurationPath,
        JSON.stringify({
            path: 'assets/%theme%',
            staticPath: 'assets/static',
            namespaces: [{ codeBucket: '', namespace: '', themes: ['default'], defaultTheme: 'default' }],
        }),
    );

    return configurationPath;
};

const appSettingsFor = (globalSettings: GlobalSettings) => {
    const [appSettings] = getAppSettings(
        [{ codeBucket: '', namespace: '', themes: ['default'], defaultTheme: 'default' }],
        writeNamespaceConfig(),
        globalSettings,
    );

    return appSettings;
};

afterEach(() => {
    while (temporaryRoots.length > 0) {
        rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
    }
});

describe('registering a custom project namespace', () => {
    it('adds the namespace under a new key next to Pyz, after every built-in root', () => {
        const globalSettings = defineConfig({ paths: { sources: { acme: CUSTOM_NAMESPACE_ROOT } } });

        expect(Object.entries(globalSettings.paths.sources)).toEqual([
            ...Object.entries(defaultGlobalSettings.paths.sources),
            ['acme', CUSTOM_NAMESPACE_ROOT],
        ]);
    });

    it('replaces Pyz with the namespace registered under the project key, keeping the root order', () => {
        const globalSettings = defineConfig({ paths: { sources: { project: CUSTOM_NAMESPACE_ROOT } } });
        const sourceRoots = Object.values(globalSettings.paths.sources);

        expect(Object.keys(globalSettings.paths.sources)).toEqual(Object.keys(defaultGlobalSettings.paths.sources));
        expect(sourceRoots.at(-1)).toBe(CUSTOM_NAMESPACE_ROOT);
        expect(sourceRoots.some((sourceRoot) => sourceRoot.includes('/Pyz/'))).toBe(false);
    });

    it('lints a namespace registered next to Pyz together with Pyz', () => {
        const globalSettings = defineConfig({ paths: { sources: { acme: CUSTOM_NAMESPACE_ROOT } } });

        expect(getOwnedSourceRoots(globalSettings)).toEqual(
            expect.arrayContaining([defaultGlobalSettings.paths.sources.project, CUSTOM_NAMESPACE_ROOT]),
        );
    });
});

describe('building with a custom project namespace', () => {
    it('collects components and styles of a namespace registered next to Pyz after the Pyz ones', () => {
        const globalSettings = defineConfig({ paths: { sources: { acme: CUSTOM_NAMESPACE_ROOT } } });
        const projectRoot = globalSettings.paths.sources.project;

        const { componentEntryPoints, componentStyles } = appSettingsFor(globalSettings).find;

        expect(componentEntryPoints.dirs.slice(-2)).toEqual([projectRoot, CUSTOM_NAMESPACE_ROOT]);
        expect(componentStyles.dirs.slice(-2)).toEqual([projectRoot, CUSTOM_NAMESPACE_ROOT]);
    });

    // The application entry (app.ts, the ShopUi theme root) has always come from one project root only.
    it('takes the ShopUi application entry from the project key only, not from a namespace added next to it', () => {
        const globalSettings = defineConfig({ paths: { sources: { acme: CUSTOM_NAMESPACE_ROOT } } });

        const { shopUiEntryPoints } = appSettingsFor(globalSettings).find;

        expect(shopUiEntryPoints.dirs).toEqual([join(globalSettings.context, globalSettings.paths.sources.project)]);
    });

    it('takes the ShopUi application entry from the namespace once it replaces Pyz under the project key', () => {
        const globalSettings = defineConfig({ paths: { sources: { project: CUSTOM_NAMESPACE_ROOT } } });

        const { shopUiEntryPoints } = appSettingsFor(globalSettings).find;

        expect(shopUiEntryPoints.dirs).toEqual([join(globalSettings.context, CUSTOM_NAMESPACE_ROOT)]);
    });
});
