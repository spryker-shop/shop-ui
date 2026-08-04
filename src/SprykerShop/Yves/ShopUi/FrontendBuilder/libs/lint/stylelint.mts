import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import commandLineParser from 'commander';
import stylelint from 'stylelint';
import { loadProjectGlobalSettings } from '../../settings.mts';

// Discover the project-level override the same way build.mts does, so the shipped
// package is not coupled to a project file.
const globalSettings = await loadProjectGlobalSettings();

commandLineParser
    .option('-f, --fix', 'execute stylelint in the fix mode.')
    .option('-p, --file-path <path>', 'execute stylelint only for this file.')
    .parse(process.argv);

const isFixMode = !!commandLineParser.fix;
const defaultFilePaths = [`${globalSettings.paths.sources.project}/**/*.scss`];
const filePaths = commandLineParser.filePath ? [commandLineParser.filePath] : defaultFilePaths;

// Config contract: the packaged stylelint.config.mjs is the default; a project-root
// .stylelintrc.js wins when present (project override / extension point).
const projectConfigPath = join(process.cwd(), '.stylelintrc.js');
const packagedConfigPath = fileURLToPath(new URL('./stylelint.config.mjs', import.meta.url));

let configFile;
if (existsSync(projectConfigPath)) {
    configFile = projectConfigPath;
} else if (existsSync(packagedConfigPath)) {
    configFile = packagedConfigPath;
} else {
    process.stderr.write(
        `Stylelint configuration could not be resolved (offending path: ${packagedConfigPath}). ` +
            `Neither a project-root override at ${projectConfigPath} nor the packaged default exists; ` +
            `a missing packaged config means the shipped ShopUi builder is broken. ` +
            `Restore FrontendBuilder/libs/lint/stylelint.config.mjs in the ShopUi package, or add a project-root .stylelintrc.js.\n`,
    );
    process.exit(1);
}

stylelint
    .lint({
        configFile,
        files: filePaths,
        formatter: 'string',
        fix: isFixMode,
    })
    .then(function (data) {
        if (data.errored) {
            const messages = JSON.parse(JSON.stringify(data.output));
            process.stdout.write(messages);
            process.exit(1);
        }
    })
    .catch(function (error) {
        console.error(error.stack);
        process.exit(1);
    });
