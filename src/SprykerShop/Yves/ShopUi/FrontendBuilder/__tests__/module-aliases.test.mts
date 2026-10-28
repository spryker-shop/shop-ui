import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from '@jest/globals';
import {
    applyGeneratedBuildConfiguration,
    defineConfig,
    getSourceRoots,
    sourceLayouts,
    type GlobalSettings,
} from '../settings.mts';
import type { PathAliasMap } from '../libs/aliases/alias-provider.mts';
import { moduleAliasProvider } from '../libs/aliases/module-aliases.mts';

const CORE_SHOP_UI_THEME = 'vendor/spryker-shop/shop-ui/src/SprykerShop/Yves/ShopUi/Theme/default';
const PROJECT_SHOP_UI_THEME = 'src/Pyz/Yves/ShopUi/Theme/default';
const temporaryRoots: string[] = [];

const createRoot = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'yves-builder-module-aliases-'));
    temporaryRoots.push(root);

    return root;
};

const writeSource = (context: string, relativePath: string, content: string): void => {
    mkdirSync(dirname(join(context, relativePath)), { recursive: true });
    writeFileSync(join(context, relativePath), content);
};

const settingsFor = (context: string): GlobalSettings => ({ ...defineConfig(), context });

const projectSettingsFor = (context: string): GlobalSettings => {
    const settings = defineConfig();

    return { ...settings, context, paths: { ...settings.paths, sources: sourceLayouts[1].sources } };
};

const collectAliases = (settings: GlobalSettings): Promise<PathAliasMap> =>
    moduleAliasProvider.collect(getSourceRoots(settings));

// A project whose ShopUi theme imports the core ShopUi theme and one of its own project components.
const createProjectWithThemeImports = (): string => {
    const context = createRoot();
    writeSource(context, `${CORE_SHOP_UI_THEME}/models/component.ts`, 'export default class Component {}\n');
    writeSource(
        context,
        `${PROJECT_SHOP_UI_THEME}/components/molecules/teaser/teaser.ts`,
        "import Component from 'ShopUi/models/component';\nimport Title from 'src/ShopUi/components/atoms/title/title';\n",
    );

    return context;
};

afterEach(() => {
    while (temporaryRoots.length > 0) {
        rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
    }
});

