import { describe, it, expect } from '@jest/globals';
import { createMixinIndex } from '../libs/sass/mixin-index.mts';
import { createInjectionCompiler, fixturePath, shopUiAliasList } from './helpers/compile-fixture.mts';

describe('child component mixin with @content override cascade ordering', () => {
    it('emits the @content override after the mixin base declarations within one include site', async () => {
        const productItemPath = fixturePath(
            'content-override',
            'ChildModule/Theme/fixture/components/atoms/product-item/product-item.scss',
        );
        const productCardPath = fixturePath(
            'content-override',
            'ParentModule/Theme/fixture/components/molecules/product-card/product-card.scss',
        );

        const mixinIndex = await createMixinIndex({
            componentStyleFilePaths: [productItemPath, productCardPath],
            sharedStyleFilePaths: [fixturePath('content-override', 'core-shop-ui/Theme/fixture/styles/shared.scss')],
        });
        const { compile } = createInjectionCompiler({
            aliasList: shopUiAliasList('content-override'),
            mixinIndex,
        });

        const result = await compile(
            "@use './ParentModule/Theme/fixture/components/molecules/product-card/product-card.scss' as *; @include product-card;",
            fixturePath('content-override', 'root.scss'),
        );
        const css = result.css.toString();

        // The child mixin emits base `flex-direction: column`, then a nested rule (making this a
        // mixed-declarations site), then @content. The including component overrides with
        // `flex-direction: row` via @content. The override wins the cascade only if it is emitted
        // after the base within the same include site — nothing may reorder these two.
        expect(css).toContain('flex-direction: column');
        expect(css).toContain('flex-direction: row');
        expect(css.indexOf('flex-direction: column')).toBeLessThan(css.indexOf('flex-direction: row'));
    });
});
