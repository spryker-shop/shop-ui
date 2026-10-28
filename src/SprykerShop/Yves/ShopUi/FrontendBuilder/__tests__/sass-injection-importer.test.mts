import { afterEach, describe, it, expect } from '@jest/globals';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    createSassInjectionImporterFactory,
    isInjectableComponentPath,
} from '../libs/sass/sass-injection-importer.mts';
import { resolveLoadRequest, resolveThroughAliasTargets } from '../libs/sass/sass-path-resolution.mts';
import { createInjectionCompiler, fixturePath, shopUiAliasList } from './helpers/compile-fixture.mts';

describe('shared and built-in injection into a boilerplate-free component (plan item 1)', () => {
    it('resolves shared settings, a shared helper function, and a namespaced built-in in one component file', async () => {
        const { compile } = createInjectionCompiler({ aliasList: shopUiAliasList('core-component') });

        const result = await compile(
            "@use './MyModule/Theme/fixture/components/atoms/badge/badge.scss' as *; .test { @include my-badge; }",
            fixturePath('core-component', 'root.scss'),
        );
        const css = result.css.toString();

        // map.get (built-in), the shared $setting-color-main, and helper-color-shade all resolve
        // although badge.scss carries no @use lines of its own.
        expect(css).toContain('font-size: 12px');
        expect(css).toContain('#003399');
    });
});

describe('partial migration: explicit @use plus injection (plan item 8)', () => {
    it('compiles a component that already declares @use of the shared module and applies the project branding once', async () => {
        const { compile } = createInjectionCompiler({
            aliasList: shopUiAliasList('partial-migration'),
            projectWrapperPath: fixturePath(
                'partial-migration',
                'project-wrapper/ShopUi/Theme/fixture/styles/shared.scss',
            ),
        });

        const result = await compile(
            "@use './MyModule/Theme/fixture/components/atoms/card/card.scss' as *; .test { @include my-card; }",
            fixturePath('partial-migration', 'root.scss'),
        );

        // The canonical remap points both the injected @use and the file's own @use at the same
        // wrapper URL, so the duplicate load is tolerated and the branded value lands.
        expect(result.css.toString()).toContain('#e4002b');
    });
});

describe('alias and tilde path resolution in component files (plan item 9)', () => {
    it('resolves a ~ShopUi/styles/shared tilde request through the canonical remap', async () => {
        const { compile } = createInjectionCompiler({ aliasList: shopUiAliasList('alias-paths') });

        const result = await compile(
            "@use './MyModule/Theme/fixture/components/atoms/probe-tilde/probe-tilde.scss' as *; .test { @include my-tilde; }",
            fixturePath('alias-paths', 'root.scss'),
        );

        expect(result.css.toString()).toContain('#778899');
    });

    it('resolves a plain tsconfig alias request (AtomExtra/thing) to its partial file', async () => {
        const { compile } = createInjectionCompiler({
            aliasList: shopUiAliasList('alias-paths', { AtomExtra: fixturePath('alias-paths', 'extra') }),
        });

        const result = await compile(
            "@use './MyModule/Theme/fixture/components/atoms/probe-alias/probe-alias.scss' as *; .test { @include my-alias; }",
            fixturePath('alias-paths', 'root.scss'),
        );

        expect(result.css.toString()).toContain('width: 42px');
    });
});

describe('styles/** injection exclusion (plan item 11)', () => {
    it('classifies a file under Theme/*/styles/ as not injectable', () => {
        const stylesHelperPath = fixturePath('styles-exclusion', 'MyModule/Theme/fixture/styles/_helper.scss');
        const componentPath = fixturePath(
            'styles-exclusion',
            'MyModule/Theme/fixture/components/atoms/helper-as-component/helper-as-component.scss',
        );

        expect(isInjectableComponentPath(stylesHelperPath)).toBe(false);
        expect(isInjectableComponentPath(componentPath)).toBe(true);
    });

    it('does not inject the shared module into a styles/ file, so its shared variable stays undefined', async () => {
        const { compile } = createInjectionCompiler({ aliasList: shopUiAliasList('styles-exclusion') });

        await expect(
            compile("@use './MyModule/Theme/fixture/styles/helper';", fixturePath('styles-exclusion', 'root.scss')),
        ).rejects.toThrow(/Undefined variable/);
    });

    it('injects the same content when it lives in a component directory (control)', async () => {
        const { compile } = createInjectionCompiler({ aliasList: shopUiAliasList('styles-exclusion') });

        const result = await compile(
            "@use './MyModule/Theme/fixture/components/atoms/helper-as-component/helper-as-component.scss';",
            fixturePath('styles-exclusion', 'root.scss'),
        );

        expect(result.css.toString()).toContain('#003399');
    });
});

