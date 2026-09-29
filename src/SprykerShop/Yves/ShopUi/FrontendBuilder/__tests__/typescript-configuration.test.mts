import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { defineConfig, sourceLayouts, type GlobalSettings } from '../settings.mts';
import {
    DEFAULTS_CONFIGURATION_FILE_NAME,
    YVES_CONFIGURATION_FILE_NAME,
    reconcileDefaultsConfiguration,
    reconcileProjectSolution,
    reconcileYvesConfiguration,
} from '../libs/typescript/typescript-configuration.mts';
import { applySolutionReconciliation } from '../libs/typescript/update-configuration.mts';

const BUILDER_DIRECTORY = 'src/SprykerShop/ShopUi/src/SprykerShop/Yves/ShopUi/FrontendBuilder';
const PROJECT_BUILDER_DIRECTORY = 'vendor/spryker-shop/shop-ui/src/SprykerShop/Yves/ShopUi/FrontendBuilder';
const BUILDER_LADDER = '../../../../../../../..';
const BUILD_REFERENCE = `./${BUILDER_DIRECTORY}/${YVES_CONFIGURATION_FILE_NAME}`;
const PROJECT_BUILD_REFERENCE = `./${PROJECT_BUILDER_DIRECTORY}/${YVES_CONFIGURATION_FILE_NAME}`;
const temporaryRoots: string[] = [];

const createRoot = (builderDirectory: string): string => {
    const root = mkdtempSync(join(tmpdir(), 'yves-builder-tsconfig-'));
    temporaryRoots.push(root);
    mkdirSync(join(root, builderDirectory), { recursive: true });

    return root;
};

const createMonorepoRoot = (): string => createRoot(BUILDER_DIRECTORY);

const createProjectRoot = (): string => createRoot(PROJECT_BUILDER_DIRECTORY);

const settingsFor = (context: string): GlobalSettings => ({ ...defineConfig(), context });

const projectSettingsFor = (context: string): GlobalSettings => {
    const settings = defineConfig();

    return { ...settings, context, paths: { ...settings.paths, sources: sourceLayouts[1].sources } };
};

const writeJson = (filePath: string, content: unknown): void => {
    writeFileSync(filePath, `${JSON.stringify(content, null, 4)}\n`);
};

const writeSource = (context: string, relativePath: string, content: string): void => {
    mkdirSync(dirname(join(context, relativePath)), { recursive: true });
    writeFileSync(join(context, relativePath), content);
};

const CORE_SHOP_UI_THEME = 'vendor/spryker-shop/shop-ui/src/SprykerShop/Yves/ShopUi/Theme/default';
const PROJECT_SHOP_UI_THEME = 'src/Pyz/Yves/ShopUi/Theme/default';

// A project whose ShopUi theme imports the core ShopUi theme and one of its own project components.
const createProjectWithThemeImports = (): string => {
    const context = createProjectRoot();
    writeSource(context, `${CORE_SHOP_UI_THEME}/models/component.ts`, 'export default class Component {}\n');
    writeSource(
        context,
        `${PROJECT_SHOP_UI_THEME}/components/molecules/teaser/teaser.ts`,
        "import Component from 'ShopUi/models/component';\nimport Title from 'src/ShopUi/components/atoms/title/title';\n",
    );

    return context;
};

const writeBuildConfiguration = (context: string, content: unknown): void => {
    writeJson(join(context, BUILDER_DIRECTORY, YVES_CONFIGURATION_FILE_NAME), content);
};

afterEach(() => {
    while (temporaryRoots.length > 0) {
        rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
    }
});

