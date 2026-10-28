// Duplicated on purpose: the Gui and ShopUi FrontendBuilders each carry this file until they share a package.
import { join } from 'node:path';

/** Project-root-relative source roots, classified once by the builder settings. */
export interface SourceRoots {
    context: string;
    core: string[];
    /** Strongest first, as `KernelConstants::PROJECT_NAMESPACES` orders the namespaces. */
    project: string[];
}

/** Alias name → project-root-relative targets, tried in order: the first that resolves wins. */
export type PathAliasMap = Record<string, string[]>;

export interface AliasProvider {
    readonly name: string;
    collect(sourceRoots: SourceRoots): Promise<PathAliasMap>;
    /** A configuration still carries the aliases an earlier run emitted; this tells a stale one from a hand-written one. */
    ownsAliasName(aliasName: string): boolean;
}

const PATH_ALIAS_PROVIDER_LIST_PATH = 'libs/aliases/path-alias-providers.mts';

const describeTargets = (context: string, aliasTargets: string[]): string =>
    aliasTargets.map((aliasTarget) => join(context, aliasTarget)).join(', ');

export const collectPathAliases = async (
    providers: AliasProvider[],
    sourceRoots: SourceRoots,
): Promise<PathAliasMap> => {
    const pathAliases: PathAliasMap = {};
    const providerNameByAliasName = new Map<string, string>();

    for (const provider of providers) {
        for (const [aliasName, aliasTargets] of Object.entries(await provider.collect(sourceRoots))) {
            const earlierProviderName = providerNameByAliasName.get(aliasName);

            // One alias resolves through one target list, so a second provider would silently replace the first one's.
            if (earlierProviderName !== undefined) {
                throw new Error(
                    `The alias "${aliasName}" is produced by two alias providers, "${earlierProviderName}" ` +
                        `(${describeTargets(sourceRoots.context, pathAliases[aliasName])}) and "${provider.name}" ` +
                        `(${describeTargets(sourceRoots.context, aliasTargets)}).\n` +
                        `Each alias must come from exactly one provider, otherwise one of them would hide the other's targets.\n` +
                        `Change the alias name one of the providers emits, or remove one of them from ` +
                        `${PATH_ALIAS_PROVIDER_LIST_PATH} in the builder.\n`,
                );
            }

            providerNameByAliasName.set(aliasName, provider.name);
            pathAliases[aliasName] = aliasTargets;
        }
    }

    return pathAliases;
};

export const isProvidedAliasName = (providers: AliasProvider[], aliasName: string): boolean =>
    providers.some((provider) => provider.ownsAliasName(aliasName));
