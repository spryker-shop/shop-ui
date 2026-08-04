import { describe, it, expect } from '@jest/globals';
import { createMixinIndex } from '../libs/sass/mixin-index.mts';
import { fixturePath } from './helpers/compile-fixture.mts';

describe('mixin index precedence (plan item 4)', () => {
    it('resolves a duplicated mixin name to the later component entry, so a project override wins over core', async () => {
        const coreOwnerPath = fixturePath('project-override', 'core/Theme/fixture/components/atoms/probe/probe.scss');
        const projectOwnerPath = fixturePath(
            'project-override',
            'project/Theme/fixture/components/atoms/probe/probe.scss',
        );

        // Finder directory order places project sources last, so the project file must win.
        const mixinIndex = await createMixinIndex({
            componentStyleFilePaths: [coreOwnerPath, projectOwnerPath],
            sharedStyleFilePaths: [],
        });

        const owners = mixinIndex.resolveDependencies(
            '@include probe-mixin;',
            fixturePath('project-override', 'consumer.scss'),
        );

        expect(owners).toEqual([projectOwnerPath]);
    });
});

describe('mixin index error cases (plan item 12)', () => {
    it('throws for an unknown mixin, naming the mixin, the referencing file, and the closest known name', async () => {
        const knownOwnerPath = fixturePath('unknown-mixin', 'MyModule/Theme/fixture/components/atoms/known/known.scss');
        const referencingFilePath = fixturePath('unknown-mixin', 'consumer.scss');

        const mixinIndex = await createMixinIndex({
            componentStyleFilePaths: [knownOwnerPath],
            sharedStyleFilePaths: [],
        });

        expect(() => mixinIndex.resolveDependencies('@include known-mixn();', referencingFilePath)).toThrow(
            /known-mixn/,
        );

        try {
            mixinIndex.resolveDependencies('@include known-mixn();', referencingFilePath);
        } catch (error) {
            expect((error as Error).message).toContain('known-mixn');
            expect((error as Error).message).toContain(referencingFilePath);
            expect((error as Error).message).toContain('known-mixin');
        }
    });

    it('throws for a dependency cycle, listing the full include chain in the message', async () => {
        const alphaPath = fixturePath('dependency-cycle', 'ModuleA/Theme/fixture/components/atoms/alpha/alpha.scss');
        const betaPath = fixturePath('dependency-cycle', 'ModuleB/Theme/fixture/components/atoms/beta/beta.scss');

        const mixinIndex = await createMixinIndex({
            componentStyleFilePaths: [alphaPath, betaPath],
            sharedStyleFilePaths: [],
        });

        // alpha depends on beta's mixin; the reverse edge below closes the loop.
        mixinIndex.resolveDependencies('@include mixin-beta();', alphaPath);

        try {
            mixinIndex.resolveDependencies('@include mixin-alpha();', betaPath);
            throw new Error('expected a dependency cycle error, but resolveDependencies returned normally');
        } catch (error) {
            expect((error as Error).message).toContain('cycle');
            expect((error as Error).message).toContain(`${betaPath} → ${alphaPath} → ${betaPath}`);
        }
    });
});
