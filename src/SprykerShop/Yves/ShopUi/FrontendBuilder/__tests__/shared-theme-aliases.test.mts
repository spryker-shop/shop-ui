import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from '@jest/globals';
import {
    applyGeneratedBuildConfiguration,
    defineConfig,
    getSourceRoots,
    sourceLayouts,
    type GeneratedBuildConfiguration,
    type GlobalSettings,
} from '../settings.mts';
import type { PathAliasMap } from '../libs/aliases/alias-provider.mts';
import { createSharedThemeAliasProvider } from '../libs/aliases/shared-theme-aliases.mts';

const sharedThemeAliasProvider = createSharedThemeAliasProvider({
    applicationLayerDirectoryName: 'Yves',
    searchesFlatSharedLayerOfNamespaceRoots: false,
});
const temporaryRoots: string[] = [];

const createRootWith = (directories: string[]): string => {
    const root = mkdtempSync(join(tmpdir(), 'yves-builder-shared-theme-'));
    temporaryRoots.push(root);
    directories.forEach((directory) => mkdirSync(join(root, directory), { recursive: true }));

    return root;
};

const settingsFor = (context: string): GlobalSettings => ({ ...defineConfig(), context });

const projectSettingsFor = (context: string): GlobalSettings => {
    const settings = defineConfig();

    return { ...settings, context, paths: { ...settings.paths, sources: sourceLayouts[1].sources } };
};

const collectAliases = (settings: GlobalSettings): Promise<PathAliasMap> =>
    sharedThemeAliasProvider.collect(getSourceRoots(settings));

afterEach(() => {
    while (temporaryRoots.length > 0) {
        rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
    }
});

describe('the Shared theme aliases', () => {
    const CORE_SHARED_THEME = 'src/SprykerFeature/AiCommerce/src/SprykerFeature/Shared/AiCommerce/Theme/default';
    const PROJECT_SHARED_THEME = 'src/Pyz/AiCommerce/src/Pyz/Shared/AiCommerce/Theme/default';
    const VENDOR_SHARED_THEME = 'vendor/spryker-feature/ai-commerce/src/SprykerFeature/Shared/AiCommerce/Theme/default';
    const FLAT_PROJECT_SHARED_THEME = 'src/Pyz/Shared/AiCommerce/Theme/default';

    it('lists the project Shared theme before the core one, so a project file shadows the core file', async () => {
        const aliases = await collectAliases(settingsFor(createRootWith([CORE_SHARED_THEME, PROJECT_SHARED_THEME])));

        expect(aliases['@shared/ai-commerce/*']).toEqual([`./${PROJECT_SHARED_THEME}/*`, `./${CORE_SHARED_THEME}/*`]);
    });

    it('lists only the core Shared theme for a module the project does not shadow', async () => {
        const aliases = await collectAliases(settingsFor(createRootWith([CORE_SHARED_THEME])));

        expect(aliases['@shared/ai-commerce/*']).toEqual([`./${CORE_SHARED_THEME}/*`]);
    });

    it('gives a project-only module its project directory only', async () => {
        const aliases = await collectAliases(settingsFor(createRootWith([PROJECT_SHARED_THEME])));

        expect(aliases).toEqual({ '@shared/ai-commerce/*': [`./${PROJECT_SHARED_THEME}/*`] });
    });

    it('finds the project Shared theme beside a source root that ends in the Yves layer', async () => {
        const aliases = await collectAliases(
            projectSettingsFor(createRootWith([VENDOR_SHARED_THEME, FLAT_PROJECT_SHARED_THEME])),
        );

        expect(aliases['@shared/ai-commerce/*']).toEqual([
            `./${FLAT_PROJECT_SHARED_THEME}/*`,
            `./${VENDOR_SHARED_THEME}/*`,
        ]);
    });

    // A root set by a settings file to the namespace directory itself is searched only in the per-module
    // shape, while the Back Office builder searches such a root in the flat Shared/<Module> shape as well.
    it('a flat Shared theme directly under a namespace root that does not end in the Yves layer is not discovered (documented gap)', async () => {
        const settings = settingsFor(createRootWith([CORE_SHARED_THEME, FLAT_PROJECT_SHARED_THEME]));

        const aliases = await collectAliases({
            ...settings,
            paths: { ...settings.paths, sources: { ...settings.paths.sources, project: './src/Pyz' } },
        });

        expect(aliases['@shared/ai-commerce/*']).toEqual([`./${CORE_SHARED_THEME}/*`]);
    });

    it('emits no Shared alias for a module that ships only a Yves theme', async () => {
        const aliases = await collectAliases(
            settingsFor(createRootWith(['src/SprykerShop/CartPage/src/SprykerShop/Yves/CartPage/Theme/default'])),
        );

        expect(aliases).toEqual({});
    });

    it('owns the @shared alias names only', () => {
        expect(sharedThemeAliasProvider.ownsAliasName('@shared/ai-commerce/*')).toBe(true);
        expect(sharedThemeAliasProvider.ownsAliasName('ShopUi/*')).toBe(false);
    });
});

