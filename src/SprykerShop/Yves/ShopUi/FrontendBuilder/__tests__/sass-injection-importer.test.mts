import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isInjectableComponentPath } from '../libs/sass/sass-injection-importer.mts';
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
