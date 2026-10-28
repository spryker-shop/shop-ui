import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import {
    collectPathAliases,
    isProvidedAliasName,
    type AliasProvider,
    type PathAliasMap,
    type SourceRoots,
} from '../libs/aliases/alias-provider.mts';

const SOURCE_ROOTS: SourceRoots = { context: '/project', core: ['./src/Core'], project: ['./src/Pyz'] };

const createProvider = (name: string, aliases: PathAliasMap, aliasNamePrefix = ''): AliasProvider => ({
    name,
    collect: async () => aliases,
    ownsAliasName: (aliasName) => aliasNamePrefix !== '' && aliasName.startsWith(aliasNamePrefix),
});

describe('collecting the path aliases of several providers', () => {
    it('merges the aliases of every provider into one map', async () => {
        const aliases = await collectPathAliases(
            [
                createProvider('first', { 'first/*': ['./src/Core/First/*'] }),
                createProvider('second', { 'second/*': ['./src/Pyz/Second/*', './src/Core/Second/*'] }),
            ],
            SOURCE_ROOTS,
        );

        expect(aliases).toEqual({
            'first/*': ['./src/Core/First/*'],
            'second/*': ['./src/Pyz/Second/*', './src/Core/Second/*'],
        });
    });

    it('hands every provider the same source roots', async () => {
        const receivedSourceRoots: SourceRoots[] = [];
        const recordingProvider: AliasProvider = {
            name: 'recording',
            collect: async (sourceRoots) => {
                receivedSourceRoots.push(sourceRoots);

                return {};
            },
            ownsAliasName: () => false,
        };

        await collectPathAliases([recordingProvider, recordingProvider], SOURCE_ROOTS);

        expect(receivedSourceRoots).toEqual([SOURCE_ROOTS, SOURCE_ROOTS]);
    });

    it('fails naming both providers, the alias and both targets when two providers emit the same alias', async () => {
        const failure = await collectPathAliases(
            [
                createProvider('module', { 'ShopUi/*': ['./src/Core/ShopUi/*'] }),
                createProvider('shared-theme', { 'ShopUi/*': ['./src/Pyz/ShopUi/*'] }),
            ],
            SOURCE_ROOTS,
        ).then(
            () => null,
            (error: unknown) => error,
        );

        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toContain('"ShopUi/*" is produced by two alias providers');
        expect((failure as Error).message).toContain('"module"');
        expect((failure as Error).message).toContain('"shared-theme"');
        expect((failure as Error).message).toContain(join('/project', 'src/Core/ShopUi/*'));
        expect((failure as Error).message).toContain(join('/project', 'src/Pyz/ShopUi/*'));
        expect((failure as Error).message).toContain('libs/aliases/path-alias-providers.mts');
    });
});

describe('recognising a provided alias name', () => {
    const providers = [createProvider('first', {}, 'first/'), createProvider('second', {}, 'second/')];

    it('recognises a name any provider owns', () => {
        expect(isProvidedAliasName(providers, 'second/module/*')).toBe(true);
    });

    it('does not recognise a name no provider owns', () => {
        expect(isProvidedAliasName(providers, 'hand-written/*')).toBe(false);
    });
});