describe('the builder-owned defaults', () => {
    it.each([
        ['monorepo', createMonorepoRoot, settingsFor, BUILDER_DIRECTORY],
        ['project', createProjectRoot, projectSettingsFor, PROJECT_BUILDER_DIRECTORY],
    ])(
        'sits next to the Yves configuration and climbs back to the project root in the %s layout',
        (_layoutName, createLayoutRoot, settingsOf, builderDirectory) => {
            const context = createLayoutRoot();

            const { filePath, configuration } = reconcileDefaultsConfiguration(settingsOf(context));

            expect(filePath).toBe(join(context, builderDirectory, DEFAULTS_CONFIGURATION_FILE_NAME));
            expect(configuration.compilerOptions!.rootDir).toBe(BUILDER_LADDER);
            expect(configuration.compilerOptions!.typeRoots).toEqual([`${BUILDER_LADDER}/node_modules/@types`]);
            expect(configuration.compilerOptions!.paths).toBeUndefined();
        },
    );

    it('prefixes every exclude entry with the ladder, the unanchored ones included', () => {
        const { configuration } = reconcileDefaultsConfiguration(settingsFor(createMonorepoRoot()));

        expect(configuration.exclude).toEqual([
            `${BUILDER_LADDER}/**/node_modules/**`,
            `${BUILDER_LADDER}/**/*.spec.ts`,
            `${BUILDER_LADDER}/**/*.test.ts`,
            `${BUILDER_LADDER}/public`,
            `${BUILDER_LADDER}/dist`,
            `${BUILDER_LADDER}/**/dist/**`,
            `${BUILDER_LADDER}/**/FrontendBuilder/__tests__/**`,
        ]);
    });
});

describe('the Yves configuration', () => {
    it.each([
        ['monorepo', createMonorepoRoot, settingsFor, BUILDER_DIRECTORY],
        ['project', createProjectRoot, projectSettingsFor, PROJECT_BUILDER_DIRECTORY],
    ])(
        'is written into the builder of the %s layout',
        async (_layoutName, createLayoutRoot, settingsOf, builderDirectory) => {
            const context = createLayoutRoot();

            const { filePath } = await reconcileYvesConfiguration(settingsOf(context));

            expect(filePath).toBe(join(context, builderDirectory, YVES_CONFIGURATION_FILE_NAME));
        },
    );

    it('extends the builder defaults first and the project root last, so project options win', async () => {
        const { configuration } = await reconcileYvesConfiguration(settingsFor(createMonorepoRoot()));

        expect(configuration.extends).toEqual([
            `./${DEFAULTS_CONFIGURATION_FILE_NAME}`,
            `${BUILDER_LADDER}/tsconfig.json`,
        ]);
    });

    it('keeps only the generated paths inline', async () => {
        const { configuration } = await reconcileYvesConfiguration(settingsFor(createMonorepoRoot()));

        expect(Object.keys(configuration.compilerOptions!)).toEqual(['paths']);
    });

    it('includes only the Yves themes and the reload client of the monorepo layout', async () => {
        const { configuration } = await reconcileYvesConfiguration(settingsFor(createMonorepoRoot()));

        expect(configuration.include).toEqual([
            `${BUILDER_LADDER}/src/SprykerShop/**/Yves/**/Theme/**/*.ts`,
            `${BUILDER_LADDER}/src/Spryker/**/Yves/**/Theme/**/*.ts`,
            `${BUILDER_LADDER}/vendor/spryker-eco/**/Yves/**/Theme/**/*.ts`,
            `${BUILDER_LADDER}/src/SprykerFeature/**/Yves/**/Theme/**/*.ts`,
            `${BUILDER_LADDER}/src/Pyz/*/src/Pyz/Yves/**/Theme/**/*.ts`,
            `${BUILDER_LADDER}/${BUILDER_DIRECTORY}/libs/reload/client/**/*.ts`,
        ]);
    });

    it('includes only the Yves themes and the reload client of the project layout', async () => {
        const { configuration } = await reconcileYvesConfiguration(projectSettingsFor(createProjectRoot()));

        expect(configuration.include).toEqual([
            `${BUILDER_LADDER}/vendor/spryker-shop/**/Yves/**/Theme/**/*.ts`,
            `${BUILDER_LADDER}/vendor/spryker/**/Yves/**/Theme/**/*.ts`,
            `${BUILDER_LADDER}/vendor/spryker-eco/**/Yves/**/Theme/**/*.ts`,
            `${BUILDER_LADDER}/vendor/spryker-feature/**/Yves/**/Theme/**/*.ts`,
            `${BUILDER_LADDER}/src/Pyz/Yves/**/Theme/**/*.ts`,
            `${BUILDER_LADDER}/${PROJECT_BUILDER_DIRECTORY}/libs/reload/client/**/*.ts`,
        ]);
    });

    it('replaces an include entry the other layout wrote and keeps one the project added', async () => {
        const context = createMonorepoRoot();
        writeBuildConfiguration(context, {
            extends: [`./${DEFAULTS_CONFIGURATION_FILE_NAME}`, `${BUILDER_LADDER}/tsconfig.json`],
            include: [`${BUILDER_LADDER}/src/Pyz/Yves/**/Theme/**/*.ts`, `${BUILDER_LADDER}/src/Pyz/Custom/**/*.ts`],
        });

        const { configuration } = await reconcileYvesConfiguration(settingsFor(context));

        expect(configuration.include).not.toContain(`${BUILDER_LADDER}/src/Pyz/Yves/**/Theme/**/*.ts`);
        expect(configuration.include).toContain(`${BUILDER_LADDER}/src/Pyz/Custom/**/*.ts`);
    });
});

