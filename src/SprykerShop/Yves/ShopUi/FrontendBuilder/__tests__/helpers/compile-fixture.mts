import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as sassEmbedded from 'sass-embedded';
import {
    createSassInjectionImporterFactory,
    createErrorTranslatingSassImplementation,
    isInjectableComponentPath,
    isInjectableStyleRootPath,
} from '../../libs/sass/sass-injection-importer.mts';
import type { MixinIndex } from '../../libs/sass/mixin-index.mts';

export interface CompileLoggerOptions {
    span?: { url?: URL; start?: { line: number } };
    stack?: string;
}

export interface CompileLogger {
    warn?: (message: string, options?: CompileLoggerOptions) => void;
    debug?: (message: string, options?: CompileLoggerOptions) => void;
}

export const fixturesDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

export const fixturePath = (...segments: string[]): string => join(fixturesDirectory, ...segments);

// Every fixture that needs the injected shared module points the `ShopUi` alias at its own minimal
// core theme, so the importer can locate `styles/shared.scss` exactly as it does in the real repo.
export const shopUiAliasList = (
    caseName: string,
    extraAliases: Record<string, string> = {},
): Record<string, string> => ({
    ShopUi: fixturePath(caseName, 'core-shop-ui', 'Theme', 'fixture'),
    ...extraAliases,
});

// Builds a compiler wired exactly like FrontendBuilder/configs/development.mts: the injection
// importer serves both as the entry importer and as a global importer, and the compile runs through
// the error/warning-span translating implementation that sass-loader uses in production.
export const createInjectionCompiler = ({
    aliasList,
    projectWrapperPath = null,
    mixinIndex = undefined,
}: {
    aliasList: Record<string, string>;
    projectWrapperPath?: string | null;
    mixinIndex?: MixinIndex;
}) => {
    const { buildInjectionBanner, buildStyleRootBanner, createImporter } = createSassInjectionImporterFactory({
        aliasList,
        projectWrapperPath,
        ...(mixinIndex ? { mixinIndex } : {}),
    });
    const importer = createImporter();
    const implementation = createErrorTranslatingSassImplementation(sassEmbedded);

    const compile = (source: string, sourceFilePath: string, { logger }: { logger?: CompileLogger } = {}) =>
        implementation.compileStringAsync(source, {
            url: pathToFileURL(sourceFilePath),
            importer,
            importers: [importer],
            logger,
        });

    // Faithful simulation of the sass-loader `additionalData` root-injection path: an injectable
    // entry file (a Sass root, compiled from string) gets the banner prepended here, exactly as
    // development.mts does, then compiles through the same importer.
    const compileEntry = (source: string, sourceFilePath: string, options?: { logger?: CompileLogger }) => {
        const buildEntryBanner = (): string | null => {
            if (isInjectableComponentPath(sourceFilePath)) {
                return buildInjectionBanner(source, sourceFilePath);
            }

            return isInjectableStyleRootPath(sourceFilePath) ? buildStyleRootBanner(source) : null;
        };

        const entryBanner = buildEntryBanner();

        return compile(entryBanner === null ? source : `${entryBanner} ${source}`, sourceFilePath, options);
    };

    return { compile, compileEntry, buildInjectionBanner };
};
