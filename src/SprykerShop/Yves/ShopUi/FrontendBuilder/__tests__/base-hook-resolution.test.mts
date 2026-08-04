import { describe, it, expect } from '@jest/globals';
import { createMixinIndex } from '../libs/sass/mixin-index.mts';
import { createInjectionCompiler, fixturePath, shopUiAliasList } from './helpers/compile-fixture.mts';

const sharedStyleFilePathsForBaseHook = [fixturePath('base-hook', 'core-shop-ui/Theme/fixture/styles/shared.scss')];

describe('mixin index optional -base-hook resolution (plan Phase 4)', () => {
    it('compiles a component referencing an undefined -base-hook, emitting nothing for the missing hook', async () => {
        const guardedButtonPath = fixturePath(
            'base-hook',
            'MyModule/Theme/fixture/components/atoms/button/button.scss',
        );

        const mixinIndex = await createMixinIndex({
            componentStyleFilePaths: [guardedButtonPath],
            sharedStyleFilePaths: sharedStyleFilePathsForBaseHook,
        });
        const { compile } = createInjectionCompiler({ aliasList: shopUiAliasList('base-hook'), mixinIndex });

        const guardedResult = await compile(
            "@use './MyModule/Theme/fixture/components/atoms/button/button.scss' as *; @include shop-ui-button;",
            fixturePath('base-hook', 'root.scss'),
        );
        const referenceResult = await compile(
            "@use './reference/Theme/fixture/components/atoms/button/button.scss' as *; @include shop-ui-button;",
            fixturePath('base-hook', 'root.scss'),
        );

        // No project defines shop-ui-button-base-hook, so the guarded include resolves to nothing:
        // the output must be byte-identical to the same component authored without the hook guard.
        expect(guardedResult.css.toString()).toBe(referenceResult.css.toString());
    });

    it('emits a project-defined -base-hook at the base position, before the mixin modifier selectors', async () => {
        const guardedButtonPath = fixturePath(
            'base-hook',
            'MyModule/Theme/fixture/components/atoms/button/button.scss',
        );
        const projectHookPath = fixturePath(
            'base-hook',
            'project/Theme/fixture/components/atoms/button-hook/button-hook.scss',
        );

        // Project sources arrive last in finder order; the hook owner is discovered via that
        // project-last precedence, exactly like any other cross-component mixin.
        const mixinIndex = await createMixinIndex({
            componentStyleFilePaths: [guardedButtonPath, projectHookPath],
            sharedStyleFilePaths: sharedStyleFilePathsForBaseHook,
        });
        const { compile } = createInjectionCompiler({ aliasList: shopUiAliasList('base-hook'), mixinIndex });

        const result = await compile(
            "@use './MyModule/Theme/fixture/components/atoms/button/button.scss' as *; @include shop-ui-button;",
            fixturePath('base-hook', 'root.scss'),
        );
        const css = result.css.toString();

        expect(css).toContain('background: #abcdef');
        // Base position: the hook declaration lands inside the base `.button` block, ahead of the
        // `.button--compact` modifier selector — the old-sass cascade restored at the source.
        expect(css.indexOf('background: #abcdef')).toBeLessThan(css.indexOf('.button--compact'));
    });

    it('still throws for an unknown non-hook mixin, naming the referencing file and the closest known mixin', async () => {
        const knownOwnerPath = fixturePath('unknown-mixin', 'MyModule/Theme/fixture/components/atoms/known/known.scss');
        const referencingFilePath = fixturePath('unknown-mixin', 'consumer.scss');

        const mixinIndex = await createMixinIndex({
            componentStyleFilePaths: [knownOwnerPath],
            sharedStyleFilePaths: [],
        });

        try {
            mixinIndex.resolveDependencies('@include known-mixn();', referencingFilePath);
            throw new Error('expected resolveDependencies to throw for an unknown non-hook mixin, but it returned');
        } catch (error) {
            const message = (error as Error).message;
            expect(message).toContain('known-mixn');
            expect(message).toContain(referencingFilePath);
            expect(message).toContain('known-mixin');
        }
    });
});
