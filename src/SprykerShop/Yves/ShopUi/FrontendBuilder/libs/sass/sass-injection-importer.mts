import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isExistingFile, resolveWithSassConventions } from './sass-path-resolution.mts';
import { createStyleFileInjectionDecider } from './style-module-context.mts';
import type { MixinIndex } from './mixin-index.mts';

// Structural shapes for the sass-embedded interop boundary. sass-embedded ships its own richer
// types, but only the members this importer touches are modelled here, so the wrapper stays
// decoupled from the exact upstream declarations while remaining fully typed.
interface LoggerSpan {
    url?: URL;
}

interface LoggerOptions {
    span?: LoggerSpan;
    stack?: string;
    [key: string]: unknown;
}

interface SassLogger {
    warn?: (message: string, options?: LoggerOptions) => void;
    debug?: (message: string, options?: LoggerOptions) => void;
}

interface SassCompileOptions {
    logger?: SassLogger;
    [key: string]: unknown;
}

interface SassCompileResult {
    css: string | Buffer;
}

// Method syntax (not property syntax) is deliberate: it keeps parameter checking bivariant so the
// sass-embedded module — whose Logger/SourceSpan option shapes are richer than the members this
// wrapper touches — remains assignable at this boundary.
interface SassAsyncCompiler {
    compileStringAsync(source: string, options?: SassCompileOptions): Promise<SassCompileResult>;
    dispose(): void | Promise<void>;
}

interface SassImplementation {
    compileStringAsync(source: string, options?: SassCompileOptions): Promise<SassCompileResult>;
    initAsyncCompiler(): Promise<SassAsyncCompiler>;
}

type SassError = Error & {
    sassMessage?: string;
    sassStack?: string;
    span?: LoggerSpan;
};

interface LoadResult {
    contents: string;
    syntax: 'scss' | 'css';
    sourceMapUrl: URL;
}

// Component files are canonicalized under this custom scheme so that every load — including
// relative loads from injected or authored files — comes back through this importer. Returning
// `file:` URLs instead would hand relative resolution to the compiler's built-in filesystem
// importer and bypass injection.
const CANONICAL_SCHEME = 'spryker-yves';

const INJECTED_SASS_BUILTIN_MODULES = ['map', 'list', 'color', 'string', 'math', 'meta', 'selector'];

const COMPONENT_PATH_PATTERN =
    /\/Theme\/[^/]+\/(?:components\/(?:atoms|molecules|organisms)|templates|views)\/[^/]+\/.+\.scss$/;
const STYLES_PATH_PATTERN = /\/Theme\/[^/]+\/styles\//;
// A non-partial file directly inside `Theme/<theme>/styles/` — `basic.scss`, `util.scss` and the
// project equivalents. Nested files (`styles/helpers/`, `styles/settings/`, …) and Sass partials
// (leading underscore) are deliberately not matched.
const STYLE_ROOT_PATTERN = /\/Theme\/[^/]+\/styles\/(?!_)[^/]+\.scss$/;
const SHARED_FILE_PATTERN = /\/_?shared\.scss$/;
const SHARED_REQUEST_PATTERN = /^ShopUi\/styles\/_?shared(?:\.scss)?$/;
const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

// Default when no mixin index is passed (direct factory use, e.g. in tests). The real index
// (libs/sass/mixin-index.mts) implements the same contract: `resolveDependencies(content,
// canonicalPath)` returns the absolute paths of the files defining the mixins that `content`
// includes but does not define; `getFingerprint()` returns a string that changes whenever the
// index content changes (feeds the webpack cache version).
const createNoOpMixinIndex = (): MixinIndex => ({
    resolveDependencies: () => [],
    getFingerprint: () => 'no-op-mixin-index',
});

const CANONICAL_URL_IN_TEXT_PATTERN = new RegExp(`${CANONICAL_SCHEME}://[^\\s'"]+`, 'g');

const translateCanonicalUrlsInText = (text: string): string =>
    text.replace(CANONICAL_URL_IN_TEXT_PATTERN, (canonicalUrlText) => {
        try {
            return pathFromCanonicalUrl(new URL(canonicalUrlText));
        } catch {
            return canonicalUrlText;
        }
    });