describe('one-line injection banner preserves authored line numbers (plan item 13)', () => {
    it('reports a compile error on the authored line and at the real file path', async () => {
        const { compile } = createInjectionCompiler({ aliasList: shopUiAliasList('banner-line') });
        const brokenFilePath = fixturePath('banner-line', 'MyModule/Theme/fixture/components/atoms/broken/broken.scss');

        try {
            await compile(
                "@use './MyModule/Theme/fixture/components/atoms/broken/broken.scss' as *;",
                fixturePath('banner-line', 'root.scss'),
            );
            throw new Error('expected a compile error for the undefined variable, but compilation succeeded');
        } catch (error) {
            const sassError = error as { span: { start: { line: number }; url: URL } };
            // Authored line 3 (0-based line 2) holds the undefined variable; the banner must not shift it.
            expect(sassError.span.start.line).toBe(2);
            expect(sassError.span.url.protocol).toBe('file:');
            expect(fileURLToPath(sassError.span.url)).toBe(brokenFilePath);
        }
    });

    it('builds the banner as a single physical line prepended to the original content', () => {
        const { buildInjectionBanner } = createInjectionCompiler({ aliasList: shopUiAliasList('banner-line') });
        const brokenFilePath = fixturePath('banner-line', 'MyModule/Theme/fixture/components/atoms/broken/broken.scss');
        const brokenContent = readFileSync(brokenFilePath, 'utf8');

        const banner = buildInjectionBanner(brokenContent, brokenFilePath);
        const injectedContent = `${banner} ${brokenContent}`;

        expect(banner).not.toContain('\n');
        expect(injectedContent.split('\n')).toHaveLength(brokenContent.split('\n').length);
    });
});

