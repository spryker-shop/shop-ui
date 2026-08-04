import { describe, it, expect } from '@jest/globals';
import { createInjectionCompiler, fixturePath, shopUiAliasList } from './helpers/compile-fixture.mts';
import type { CompileLogger } from './helpers/compile-fixture.mts';

const CORE_COMPONENT_ROOT =
    "@use './core-shop-ui/Theme/fixture/components/atoms/thing/thing.scss' as *; .test { @include my-thing; }";

const compileCoreComponent = (projectWrapperPath: string | null, options?: { logger?: CompileLogger }) => {
    const { compile } = createInjectionCompiler({
        aliasList: shopUiAliasList('branding'),
        projectWrapperPath,
    });

    return compile(CORE_COMPONENT_ROOT, fixturePath('branding', 'root.scss'), options);
};

describe('project wrapper branding reaches a core component (plan items 5-7)', () => {
    it('applies branding from a legacy @import wrapper to a core component', async () => {
        // The legacy @import lines warn as expected; a capturing logger keeps them out of stdout.
        const result = await compileCoreComponent(
            fixturePath('branding', 'legacy-wrapper/ShopUi/Theme/fixture/styles/shared.scss'),
            { logger: { warn() {} } },
        );

        expect(result.css.toString()).toContain('#e4002b');
    });

    it('applies branding from a modern @forward ... with wrapper without emitting warnings', async () => {
        const warnings: Array<{ message: string; url: string }> = [];
        const result = await compileCoreComponent(
            fixturePath('branding', 'modern-wrapper/ShopUi/Theme/fixture/styles/shared.scss'),
            {
                logger: {
                    warn(message, loggerOptions) {
                        warnings.push({ message, url: String(loggerOptions?.span?.url) });
                    },
                },
            },
        );

        expect(result.css.toString()).toContain('#e4002b');
        expect(warnings).toEqual([]);
    });

    it('falls back to the core default when no project wrapper exists', async () => {
        const result = await compileCoreComponent(null);

        expect(result.css.toString()).toContain('#003399');
    });
});