describe('the Shared theme aliases of the backend project namespaces', () => {
    const CORE_SHARED_THEME = 'src/SprykerFeature/AiCommerce/src/SprykerFeature/Shared/AiCommerce/Theme/default';
    const SECOND_CORE_SHARED_THEME = 'src/SprykerEco/AiCommerce/src/SprykerEco/Shared/AiCommerce/Theme/default';
    const ACME_SHARED_THEME = 'src/Acme/Shared/AiCommerce/Theme/default';
    const PYZ_SHARED_THEME = 'src/Pyz/Shared/AiCommerce/Theme/default';
    // Applying the generated file locates the core ShopUi theme, so it has to exist.
    const CORE_SHOP_UI_THEME_ROOT = 'src/SprykerShop/ShopUi/src/SprykerShop/Yves/ShopUi/Theme';

    // The directories exist before the generated file is applied, which picks src/ over vendor/ by what exists.
    const generatedSettingsFor = (
        sharedThemeDirectories: string[],
        generated: Partial<GeneratedBuildConfiguration>,
    ): GlobalSettings =>
        applyGeneratedBuildConfiguration(
            settingsFor(createRootWith([CORE_SHOP_UI_THEME_ROOT, ...sharedThemeDirectories])),
            {
                coreNamespaces: ['SprykerShop', 'SprykerFeature'],
                projectNamespaces: ['Pyz'],
                ...generated,
            },
        );

    it('lists the Shared theme of a project namespace other than Pyz before the core one', async () => {
        const aliases = await collectAliases(
            generatedSettingsFor([CORE_SHARED_THEME, ACME_SHARED_THEME], { projectNamespaces: ['Acme'] }),
        );

        expect(aliases['@shared/ai-commerce/*']).toEqual([`./${ACME_SHARED_THEME}/*`, `./${CORE_SHARED_THEME}/*`]);
    });

    it.each([
        [
            ['Acme', 'Pyz'],
            [ACME_SHARED_THEME, PYZ_SHARED_THEME],
        ],
        [
            ['Pyz', 'Acme'],
            [PYZ_SHARED_THEME, ACME_SHARED_THEME],
        ],
    ])(
        'orders the project Shared themes as the backend lists the namespaces %j, strongest first, core last',
        async (projectNamespaces, expectedProjectDirectories) => {
            const aliases = await collectAliases(
                generatedSettingsFor([CORE_SHARED_THEME, ACME_SHARED_THEME, PYZ_SHARED_THEME], { projectNamespaces }),
            );

            expect(aliases['@shared/ai-commerce/*']).toEqual(
                [...expectedProjectDirectories, CORE_SHARED_THEME].map((directory) => `./${directory}/*`),
            );
        },
    );

    it('fails naming both directories when two core namespaces ship the Shared theme of one module', async () => {
        const settings = generatedSettingsFor([CORE_SHARED_THEME, SECOND_CORE_SHARED_THEME], {
            coreNamespaces: ['SprykerShop', 'SprykerFeature', 'SprykerEco'],
        });

        const failure = await collectAliases(settings).then(
            () => null,
            (error: unknown) => error,
        );

        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toContain(join(settings.context, CORE_SHARED_THEME));
        expect((failure as Error).message).toContain(join(settings.context, SECOND_CORE_SHARED_THEME));
        expect((failure as Error).message).toContain('exists in two core source roots');
        expect((failure as Error).message).toContain('KernelConstants::PROJECT_NAMESPACES');
    });
});