describe('an alias with a list of targets', () => {
    const temporaryRoots: string[] = [];

    // A project Shared theme that shadows only the ping feature of a core Shared theme.
    const createSharedThemes = (): { projectTheme: string; coreTheme: string } => {
        const root = mkdtempSync(join(tmpdir(), 'yves-builder-shared-alias-'));
        temporaryRoots.push(root);
        const files: Record<string, string> = {
            'core/Chat/index.scss': "@use '@shared/ai-commerce/Chat/features/ping/ping';\n",
            'core/Chat/features/ping/_ping.scss': 'chat-ping { color: core; }\n',
            'project/Chat/features/ping/_ping.scss': 'chat-ping { color: project; }\n',
        };

        for (const [relativePath, content] of Object.entries(files)) {
            mkdirSync(dirname(join(root, relativePath)), { recursive: true });
            writeFileSync(join(root, relativePath), content);
        }

        return { projectTheme: join(root, 'project'), coreTheme: join(root, 'core') };
    };

    const compileThroughSharedAlias = async (): Promise<string> => {
        const { projectTheme, coreTheme } = createSharedThemes();
        const { compile } = createInjectionCompiler({
            aliasList: { ...shopUiAliasList('alias-paths'), '@shared/ai-commerce': [projectTheme, coreTheme] },
        });

        const result = await compile("@use '@shared/ai-commerce/Chat';", fixturePath('alias-paths', 'root.scss'));

        return result.css.toString();
    };

    afterEach(() => {
        while (temporaryRoots.length > 0) {
            rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
        }
    });

    it('loads the file of the first target that has it, so a project file shadows the core one', async () => {
        const css = await compileThroughSharedAlias();

        expect(css).toContain('color: project');
        expect(css).not.toContain('color: core');
    });

    it('falls through to a later target for a directory index the first target lacks', async () => {
        await expect(compileThroughSharedAlias()).resolves.toContain('chat-ping');
    });

    it('reports, in order, every candidate of each target it tried before the one that has the file', () => {
        const { projectTheme, coreTheme } = createSharedThemes();
        const missedCandidates: string[] = [];

        resolveThroughAliasTargets([join(projectTheme, 'Missing'), projectTheme, coreTheme], '/Chat', null, (path) =>
            missedCandidates.push(path),
        );

        expect(missedCandidates).toEqual([
            join(projectTheme, 'Missing/Chat.scss'),
            join(projectTheme, 'Missing/_Chat.scss'),
            join(projectTheme, 'Missing/Chat/index.scss'),
            join(projectTheme, 'Missing/Chat/_index.scss'),
            join(projectTheme, 'Chat.scss'),
            join(projectTheme, '_Chat.scss'),
            join(projectTheme, 'Chat/index.scss'),
            join(projectTheme, 'Chat/_index.scss'),
        ]);
    });

    it('hands the importer callback the candidates a project shadow created later would occupy', async () => {
        const { projectTheme, coreTheme } = createSharedThemes();
        rmSync(join(projectTheme, 'Chat/features/ping/_ping.scss'));
        const missedCandidates: string[] = [];
        const { compile } = createInjectionCompiler({
            aliasList: { ...shopUiAliasList('alias-paths'), '@shared/ai-commerce': [projectTheme, coreTheme] },
            onCandidateMissing: (candidatePath) => missedCandidates.push(candidatePath),
        });

        await compile("@use '@shared/ai-commerce/Chat';", fixturePath('alias-paths', 'root.scss'));

        expect([...new Set(missedCandidates)]).toEqual([
            join(projectTheme, 'Chat.scss'),
            join(projectTheme, '_Chat.scss'),
            join(projectTheme, 'Chat/index.scss'),
            join(projectTheme, 'Chat/_index.scss'),
            join(projectTheme, 'Chat/features/ping/ping.scss'),
            join(projectTheme, 'Chat/features/ping/_ping.scss'),
            join(projectTheme, 'Chat/features/ping/ping/index.scss'),
            join(projectTheme, 'Chat/features/ping/ping/_index.scss'),
        ]);
    });

    it('resolves a style-graph request through the first target that has the file', () => {
        const { projectTheme, coreTheme } = createSharedThemes();

        expect(
            resolveLoadRequest('@shared/ai-commerce/Chat/features/ping/ping', join(coreTheme, 'Chat/index.scss'), {
                '@shared/ai-commerce': [projectTheme, coreTheme],
            }),
        ).toBe(join(projectTheme, 'Chat/features/ping/_ping.scss'));
    });
});

describe('the ShopUi alias', () => {
    const temporaryRoots: string[] = [];

    // Two ShopUi themes whose shared stylesheets tell apart which one the injection loaded.
    const createShopUiThemes = (): { projectTheme: string; coreTheme: string; root: string } => {
        const root = mkdtempSync(join(tmpdir(), 'yves-builder-shop-ui-alias-'));
        temporaryRoots.push(root);
        const files: Record<string, string> = {
            'project/styles/shared.scss': '$shop-ui-marker: #111111;\n',
            'core/styles/shared.scss': '$shop-ui-marker: #222222;\n',
        };

        for (const [relativePath, content] of Object.entries(files)) {
            mkdirSync(dirname(join(root, relativePath)), { recursive: true });
            writeFileSync(join(root, relativePath), content);
        }

        return { projectTheme: join(root, 'project'), coreTheme: join(root, 'core'), root };
    };

    afterEach(() => {
        while (temporaryRoots.length > 0) {
            rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
        }
    });

    it('injects the shared stylesheet of the first target of a hand-written multi-target ShopUi alias', async () => {
        const { projectTheme, coreTheme, root } = createShopUiThemes();
        const { compileEntry } = createInjectionCompiler({ aliasList: { ShopUi: [projectTheme, coreTheme] } });

        const result = await compileEntry(
            '.probe { color: $shop-ui-marker; }',
            join(root, 'Probe/Theme/default/components/atoms/probe/probe.scss'),
        );

        expect(result.css.toString()).toContain('#111111');
        expect(result.css.toString()).not.toContain('#222222');
    });

    it('fails naming the configuration file, the missing ShopUi entry and the mapping to add when the alias list has no ShopUi alias', () => {
        const createImporterFactory = () => createSassInjectionImporterFactory({ aliasList: {} });

        expect(createImporterFactory).toThrow('tsconfig.yves.json');
        expect(createImporterFactory).toThrow("has no 'ShopUi' entry");
        expect(createImporterFactory).toThrow("Add the 'ShopUi/*' path mapping");
    });
});
