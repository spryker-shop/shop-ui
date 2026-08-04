import { mergeWithCustomize, customizeObject } from 'webpack-merge';
import CssMinimizerPlugin from 'css-minimizer-webpack-plugin';
import CompressionPlugin from 'compression-webpack-plugin';
import getConfiguration from './development.mts';
import type { AppSettings } from '../settings.mts';
import type { BuildConfiguration } from '../libs/webpack/compiler.mts';

const mergeWithStrategy = mergeWithCustomize<BuildConfiguration>({
    customizeObject: customizeObject({
        plugins: 'prepend',
    }),
});

const configurationProdMode = async (appSettings: AppSettings): Promise<BuildConfiguration> => {
    const baseConfiguration = await getConfiguration(appSettings);
    const productionOverride: Partial<BuildConfiguration> = {
        webpack: {
            mode: 'production',
            devtool: false,

            stats: {
                warnings: false,
            },

            plugins: [
                new CompressionPlugin({
                    filename: '[path][base].br[query]',
                    algorithm: 'brotliCompress',
                    test: /\.(js|css|html|svg)$/,
                    threshold: 10240,
                    minRatio: 0.8,
                }),
            ],

            optimization: {
                minimizer: [
                    '...',
                    new CssMinimizerPlugin({
                        minimizerOptions: {
                            preset: [
                                'default',
                                {
                                    discardComments: { removeAll: true },
                                },
                            ],
                        },
                    }),
                ],
            },
        },
    };

    // webpack-merge's single-type-parameter signature cannot express "partial override into a full
    // config"; the override is a deliberately partial BuildConfiguration merged into a complete one.
    return mergeWithStrategy(baseConfiguration, productionOverride as BuildConfiguration);
};

export default configurationProdMode;
