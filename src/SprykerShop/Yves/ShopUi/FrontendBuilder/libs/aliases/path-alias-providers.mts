import { YVES_DIRECTORY_NAME } from '../../settings.mts';
import type { AliasProvider } from './alias-provider.mts';
import { moduleAliasProvider } from './module-aliases.mts';
import { createSharedThemeAliasProvider, type SharedThemeAliasOptions } from './shared-theme-aliases.mts';

// A generated build configuration splits every project namespace into two roots ending in the Yves layer, so a
// namespace root only comes from a settings file; the flat Shared shape under one is not searched (a documented
// gap the Back Office builder does not have).
export const SHARED_THEME_OPTIONS: SharedThemeAliasOptions = {
    applicationLayerDirectoryName: YVES_DIRECTORY_NAME,
    searchesFlatSharedLayerOfNamespaceRoots: false,
};

// The one place that decides which aliases the Yves build generates; a new kind is one more entry.
export const pathAliasProviders: AliasProvider[] = [
    moduleAliasProvider,
    createSharedThemeAliasProvider(SHARED_THEME_OPTIONS),
];
