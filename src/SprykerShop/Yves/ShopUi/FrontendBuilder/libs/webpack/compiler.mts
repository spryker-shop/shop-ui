import webpack from 'webpack';
import type { Configuration as WebpackConfiguration } from 'webpack';

export interface BuildConfiguration {
    namespace: string;
    theme: string;
    componentEntryPointsLength: number;
    stylesLength: number;
    webpack: WebpackConfiguration;
}

export const multiCompile = (configs: BuildConfiguration[]): void => {
    if (!configs || !configs.length) {
        console.error('Nothing to build. Build aborted.');

        return;
    }

    configs.forEach((config) => {
        if (config.webpack.watch) {
            console.log(`${config.namespace} (${config.theme}) watch mode: ON`);
        }
    });

    const webpackConfigs = configs.map((item) => item.webpack);
    webpack(webpackConfigs, (err, multiStats) => {
        if (err) {
            console.error(err.stack || err);

            // webpack's callback error carries an optional `details` field not present on the base
            // Error type; the cast reaches it without widening the whole callback signature.
            const detailedError = err as Error & { details?: string };

            if (detailedError.details) {
                console.error(detailedError.details);
            }

            return;
        }

        // Non-null: the error branch above returns when webpack provides no stats object.
        multiStats!.stats.forEach((stat, index) => {
            console.log(`${configs[index].namespace} namespace building statistics:`);
            console.log(`Theme: ${configs[index].theme}`);
            console.log(`Components entry points: ${configs[index].componentEntryPointsLength}`);
            console.log(`Components styles: ${configs[index].stylesLength}`);
            console.log(stat.toString(webpackConfigs[index].stats), '\n');
        });
    });
};
