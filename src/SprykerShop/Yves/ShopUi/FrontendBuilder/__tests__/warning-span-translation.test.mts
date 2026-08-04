import { describe, it, expect } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { createInjectionCompiler, fixturePath, shopUiAliasList } from './helpers/compile-fixture.mts';
import type { CompileLoggerOptions } from './helpers/compile-fixture.mts';

describe('deprecation warnings from legacy fixture files (plan item 10)', () => {
    it('compiles a legacy @import chain with global map-get and points every warning at an authored fixture file', async () => {
        const legacyComponentPath = fixturePath(
            'legacy-warnings',
            'MyModule/Theme/fixture/components/atoms/legacy/legacy.scss',
        );
        const wrapperSharedPath = fixturePath(
            'legacy-warnings',
            'legacy-wrapper/ShopUi/Theme/fixture/styles/shared.scss',
        );
        const legacyHelperPath = fixturePath(
            'legacy-warnings',
            'legacy-wrapper/ShopUi/Theme/fixture/styles/helpers/_legacy-helper.scss',
        );
        const authoredFilePaths = [legacyComponentPath, wrapperSharedPath, legacyHelperPath];

        const warnings: Array<{ message: string; span: CompileLoggerOptions['span']; stack?: string }> = [];
        const { compile } = createInjectionCompiler({
            aliasList: shopUiAliasList('legacy-warnings'),
            projectWrapperPath: wrapperSharedPath,
        });

        const result = await compile(
            "@use './MyModule/Theme/fixture/components/atoms/legacy/legacy.scss' as *; .test { @include my-legacy; }",
            fixturePath('legacy-warnings', 'root.scss'),
            {
                logger: {
                    warn(message, loggerOptions) {
                        warnings.push({ message, span: loggerOptions?.span, stack: loggerOptions?.stack });
                    },
                },
            },
        );

        // The legacy fixture must still compile (deprecations warn, they do not fail the build).
        expect(result.css.toString().length).toBeGreaterThan(0);

        // Deprecation warnings must be present (the @import lines and the global map-get calls).
        expect(warnings.length).toBeGreaterThan(0);

        for (const warning of warnings) {
            // The custom injection scheme must never leak into a warning the customer reads.
            expect(String(warning.span?.url)).not.toContain('spryker-yves:');
            expect(warning.stack ?? '').not.toContain('spryker-yves:');
            expect(warning.span?.url?.protocol).toBe('file:');
            expect(authoredFilePaths).toContain(fileURLToPath(warning.span!.url!));
        }
    });
});
