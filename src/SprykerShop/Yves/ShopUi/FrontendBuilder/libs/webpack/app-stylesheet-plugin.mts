import webpack from 'webpack';
import type { Compilation, Compiler } from 'webpack';
import { APP_ENTRY_NAME, APP_STYLESHEET_ENTRY_NAME } from './entry-points.mts';

const PLUGIN_NAME = 'YvesAppStylesheetPlugin';

const isStylesheet = (file: string): boolean => file.endsWith('.css');

const findChunkFiles = (compilation: Compilation, chunkName: string): string[] =>
    [...compilation.chunks].filter((chunk) => chunk.name === chunkName).flatMap((chunk) => [...chunk.files]);

// Replaces the stylesheet of the `app` entry with the one of the `app-stylesheet` entry and drops the
// script of the latter, so a layout keeps loading app.js and app.css and nothing else changes. Runs before
// minimizing and source-map generation, so both apply to the final names.
const swapAppStylesheet = (compilation: Compilation): void => {
    findChunkFiles(compilation, APP_ENTRY_NAME)
        .filter(isStylesheet)
        .forEach((file) => compilation.deleteAsset(file));

    findChunkFiles(compilation, APP_STYLESHEET_ENTRY_NAME).forEach((file) => {
        if (!isStylesheet(file)) {
            compilation.deleteAsset(file);

            return;
        }

        compilation.renameAsset(file, file.replace(`.${APP_STYLESHEET_ENTRY_NAME}.`, `.${APP_ENTRY_NAME}.`));
    });
};

export const createAppStylesheetPlugin = () => ({
    apply(compiler: Compiler): void {
        compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
            compilation.hooks.processAssets.tap(
                { name: PLUGIN_NAME, stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_COUNT },
                () => swapAppStylesheet(compilation),
            );
        });
    },
});