describe('the theme aliases', () => {
    it('points a core module alias at the core theme in vendor/ in the project layout', async () => {
        const { configuration } = await reconcileYvesConfiguration(projectSettingsFor(createProjectWithThemeImports()));

        expect(configuration.compilerOptions!.paths!['ShopUi/*']).toEqual([
            `${BUILDER_LADDER}/${CORE_SHOP_UI_THEME}/*`,
        ]);
    });

    it('addresses the project theme as src/<Module>, so the core module keeps its own alias', async () => {
        const { configuration } = await reconcileYvesConfiguration(projectSettingsFor(createProjectWithThemeImports()));

        expect(configuration.compilerOptions!.paths!['src/ShopUi/*']).toEqual([
            `${BUILDER_LADDER}/${PROJECT_SHOP_UI_THEME}/*`,
        ]);
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

        const { configuration } = await reconcileYvesConfiguration(projectSettingsFor(context));

        expect(configuration.compilerOptions!.paths!['MultiCartWidget/*']).toEqual([
            `${BUILDER_LADDER}/vendor/spryker-shop/multi-cart-widget/src/SprykerShop/Yves/MultiCartWidget/Theme/default/*`,
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

        const { configuration } = await reconcileYvesConfiguration(projectSettingsFor(context));

        expect(configuration.compilerOptions!.paths).toHaveProperty('ProductSetWidget/*');
        expect(configuration.compilerOptions!.paths).toHaveProperty('src/ProductImageWidget/*');
    });

    it('emits no project alias for a project theme nothing imports through src/<Module>', async () => {
        const context = createProjectWithThemeImports();
        writeSource(context, 'src/Pyz/Yves/CompanyWidget/Theme/default/components/atoms/logo/logo.ts', '');

        const { configuration } = await reconcileYvesConfiguration(projectSettingsFor(context));

        expect(configuration.compilerOptions!.paths).not.toHaveProperty('src/CompanyWidget/*');
    });

    it('emits no project alias for an imported src/<Module> whose project theme does not exist', async () => {
        const context = createProjectWithThemeImports();
        writeSource(context, `${PROJECT_SHOP_UI_THEME}/styles/basic.scss`, "@use 'src/MissingWidget/styles/shared';\n");

        const { configuration } = await reconcileYvesConfiguration(projectSettingsFor(context));

        expect(configuration.compilerOptions!.paths).not.toHaveProperty('src/MissingWidget/*');
    });

    it('finds the project theme under the per-module project tree of the monorepo layout', async () => {
        const context = createMonorepoRoot();
        const monorepoProjectTheme = 'src/Pyz/ShopUi/src/Pyz/Yves/ShopUi/Theme/default';
        writeSource(context, `${monorepoProjectTheme}/components/atoms/title/title.ts`, '');
        writeSource(
            context,
            'src/SprykerShop/CartPage/src/SprykerShop/Yves/CartPage/Theme/default/views/cart/cart.scss',
            "@import 'src/ShopUi/components/atoms/title/title';\n",
        );

        const { configuration } = await reconcileYvesConfiguration(settingsFor(context));

        expect(configuration.compilerOptions!.paths!['src/ShopUi/*']).toEqual([
            `${BUILDER_LADDER}/${monorepoProjectTheme}/*`,
        ]);
    });
});

describe('an existing Yves configuration', () => {
    it('gets the generated extends list on every run and keeps every compiler option', async () => {
        const context = createMonorepoRoot();
        writeBuildConfiguration(context, {
            extends: `${BUILDER_LADDER}/tsconfig.json`,
            compilerOptions: { noUnusedLocals: true, paths: {} },
        });

        const { configuration } = await reconcileYvesConfiguration(settingsFor(context));
        const { paths, ...compilerOptions } = configuration.compilerOptions!;

        expect(configuration.extends).toEqual([
            `./${DEFAULTS_CONFIGURATION_FILE_NAME}`,
            `${BUILDER_LADDER}/tsconfig.json`,
        ]);
        expect(compilerOptions).toEqual({ noUnusedLocals: true });
        expect(paths).toBeDefined();
    });

    it('does not rewrite the extends of a copy the project keeps in its root', async () => {
        const context = createMonorepoRoot();
        writeJson(join(context, YVES_CONFIGURATION_FILE_NAME), { extends: './tsconfig.json', compilerOptions: {} });

        const { configuration } = await reconcileYvesConfiguration(settingsFor(context));

        expect(configuration.extends).toBe('./tsconfig.json');
    });
});

describe('the project root solution file', () => {
    it('is created with a reference to the Yves configuration when the root has no tsconfig.json', () => {
        const reconciliation = reconcileProjectSolution(projectSettingsFor(createProjectRoot()));

        expect(reconciliation).toMatchObject({
            status: 'created',
            configuration: { files: [], references: [{ path: PROJECT_BUILD_REFERENCE }] },
        });
    });

    it('gains the reference after the ones another builder added, without duplicating it', () => {
        const context = createMonorepoRoot();
        writeJson(join(context, 'tsconfig.json'), { files: [], references: [{ path: './other/tsconfig.json' }] });

        const firstReconciliation = reconcileProjectSolution(settingsFor(context));

        expect(firstReconciliation).toMatchObject({
            status: 'updated',
            configuration: { references: [{ path: './other/tsconfig.json' }, { path: BUILD_REFERENCE }] },
        });
        writeJson(join(context, 'tsconfig.json'), (firstReconciliation as { configuration: unknown }).configuration);
        expect(reconcileProjectSolution(settingsFor(context)).status).toBe('unchanged');
    });

    it('replaces, in place, the reference the other source layout wrote', () => {
        const context = createMonorepoRoot();
        writeJson(join(context, 'tsconfig.json'), {
            files: [],
            references: [{ path: PROJECT_BUILD_REFERENCE }, { path: './other/tsconfig.json' }],
        });

        expect(reconcileProjectSolution(settingsFor(context))).toMatchObject({
            configuration: { references: [{ path: BUILD_REFERENCE }, { path: './other/tsconfig.json' }] },
        });
    });

    it('leaves a complete root configuration byte-identical and says how to add the reference', () => {
        const context = createMonorepoRoot();
        const rootConfiguration = '{\n  "compilerOptions": { "strict": true },\n  "include": ["src"]\n}\n';
        writeFileSync(join(context, 'tsconfig.json'), rootConfiguration);
        const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);

        applySolutionReconciliation(context, reconcileProjectSolution(settingsFor(context)));

        expect(readFileSync(join(context, 'tsconfig.json'), 'utf8')).toBe(rootConfiguration);
        expect(String(log.mock.calls[0][0])).toContain(join(context, 'tsconfig.json'));
        expect(String(log.mock.calls[0][0])).toContain('complete TypeScript configuration');
        expect(String(log.mock.calls[0][0])).toContain(BUILD_REFERENCE);
        log.mockRestore();
    });
});