describe('the theme aliases', () => {
    it('points a core module alias at the core theme in vendor/ in the project layout', async () => {
        const aliases = await collectAliases(projectSettingsFor(createProjectWithThemeImports()));

        expect(aliases['ShopUi/*']).toEqual([`./${CORE_SHOP_UI_THEME}/*`]);
    });

    it('addresses the project theme as src/<Module>, so the core module keeps its own alias', async () => {
        const aliases = await collectAliases(projectSettingsFor(createProjectWithThemeImports()));

        expect(aliases['src/ShopUi/*']).toEqual([`./${PROJECT_SHOP_UI_THEME}/*`]);
    });

    it('finds a module imported lazily with bundler comments between import( and a string on the next line', async () => {
        const context = createProjectWithThemeImports();
        writeSource(
            context,
            'vendor/spryker-shop/multi-cart-widget/src/SprykerShop/Yves/MultiCartWidget/Theme/default/.keep',
            '',
        );
        writeSource(
            context,
            `${PROJECT_SHOP_UI_THEME}/app/registry.ts`,
            'register(\'mini-cart-radio\', () =>\n    import(\n        /* webpackMode: "lazy" */\n        /* webpackChunkName: "mini-cart-radio" */\n        \'MultiCartWidget/components/molecules/mini-cart-radio/mini-cart-radio\'\n    ),\n);\n',
        );

        const aliases = await collectAliases(projectSettingsFor(context));

        expect(aliases['MultiCartWidget/*']).toEqual([
            './vendor/spryker-shop/multi-cart-widget/src/SprykerShop/Yves/MultiCartWidget/Theme/default/*',
        ]);
    });

    it('finds core and project modules imported through double-quoted strings', async () => {
        const context = createProjectWithThemeImports();
        writeSource(
            context,
            'vendor/spryker-shop/product-set-widget/src/SprykerShop/Yves/ProductSetWidget/Theme/default/.keep',
            '',
        );
        writeSource(context, 'src/Pyz/Yves/ProductImageWidget/Theme/default/.keep', '');
        writeSource(
            context,
            `${PROJECT_SHOP_UI_THEME}/app/double-quoted.ts`,
            'import "ProductSetWidget/styles/set";\nimport "src/ProductImageWidget/components/gallery/gallery";\n',
        );

        const aliases = await collectAliases(projectSettingsFor(context));

        expect(aliases).toHaveProperty('ProductSetWidget/*');
        expect(aliases).toHaveProperty('src/ProductImageWidget/*');
    });

    it('emits no project alias for a project theme nothing imports through src/<Module>', async () => {
        const context = createProjectWithThemeImports();
        writeSource(context, 'src/Pyz/Yves/CompanyWidget/Theme/default/components/atoms/logo/logo.ts', '');

        const aliases = await collectAliases(projectSettingsFor(context));

        expect(aliases).not.toHaveProperty('src/CompanyWidget/*');
    });

    it('emits no project alias for an imported src/<Module> whose project theme does not exist', async () => {
        const context = createProjectWithThemeImports();
        writeSource(context, `${PROJECT_SHOP_UI_THEME}/styles/basic.scss`, "@use 'src/MissingWidget/styles/shared';\n");

        const aliases = await collectAliases(projectSettingsFor(context));

        expect(aliases).not.toHaveProperty('src/MissingWidget/*');
    });

    it('finds the project theme under the per-module project tree of the monorepo layout', async () => {
        const context = createRoot();
        const monorepoProjectTheme = 'src/Pyz/ShopUi/src/Pyz/Yves/ShopUi/Theme/default';
        writeSource(context, `${monorepoProjectTheme}/components/atoms/title/title.ts`, '');
        writeSource(
            context,
            'src/SprykerShop/CartPage/src/SprykerShop/Yves/CartPage/Theme/default/views/cart/cart.scss',
            "@import 'src/ShopUi/components/atoms/title/title';\n",
        );

        const aliases = await collectAliases(settingsFor(context));

        expect(aliases['src/ShopUi/*']).toEqual([`./${monorepoProjectTheme}/*`]);
    });

    it('owns every wildcard alias name, because a module alias is named after whatever a theme imports', () => {
        expect(moduleAliasProvider.ownsAliasName('ShopUi/*')).toBe(true);
        expect(moduleAliasProvider.ownsAliasName('src/ShopUi/*')).toBe(true);
        expect(moduleAliasProvider.ownsAliasName('jquery')).toBe(false);
    });
});

describe('the theme aliases of the backend project namespaces', () => {
    // Applying the generated file locates the core ShopUi theme, so it has to exist.
    const CORE_SHOP_UI_THEME_ROOT = 'src/SprykerShop/ShopUi/src/SprykerShop/Yves/ShopUi/Theme';

    it('addresses the Yves theme of a project namespace other than Pyz as src/<Module>, never as the core module', async () => {
        const context = createRoot();
        mkdirSync(join(context, CORE_SHOP_UI_THEME_ROOT), { recursive: true });
        writeSource(
            context,
            'src/Acme/Yves/ShopUi/Theme/default/components/molecules/teaser/teaser.ts',
            "import Title from 'src/ShopUi/components/atoms/title/title';\nimport Component from 'ShopUi/models/component';\n",
        );

        const aliases = await collectAliases(
            applyGeneratedBuildConfiguration(settingsFor(context), {
                coreNamespaces: ['SprykerShop', 'SprykerFeature'],
                projectNamespaces: ['Acme'],
            }),
        );

        expect(aliases['src/ShopUi/*']).toEqual(['./src/Acme/Yves/ShopUi/Theme/default/*']);
        expect(aliases).not.toHaveProperty('ShopUi/*');
    });
});
