import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from '@jest/globals';
import {
    BUILD_CONFIGURATION_PATH,
    applyGeneratedBuildConfiguration,
    defineConfig,
    getAppSettings,
    getProjectSourceRoots,
    readGeneratedBuildConfiguration,
    resolveNamespaceJson,
    type GeneratedBuildConfiguration,
} from '../settings.mts';

const CORE_THEME = 'src/SprykerShop/ShopUi/src/SprykerShop/Yves/ShopUi/Theme';
const temporaryRoots: string[] = [];

// A monorepo-shaped project: the core ShopUi theme, the Spryker and SprykerFeature sources in src/,
// SprykerEco and SprykerSdk installed under vendor/, two project namespaces.
const createContext = (): string => {
    const context = mkdtempSync(join(tmpdir(), 'yves-build-configuration-'));
    temporaryRoots.push(context);
    [CORE_THEME, 'src/Spryker', 'src/SprykerFeature', 'src/Pyz', 'src/Acme'].forEach((directory) =>
        mkdirSync(join(context, directory), { recursive: true }),
    );

    return context;
};

const writeFile = (context: string, relativePath: string, content: unknown): string => {
    const filePath = join(context, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, typeof content === 'string' ? content : JSON.stringify(content));

    return filePath;
};

const generated: GeneratedBuildConfiguration = {
    coreNamespaces: ['SprykerShop', 'SprykerFeature', 'SprykerEco', 'Spryker', 'SprykerSdk'],
    projectNamespaces: ['Acme', 'Pyz'],
    theme: '',
    defaultTheme: 'default',
};

const settingsFor = (context: string, overrides: Parameters<typeof defineConfig>[0] = {}) => ({
    ...defineConfig(overrides),
    context,
});

afterEach(() => {
    while (temporaryRoots.length > 0) {
        rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
    }
});

describe('reading the generated build configuration', () => {
    it('returns null when the backend has not written the file, so the built-in layout stays', () => {
        expect(readGeneratedBuildConfiguration(createContext())).toBeNull();
    });

    it('reads the file at its fixed path', () => {
        const context = createContext();
        writeFile(context, BUILD_CONFIGURATION_PATH, generated);

        expect(readGeneratedBuildConfiguration(context)).toEqual(generated);
    });

    it('fails when the file is not valid JSON', () => {
        const context = createContext();
        writeFile(context, BUILD_CONFIGURATION_PATH, '{ not json');

        expect(() => readGeneratedBuildConfiguration(context)).toThrow(SyntaxError);
    });

    it('fails naming the file when the namespace lists are missing', () => {
        const context = createContext();
        const filePath = writeFile(context, BUILD_CONFIGURATION_PATH, { theme: '' });

        expect(() => readGeneratedBuildConfiguration(context)).toThrow(filePath);
        expect(() => readGeneratedBuildConfiguration(context)).toThrow('"coreNamespaces" and "projectNamespaces"');
    });
});

