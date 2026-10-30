import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { createMixinIndex } from '../libs/sass/mixin-index.mts';
import { createInjectionCompiler, fixturePath, shopUiAliasList } from './helpers/compile-fixture.mts';

describe('one-liner style.scss entry with a sibling mixin file (plan item 2)', () => {
    it('injects the sibling mixin owner so a bare @include in style.scss compiles as a webpack entry', async () => {
        const widgetPath = fixturePath('one-liner-style', 'MyModule/Theme/fixture/components/atoms/widget/widget.scss');
        const stylePath = fixturePath('one-liner-style', 'MyModule/Theme/fixture/components/atoms/widget/style.scss');

        const mixinIndex = await createMixinIndex({
            componentStyleFilePaths: [widgetPath],
            sharedStyleFilePaths: [fixturePath('one-liner-style', 'core-shop-ui/Theme/fixture/styles/shared.scss')],
        });
        const { compileEntry } = createInjectionCompiler({
            aliasList: shopUiAliasList('one-liner-style'),
            mixinIndex,
        });

        const result = await compileEntry(readFileSync(stylePath, 'utf8'), stylePath);

        expect(result.css.toString()).toContain('#112233');
    });
});

describe('cross-component mixin extension via the index (plan item 3)', () => {
    it('resolves a mixin owned by another component and preserves the include cascade order', async () => {
        const panelPath = fixturePath('cross-component', 'ModuleA/Theme/fixture/components/molecules/panel/panel.scss');
        const buttonPath = fixturePath('cross-component', 'ModuleB/Theme/fixture/components/atoms/button/button.scss');

        const mixinIndex = await createMixinIndex({
            componentStyleFilePaths: [panelPath, buttonPath],
            sharedStyleFilePaths: [fixturePath('cross-component', 'core-shop-ui/Theme/fixture/styles/shared.scss')],
        });
        const { compile } = createInjectionCompiler({
            aliasList: shopUiAliasList('cross-component'),
            mixinIndex,
        });

        const result = await compile(
            "@use './ModuleA/Theme/fixture/components/molecules/panel/panel.scss' as *; @include a-panel;",
            fixturePath('cross-component', 'root.scss'),
        );
        const css = result.css.toString();

        expect(css).toContain('.button');
        expect(css).toContain('.panel');
        // a-panel includes b-button before emitting its own rule; the cascade must follow that order.
        expect(css.indexOf('.button')).toBeLessThan(css.indexOf('.panel'));
    });
});

describe('a component loaded by another component contributes its definitions only', () => {
    const definitionsViewPath = (relativePath: string): string => fixturePath('definitions-view', relativePath);
    const defaultButtonPath = definitionsViewPath('Pyz/ShopUi/Theme/fixture/components/atoms/button/button.scss');

    const createDefinitionsViewCompiler = async (componentStyleFilePaths: string[]) => {
        const mixinIndex = await createMixinIndex({
            componentStyleFilePaths,
            sharedStyleFilePaths: [definitionsViewPath('core-shop-ui/Theme/fixture/styles/shared.scss')],
        });

        return createInjectionCompiler({ aliasList: shopUiAliasList('definitions-view'), mixinIndex });
    };

    const compileFixtureEntry = async (componentStyleFilePaths: string[], entryPath: string): Promise<string> => {
        const { compileEntry } = await createDefinitionsViewCompiler(componentStyleFilePaths);
        const result = await compileEntry(readFileSync(entryPath, 'utf8'), entryPath);

        return result.css.toString();
    };

    const countOccurrences = (css: string, selector: string): number => css.split(selector).length - 1;

    it('does not re-emit a self-emitting mixin owner into a consumer component through the mixin index', async () => {
        const configuratorButtonPath = definitionsViewPath(
            'Pyz/ConfigurableBundlePage/Theme/fixture/components/molecules/configurator-button/configurator-button.scss',
        );

        const css = await compileFixtureEntry([defaultButtonPath, configuratorButtonPath], configuratorButtonPath);

        expect(css).toContain('.configurator-button');
        expect(css).toContain('padding: 15px');
        expect(css).not.toMatch(/(^|\s)\.button\s*\{/);
    });

    it('does not emit what the definitions view loads from its own directory', async () => {
        const configuratorButtonPath = definitionsViewPath(
            'Pyz/ConfigurableBundlePage/Theme/fixture/components/molecules/configurator-button/configurator-button.scss',
        );

        const css = await compileFixtureEntry([defaultButtonPath, configuratorButtonPath], configuratorButtonPath);

        expect(css).not.toContain('.button__icon');
    });

    it('emits a custom theme override of a self-emitting default theme component exactly once', async () => {
        const customButtonPath = definitionsViewPath('Pyz/ShopUi/Theme/custom/components/atoms/button/button.scss');

        const css = await compileFixtureEntry([defaultButtonPath, customButtonPath], customButtonPath);

        expect(countOccurrences(css, '.button {')).toBe(1);
        expect(css).toContain('background-color: orange');
    });

    it('serves an explicit @use of another component and the injected owner as one module', async () => {
        const cartButtonPath = definitionsViewPath(
            'Pyz/CartPage/Theme/fixture/components/molecules/cart-button/cart-button.scss',
        );

        const css = await compileFixtureEntry([defaultButtonPath, cartButtonPath], cartButtonPath);

        expect(css).toContain('.cart-button');
        expect(css).not.toMatch(/(^|\s)\.button\s*\{/);
    });

    it('keeps emitting a self-emitting file that a sibling in its own directory loads', async () => {
        const linkStylePath = definitionsViewPath('Pyz/ShopUi/Theme/fixture/components/atoms/link/style.scss');

        const css = await compileFixtureEntry([], linkStylePath);

        expect(css).toContain('.link');
    });

    it('still emits a self-emitting component compiled as its own entry', async () => {
        const css = await compileFixtureEntry([defaultButtonPath], defaultButtonPath);

        expect(countOccurrences(css, '.button {')).toBe(1);
        expect(css).toContain('.button__icon');
    });
});
