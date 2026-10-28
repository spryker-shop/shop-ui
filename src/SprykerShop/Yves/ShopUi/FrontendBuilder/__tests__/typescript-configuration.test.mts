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

    it('includes the Yves themes, the Shared themes and the reload client of the monorepo layout', async () => {
        const { configuration } = await reconcileYvesConfiguration(settingsFor(createMonorepoRoot()));

        expect(configuration.include).toEqual([
            `${BUILDER_LADDER}/src/SprykerShop/**/Yves/**/Theme/**/*.ts`,
            `${BUILDER_LADDER}/src/Spryker/**/Yves/**/Theme/**/*.ts`,
            `${BUILDER_LADDER}/vendor/spryker-eco/**/Yves/**/Theme/**/*.ts`,
            `${BUILDER_LADDER}/src/SprykerFeature/**/Yves/**/Theme/**/*.ts`,
            `${BUILDER_LADDER}/src/Pyz/*/src/Pyz/Yves/**/Theme/**/*.ts`,
            `${BUILDER_LADDER}/src/SprykerShop/*/src/*/Shared/*/Theme/default/**/*.ts`,
            `${BUILDER_LADDER}/src/Spryker/*/src/*/Shared/*/Theme/default/**/*.ts`,
            `${BUILDER_LADDER}/vendor/spryker-eco/*/src/*/Shared/*/Theme/default/**/*.ts`,
            `${BUILDER_LADDER}/src/SprykerFeature/*/src/*/Shared/*/Theme/default/**/*.ts`,
            `${BUILDER_LADDER}/src/Pyz/*/src/Pyz/Shared/*/Theme/default/**/*.ts`,
            `${BUILDER_LADDER}/${BUILDER_DIRECTORY}/libs/reload/client/**/*.ts`,
        ]);
    });

    it('includes the Yves themes, the Shared themes and the reload client of the project layout', async () => {
        const { configuration } = await reconcileYvesConfiguration(projectSettingsFor(createProjectRoot()));

        expect(configuration.include).toEqual([
            `${BUILDER_LADDER}/vendor/spryker-shop/**/Yves/**/Theme/**/*.ts`,
            `${BUILDER_LADDER}/vendor/spryker/**/Yves/**/Theme/**/*.ts`,
            `${BUILDER_LADDER}/vendor/spryker-eco/**/Yves/**/Theme/**/*.ts`,
            `${BUILDER_LADDER}/vendor/spryker-feature/**/Yves/**/Theme/**/*.ts`,
            `${BUILDER_LADDER}/src/Pyz/Yves/**/Theme/**/*.ts`,
            `${BUILDER_LADDER}/vendor/spryker-shop/*/src/*/Shared/*/Theme/default/**/*.ts`,
            `${BUILDER_LADDER}/vendor/spryker/*/src/*/Shared/*/Theme/default/**/*.ts`,
            `${BUILDER_LADDER}/vendor/spryker-eco/*/src/*/Shared/*/Theme/default/**/*.ts`,
            `${BUILDER_LADDER}/vendor/spryker-feature/*/src/*/Shared/*/Theme/default/**/*.ts`,
            `${BUILDER_LADDER}/src/Pyz/Shared/*/Theme/default/**/*.ts`,
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

describe('the aliases', () => {
    const VENDOR_SHARED_THEME = 'vendor/spryker-feature/ai-commerce/src/SprykerFeature/Shared/AiCommerce/Theme/default';
    const CORE_SHARED_THEME = 'src/SprykerFeature/AiCommerce/src/SprykerFeature/Shared/AiCommerce/Theme/default';

    it('writes the aliases of every provider relative to the Yves configuration', async () => {
        const context = createProjectWithThemeImports();
        writeSource(context, `${VENDOR_SHARED_THEME}/Chat/index.ts`, '');

        const { configuration } = await reconcileYvesConfiguration(projectSettingsFor(context));
        const paths = configuration.compilerOptions!.paths!;

        expect(paths['ShopUi/*']).toEqual([`${BUILDER_LADDER}/${CORE_SHOP_UI_THEME}/*`]);
        expect(paths['src/ShopUi/*']).toEqual([`${BUILDER_LADDER}/${PROJECT_SHOP_UI_THEME}/*`]);
        expect(paths['@shared/ai-commerce/*']).toEqual([`${BUILDER_LADDER}/${VENDOR_SHARED_THEME}/*`]);
    });

    it('replaces a stale Shared alias instead of keeping it as a hand-written one', async () => {
        const context = createMonorepoRoot();
        writeSource(context, `${CORE_SHARED_THEME}/Chat/index.ts`, '');
        writeBuildConfiguration(context, {
            compilerOptions: {
                paths: {
                    '@shared/ai-commerce/*': [`${BUILDER_LADDER}/src/Pyz/Removed/Theme/default/*`],
                    '@shared/removed-module/*': [`${BUILDER_LADDER}/src/Pyz/Removed/Theme/default/*`],
                },
            },
        });

        const { configuration } = await reconcileYvesConfiguration(settingsFor(context));

        expect(configuration.compilerOptions!.paths!['@shared/ai-commerce/*']).toEqual([
            `${BUILDER_LADDER}/${CORE_SHARED_THEME}/*`,
        ]);
        expect(configuration.compilerOptions!.paths).not.toHaveProperty('@shared/removed-module/*');
    });
});

describe('a custom project namespace', () => {
    const CUSTOM_NAMESPACE_ROOT = './src/Acme/Yves';

    const namespacedSettingsFor = (context: string, sources: Record<string, string>): GlobalSettings => {
        const settings = projectSettingsFor(context);

        return { ...settings, paths: { ...settings.paths, sources: { ...settings.paths.sources, ...sources } } };
    };

    it('type-checks the themes of Pyz and of a namespace registered next to it', async () => {
        const { configuration } = await reconcileYvesConfiguration(
            namespacedSettingsFor(createProjectRoot(), { acme: CUSTOM_NAMESPACE_ROOT }),
        );

        expect(configuration.include).toEqual(
            expect.arrayContaining([
                `${BUILDER_LADDER}/src/Pyz/Yves/**/Theme/**/*.ts`,
                `${BUILDER_LADDER}/src/Acme/Yves/**/Theme/**/*.ts`,
            ]),
        );
    });

    it('type-checks the Shared themes of Pyz and of a namespace registered next to it', async () => {
        const { configuration } = await reconcileYvesConfiguration(
            namespacedSettingsFor(createProjectRoot(), { acme: CUSTOM_NAMESPACE_ROOT }),
        );

        expect(configuration.include).toEqual(
            expect.arrayContaining([
                `${BUILDER_LADDER}/src/Pyz/Shared/*/Theme/default/**/*.ts`,
                `${BUILDER_LADDER}/src/Acme/Shared/*/Theme/default/**/*.ts`,
            ]),
        );
    });

    it('keeps the core alias of a module whose theme a namespace registered next to Pyz also ships', async () => {
        const context = createProjectWithThemeImports();
        writeSource(context, 'src/Acme/Yves/ShopUi/Theme/default/components/atoms/badge/badge.ts', 'export {};\n');

        const { configuration } = await reconcileYvesConfiguration(
            namespacedSettingsFor(context, { acme: CUSTOM_NAMESPACE_ROOT }),
        );

        expect(configuration.compilerOptions!.paths!['ShopUi/*']).toEqual([
            `${BUILDER_LADDER}/${CORE_SHOP_UI_THEME}/*`,
        ]);
    });

    it('drops every Pyz include once the namespace replaces Pyz under the project key', async () => {
        const { configuration } = await reconcileYvesConfiguration(
            namespacedSettingsFor(createProjectRoot(), { project: CUSTOM_NAMESPACE_ROOT }),
        );

        expect(configuration.include!.some((entry) => entry.includes('/src/Pyz/'))).toBe(false);
        expect(configuration.include).toContain(`${BUILDER_LADDER}/src/Acme/Yves/**/Theme/**/*.ts`);
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