describe('applying the generated build configuration', () => {
    it('keeps the settings untouched without a file', () => {
        const settings = settingsFor(createContext());

        expect(applyGeneratedBuildConfiguration(settings, null)).toBe(settings);
    });

    it('scans the namespaces weakest first, src/ when the repository holds them and vendor/ otherwise, project namespaces last in both shapes', () => {
        const settings = applyGeneratedBuildConfiguration(settingsFor(createContext()), generated);

        expect(settings.paths.sources).toEqual({
            sprykersdk: './vendor/spryker-sdk',
            spryker: './src/Spryker',
            sprykereco: './vendor/spryker-eco',
            sprykerfeature: './src/SprykerFeature',
            sprykershop: './src/SprykerShop',
            'project/Yves': './src/Pyz/Yves',
            project: './src/Pyz/*/src/Pyz/Yves',
            'acme/Yves': './src/Acme/Yves',
            acme: './src/Acme/*/src/Acme/Yves',
        });
    });

    it('derives the core theme root, the icon sprite sources and the TypeScript configuration path', () => {
        const settings = applyGeneratedBuildConfiguration(settingsFor(createContext()), generated);

        expect(settings.paths.coreThemeRoot).toBe(`./${CORE_THEME}`);
        expect(settings.paths.tsConfig).toBe(`./${CORE_THEME.replace(/Theme$/, 'FrontendBuilder')}/tsconfig.yves.json`);
        expect(settings.paths.iconSprite.sources).toEqual([
            './src/Acme/ShopUi/src/Acme/Yves/ShopUi/Theme/default/components/atoms/icon-sprite/icon-sprite.twig',
            './src/Acme/Yves/ShopUi/Theme/default/components/atoms/icon-sprite/icon-sprite.twig',
            './src/Pyz/ShopUi/src/Pyz/Yves/ShopUi/Theme/default/components/atoms/icon-sprite/icon-sprite.twig',
            './src/Pyz/Yves/ShopUi/Theme/default/components/atoms/icon-sprite/icon-sprite.twig',
            `./${CORE_THEME}/default/components/atoms/icon-sprite/icon-sprite.twig`,
        ]);
    });

    it('fails naming the file when the SprykerShop namespace holds no single ShopUi theme', () => {
        const context = createContext();
        rmSync(join(context, CORE_THEME), { recursive: true });

        expect(() => applyGeneratedBuildConfiguration(settingsFor(context), generated)).toThrow(
            BUILD_CONFIGURATION_PATH,
        );
        expect(() => applyGeneratedBuildConfiguration(settingsFor(context), generated)).toThrow('paths.coreThemeRoot');
    });

    it('keeps the roots and the core theme root a project settings file changed, after the generated ones', () => {
        const settings = applyGeneratedBuildConfiguration(
            settingsFor(createContext(), {
                paths: { sources: { beta: './src/Beta/Yves' }, coreThemeRoot: './custom/Theme' },
            }),
            generated,
        );

        expect(Object.entries(settings.paths.sources).at(-1)).toEqual(['beta', './src/Beta/Yves']);
        expect(settings.paths.coreThemeRoot).toBe('./custom/Theme');
    });

    it('takes the application entry from every project root, the strongest last', () => {
        const settings = applyGeneratedBuildConfiguration(settingsFor(createContext()), generated);

        expect(getProjectSourceRoots(settings)).toEqual([
            './src/Pyz/Yves',
            './src/Pyz/*/src/Pyz/Yves',
            './src/Acme/Yves',
            './src/Acme/*/src/Acme/Yves',
        ]);
    });
});

describe('the namespace file', () => {
    const NAMESPACE_FILE = 'config/Yves/frontend-build-config.json';
    const namespaceJson = {
        path: 'assets/%SPRYKER_BUILD_HASH%/%theme%',
        staticPath: 'assets/static',
        namespaces: [{ codeBucket: '', namespace: '', themes: ['b2b'], defaultTheme: 'default' }],
    };

    it('adds the theme the backend is configured with to every namespace and sets its default theme', () => {
        const settings = applyGeneratedBuildConfiguration(settingsFor(createContext()), {
            ...generated,
            theme: 'dark',
        });
        const filePath = writeFile(settings.context, NAMESPACE_FILE, namespaceJson);

        expect(resolveNamespaceJson(filePath, settings)).toEqual({
            ...namespaceJson,
            namespaces: [{ codeBucket: '', namespace: '', themes: ['b2b', 'dark'], defaultTheme: 'default' }],
        });
    });

    it('adds nothing when the backend theme is empty, equals the default theme or is listed already', () => {
        const context = createContext();
        const filePath = writeFile(context, NAMESPACE_FILE, namespaceJson);

        ['', 'default', 'b2b'].forEach((theme) => {
            const settings = applyGeneratedBuildConfiguration(settingsFor(context), { ...generated, theme });

            expect(resolveNamespaceJson(filePath, settings).namespaces[0].themes).toEqual(['b2b']);
        });
    });

    it('keeps the file as it is without a backend configuration', () => {
        const settings = settingsFor(createContext());
        const filePath = writeFile(settings.context, NAMESPACE_FILE, namespaceJson);

        expect(resolveNamespaceJson(filePath, settings)).toEqual(namespaceJson);
    });

    it('keeps the public path derived from the URL pattern of the file', () => {
        const settings = applyGeneratedBuildConfiguration(settingsFor(createContext()), generated);
        const filePath = writeFile(settings.context, NAMESPACE_FILE, namespaceJson);

        const [appSettings] = getAppSettings(
            [{ codeBucket: '', namespace: '', themes: ['default'], defaultTheme: 'default' }],
            filePath,
            settings,
        );

        expect(appSettings.urls.assets).toBe('assets/current/default');
        expect(appSettings.paths.public).toBe('public/Yves/assets/current/default');
    });
});
