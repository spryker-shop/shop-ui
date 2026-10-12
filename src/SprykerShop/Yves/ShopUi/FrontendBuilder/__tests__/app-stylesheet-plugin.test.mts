import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import webpack from 'webpack';
import type { Stats } from 'webpack';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { createAppStylesheetPlugin } from '../libs/webpack/app-stylesheet-plugin.mts';
import { APP_ENTRY_NAME, APP_STYLESHEET_ENTRY_NAME } from '../libs/webpack/entry-points.mts';

const cssLoaderPath = createRequire(import.meta.url).resolve('css-loader');

let context: string;
let outputDirectory: string;
let stats: Stats;

// The two entries hold the same modules in opposite orders, so each assertion can tell which entry a file came from.
beforeAll(async () => {
    context = mkdtempSync(join(tmpdir(), 'yves-app-stylesheet-'));
    outputDirectory = join(context, 'public');
    writeFileSync(join(context, 'first.css'), '.first { color: red; }');
    writeFileSync(join(context, 'second.css'), '.second { color: blue; }');
    writeFileSync(join(context, 'first.js'), "import './first.css';");
    writeFileSync(join(context, 'second.js'), "import './second.css';");

    const compiler = webpack({
        mode: 'development',
        devtool: false,
        context,
        entry: {
            [APP_ENTRY_NAME]: ['./first.js', './second.js'],
            [APP_STYLESHEET_ENTRY_NAME]: ['./second.js', './first.js'],
        },
        output: { path: outputDirectory, filename: './js/test.[name].js' },
        module: { rules: [{ test: /\.css$/, use: [MiniCssExtractPlugin.loader, cssLoaderPath] }] },
        plugins: [new MiniCssExtractPlugin({ filename: './css/test.[name].css' }), createAppStylesheetPlugin()],
    });

    stats = await new Promise<Stats>((resolve, reject) =>
        compiler.run((error, result) => (error || !result ? reject(error) : resolve(result))),
    );
    await new Promise((resolve) => compiler.close(resolve));
});

afterAll(() => rmSync(context, { recursive: true, force: true }));

describe('app stylesheet plugin', () => {
    it('compiles without errors', () => {
        expect(stats.compilation.errors).toEqual([]);
    });

    it('takes app.css from the stylesheet entry, in that entry order', () => {
        const stylesheet = readFileSync(join(outputDirectory, 'css', 'test.app.css'), 'utf8');

        expect(stylesheet.indexOf('.second')).toBeLessThan(stylesheet.indexOf('.first'));
    });

    it('keeps app.js from the app entry, in that entry order', () => {
        const script = readFileSync(join(outputDirectory, 'js', 'test.app.js'), 'utf8');

        expect(script.indexOf('/first.js')).toBeGreaterThan(-1);
        expect(script.indexOf('/first.js')).toBeLessThan(script.indexOf('/second.js'));
    });

    it('emits no stylesheet besides app.css and no script for the stylesheet entry', () => {
        expect(readdirSync(join(outputDirectory, 'css'))).toEqual(['test.app.css']);
        expect(readdirSync(join(outputDirectory, 'js'))).not.toContain(`test.${APP_STYLESHEET_ENTRY_NAME}.js`);
    });
});