const translateSpan = (span: LoggerSpan | undefined): LoggerSpan | undefined => {
    if (!span?.url || span.url.protocol !== `${CANONICAL_SCHEME}:`) {
        return span;
    }

    return { ...span, url: pathToFileURL(pathFromCanonicalUrl(span.url)) };
};

const translateLoggerOptions = (loggerOptions: LoggerOptions | undefined): LoggerOptions | undefined => {
    if (!loggerOptions) {
        return loggerOptions;
    }

    const translatedOptions = { ...loggerOptions };

    if (loggerOptions.span !== undefined) {
        translatedOptions.span = translateSpan(loggerOptions.span);
    }

    if (typeof loggerOptions.stack === 'string') {
        translatedOptions.stack = translateCanonicalUrlsInText(loggerOptions.stack);
    }

    return translatedOptions;
};

// Sass warning and debug spans (unlike compile errors) are not translated by the compiler, so a
// deprecation warning from a component file — which this importer canonicalizes under the custom
// scheme — reports its location as `spryker-yves:///...` and masks the real file the customer must
// edit. This wraps a logger so every warning/debug span and stack points back at the filesystem
// path, single-sourced with the compile-error translation above.
const createSpanTranslatingLogger = (delegateLogger: SassLogger | undefined): SassLogger | undefined => {
    if (!delegateLogger) {
        return delegateLogger;
    }

    const translatedLogger: SassLogger = { ...delegateLogger };

    const delegateWarn = delegateLogger.warn;
    if (delegateWarn) {
        translatedLogger.warn = (message, loggerOptions) =>
            delegateWarn(translateCanonicalUrlsInText(message), translateLoggerOptions(loggerOptions));
    }

    const delegateDebug = delegateLogger.debug;
    if (delegateDebug) {
        translatedLogger.debug = (message, loggerOptions) =>
            delegateDebug(translateCanonicalUrlsInText(message), translateLoggerOptions(loggerOptions));
    }

    return translatedLogger;
};

const withSpanTranslatingLogger = (options: SassCompileOptions | undefined): SassCompileOptions | undefined => {
    if (!options?.logger) {
        return options;
    }

    return { ...options, logger: createSpanTranslatingLogger(options.logger) };
};

const translateCompileError = (error: unknown): unknown => {
    if (!(error instanceof Error)) {
        return error;
    }

    // Safe widening: the instanceof guard above proves Error, and every SassError-specific
    // field is read optionally below.
    const sassError = error as SassError;
    const translatedError: SassError = new Error(translateCanonicalUrlsInText(sassError.message ?? ''));
    translatedError.name = sassError.name;
    translatedError.stack = translateCanonicalUrlsInText(sassError.stack ?? '');

    if (sassError.sassMessage !== undefined) {
        translatedError.sassMessage = translateCanonicalUrlsInText(sassError.sassMessage);
    }

    if (sassError.sassStack !== undefined) {
        translatedError.sassStack = translateCanonicalUrlsInText(sassError.sassStack);
    }

    if (sassError.span !== undefined) {
        translatedError.span = translateSpan(sassError.span);
    }

    return translatedError;
};

// sass-loader's error handler calls `fileURLToPath(error.span.url)` on every modern-API compile
// error. For files canonicalized under the custom scheme that call crashes with
// ERR_INVALID_URL_SCHEME and masks the real Sass error, so the implementation passed to
// sass-loader must rewrite custom-scheme URLs in compile errors back to their filesystem form.
// The same wrapper also rewrites warning/debug spans (via the logger sass-loader supplies in the
// compile options) so deprecation warnings report the real file, not `spryker-yves:///...`.
export const createErrorTranslatingSassImplementation = (
    sassImplementation: SassImplementation,
): SassImplementation => ({
    ...sassImplementation,
    compileStringAsync: async (source, options) => {
        try {
            return await sassImplementation.compileStringAsync(source, withSpanTranslatingLogger(options));
        } catch (error) {
            throw translateCompileError(error);
        }
    },
    initAsyncCompiler: async () => {
        const asyncCompiler = await sassImplementation.initAsyncCompiler();

        return {
            compileStringAsync: async (source, options) => {
                try {
                    return await asyncCompiler.compileStringAsync(source, withSpanTranslatingLogger(options));
                } catch (error) {
                    throw translateCompileError(error);
                }
            },
            dispose: () => asyncCompiler.dispose(),
        };
    },
});

