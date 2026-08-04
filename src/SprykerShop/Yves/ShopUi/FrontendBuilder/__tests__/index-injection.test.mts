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