const canonicalUrlFromPath = (absolutePath: string): URL =>
    new URL(`${CANONICAL_SCHEME}://${pathToFileURL(absolutePath).href.slice('file://'.length)}`);

const pathFromCanonicalUrl = (canonicalUrl: URL): string =>
    fileURLToPath(new URL(`file://${canonicalUrl.href.slice(`${CANONICAL_SCHEME}://`.length)}`));

const pathFromContainingUrl = (containingUrl: URL | null): string | null => {
    if (!containingUrl) {
        return null;
    }

    if (containingUrl.protocol === `${CANONICAL_SCHEME}:`) {
        return pathFromCanonicalUrl(containingUrl);
    }

    if (containingUrl.protocol === 'file:') {
        return fileURLToPath(containingUrl);
    }

    return null;
};

const declaresSassBuiltinModule = (content: string, moduleName: string): boolean =>
    content.includes(`@use 'sass:${moduleName}'`) || content.includes(`@use "sass:${moduleName}"`);

// Single source of the injection scope decision — the importer (loaded files) and the
// sass-loader `additionalData` root injection (entry files) must agree on it.
export const isInjectableComponentPath = (filePath: string): boolean =>
    COMPONENT_PATH_PATTERN.test(filePath) && !STYLES_PATH_PATTERN.test(filePath);

/**
 * Global style entry roots need the shared context too: a project that still writes them in the
 * legacy `@import` form has nothing in the file itself that loads shared, so every `helper-*` and
 * `$setting-*` reference reached through its partials would be undefined.
 *
 * Only entry roots qualify. The partials such a root pulls in (`styles/helpers/`,
 * `styles/settings/`, …) are what shared itself is built from, so injecting there would make shared
 * load through itself; they need no banner anyway, because an `@import`ed file sees the members the
 * importing root loaded with `@use … as *`. The shared stylesheet is excluded for the same reason.
 */
export const isInjectableStyleRootPath = (filePath: string): boolean =>
    STYLE_ROOT_PATTERN.test(filePath) && !SHARED_FILE_PATTERN.test(filePath);

// Everything under `Theme/<theme>/styles/`. Membership alone decides nothing — it only routes the
// file through this importer so the per-file injection decision can be made in `load()`.
export const isStyleGraphPath = (filePath: string): boolean => STYLES_PATH_PATTERN.test(filePath);

/**
 * Prepares the shared, per-build state of the Sass injection and returns its two consumers:
 * `createImporter` produces importer instances — one per webpack loader invocation, so that
 * `onFileLoaded` can register loaded files as dependencies of the module being compiled (webpack
 * cannot see loads under the custom scheme in `loadedUrls`) — and `buildInjectionBanner` builds
 * the same single-line banner for entry files (Sass roots never pass through `load()`, so
 * sass-loader's `additionalData` prepends it there).
 *
 */
export const createSassInjectionImporterFactory = ({
    aliasList,
    projectWrapperPath = null,
    mixinIndex = createNoOpMixinIndex(),
    isInjectionDebuggingEnabled = false,
}: {
    aliasList: Record<string, string>;
    projectWrapperPath?: string | null;
    mixinIndex?: MixinIndex;
    isInjectionDebuggingEnabled?: boolean;
}) => {
    const coreShopUiThemePath = aliasList.ShopUi;

    if (!coreShopUiThemePath) {
        throw new Error(
            `Cannot create the Sass injection importer: the alias list built from tsconfig.yves.json has no ` +
                `'ShopUi' entry, so the core shared stylesheet cannot be located. Add the 'ShopUi/*' path ` +
                `mapping to tsconfig.yves.json.`,
        );
    }

    const coreSharedPath = join(coreShopUiThemePath, 'styles', 'shared.scss');

    if (!isExistingFile(coreSharedPath)) {
        throw new Error(
            `Cannot create the Sass injection importer: the core shared stylesheet ${coreSharedPath} does not ` +
                `exist. Verify the 'ShopUi' alias in tsconfig.yves.json points at the core ShopUi theme directory.`,
        );
    }

    const sharedTargetPath = projectWrapperPath ?? coreSharedPath;
    const sharedTargetCanonicalUrl = canonicalUrlFromPath(sharedTargetPath).href;

    // Both shared stylesheets seed the closure: a project wrapper loads core shared, and the files
    // either of them pulls in must never have shared injected back into them.
    const needsSharedInjection = createStyleFileInjectionDecider({
        sharedRootPaths: [sharedTargetPath, coreSharedPath],
        aliasList,
    });

    // Longest prefix first, so a hypothetical alias that prefixes another one cannot shadow it.
    const aliasEntries = Object.entries(aliasList).sort(
        ([aliasNameA], [aliasNameB]) => aliasNameB.length - aliasNameA.length,
    );

    const resolveAliasRequest = (request: string, requestingFilePath: string | null): string | null => {
        for (const [aliasName, aliasTargetPath] of aliasEntries) {
            if (request !== aliasName && !request.startsWith(`${aliasName}/`)) {
                continue;
            }

            return resolveWithSassConventions(
                join(aliasTargetPath, request.slice(aliasName.length)),
                requestingFilePath,
            );
        }

        return null;
    };

    const sharedContextDeclarations = (content: string): string[] => [
        `@use '${sharedTargetCanonicalUrl}' as *;`,
        ...INJECTED_SASS_BUILTIN_MODULES.filter((moduleName) => !declaresSassBuiltinModule(content, moduleName)).map(
            (moduleName) => `@use 'sass:${moduleName}';`,
        ),
    ];

    const buildInjectionBanner = (content: string, canonicalPath: string): string => {
        return [
            ...sharedContextDeclarations(content),
            ...mixinIndex
                .resolveDependencies(content, canonicalPath)
                .map((ownerFilePath) => `@use '${canonicalUrlFromPath(ownerFilePath).href}' as *;`),
        ].join(' ');
    };

    // A style root resolves its own mixins through its own `@import`/`@forward` closure, so the
    // component mixin index must not run over it: names like `util-spacing` live only in that
    // closure and would be reported as unknown. Only the shared context is missing there.
    const buildStyleRootBanner = (content: string): string => sharedContextDeclarations(content).join(' ');

    const createImporter = ({ onFileLoaded }: { onFileLoaded?: (loadedFilePath: string) => void } = {}) => ({
        async canonicalize(
            requestUrl: string,
            canonicalizeContext: { containingUrl: URL | null },
        ): Promise<URL | null> {
            // A URL already in the canonical scheme comes from relative resolution against a file
            // this importer loaded; only the filesystem conventions remain to be applied.
            if (requestUrl.startsWith(`${CANONICAL_SCHEME}:`)) {
                const requestedPath = pathFromCanonicalUrl(new URL(requestUrl));
                const resolvedPath = resolveWithSassConventions(requestedPath, requestedPath);

                return resolvedPath ? canonicalUrlFromPath(resolvedPath) : null;
            }

            // Relative loads from a compilation entry point arrive pre-resolved as `file:` URLs
            // (the entry is compiled from a string and has no owning importer). Component-tree
            // files must not fall through to the built-in filesystem importer — that would skip
            // injection — so those are pulled into the canonical scheme here. Style-graph files come
            // along too: `load()` decides per file whether they need the shared banner, and it can
            // only decide for files it is asked to load.
            if (requestUrl.startsWith('file:')) {
                const requestedPath = fileURLToPath(new URL(requestUrl));
                const resolvedPath = resolveWithSassConventions(requestedPath, requestedPath);

                if (resolvedPath && (isInjectableComponentPath(resolvedPath) || isStyleGraphPath(resolvedPath))) {
                    return canonicalUrlFromPath(resolvedPath);
                }

                return null;
            }

            // Remaining schemes (pkg:, data:) are not ours; sass-loader's webpack importer handles them.
            if (URL_SCHEME_PATTERN.test(requestUrl)) {
                return null;
            }

            // Legacy webpack-style tilde prefix; sass-loader's modern API no longer strips it, we own it.
            const request = requestUrl.startsWith('~') ? requestUrl.slice(1) : requestUrl;
            const requestingFilePath = pathFromContainingUrl(canonicalizeContext.containingUrl);

            // Canonical remap: every reference to the shared stylesheet resolves to the project
            // wrapper (when present), so project branding reaches all files consistently. The
            // wrapper itself escapes to core, otherwise it would load itself.
            if (SHARED_REQUEST_PATTERN.test(request)) {
                const isRequestFromProjectWrapper =
                    projectWrapperPath !== null && requestingFilePath === projectWrapperPath;

                return canonicalUrlFromPath(isRequestFromProjectWrapper ? coreSharedPath : sharedTargetPath);
            }

            const aliasResolvedPath = resolveAliasRequest(request, requestingFilePath);

            if (aliasResolvedPath) {
                return canonicalUrlFromPath(aliasResolvedPath);
            }

            if (request.startsWith('/')) {
                const absoluteResolvedPath = resolveWithSassConventions(request, requestingFilePath);

                return absoluteResolvedPath ? canonicalUrlFromPath(absoluteResolvedPath) : null;
            }

            if (requestingFilePath) {
                const relativeResolvedPath = resolveWithSassConventions(
                    join(dirname(requestingFilePath), request),
                    requestingFilePath,
                );

                if (relativeResolvedPath) {
                    return canonicalUrlFromPath(relativeResolvedPath);
                }
            }

            return null;
        },

        async load(canonicalUrl: URL): Promise<LoadResult> {
            const canonicalPath = pathFromCanonicalUrl(canonicalUrl);

            if (onFileLoaded) {
                onFileLoaded(canonicalPath);
            }

            let content;

            try {
                content = await readFile(canonicalPath, 'utf8');
            } catch (error) {
                // Catch variables are `unknown`; readFile failures are always Error instances.
                throw new Error(
                    `Cannot read ${canonicalPath} while loading '${canonicalUrl}': ${(error as Error).message}. The file ` +
                        `resolved during canonicalization but could not be read — check for a concurrent file ` +
                        `removal and re-run the build.`,
                );
            }

            // Error and warning spans as well as source maps must point at the real file.
            const sourceMapUrl = pathToFileURL(canonicalPath);

            if (canonicalPath.endsWith('.css')) {
                return { contents: content, syntax: 'css', sourceMapUrl };
            }

            if (!isInjectableComponentPath(canonicalPath)) {
                if (!isStyleGraphPath(canonicalPath) || !needsSharedInjection(canonicalPath, content)) {
                    return { contents: content, syntax: 'scss', sourceMapUrl };
                }

                const styleBanner = buildStyleRootBanner(content);

                if (isInjectionDebuggingEnabled) {
                    console.log(
                        `[debug-injection] ${canonicalPath}\n    injected banner (style module): ${styleBanner}`,
                    );
                }

                return { contents: `${styleBanner} ${content}`, syntax: 'scss', sourceMapUrl };
            }

            const injectionBanner = buildInjectionBanner(content, canonicalPath);

            if (isInjectionDebuggingEnabled) {
                console.log(`[debug-injection] ${canonicalPath}\n    injected banner: ${injectionBanner}`);
            }

            // The banner is a single physical line prepended to the original first line, so
            // compiler error and warning line numbers keep matching the authored file.
            return {
                contents: `${injectionBanner} ${content}`,
                syntax: 'scss',
                sourceMapUrl,
            };
        },
    });

    return { buildInjectionBanner, buildStyleRootBanner, createImporter };
};
