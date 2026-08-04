import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

export const extractIconSprites = async ({
    sourcePath,
    targetPath,
}: {
    sourcePath: string | string[];
    targetPath: string;
}): Promise<void> => {
    try {
        console.info('Extracting icon sprites...');

        const sourcePaths = Array.isArray(sourcePath) ? sourcePath : [sourcePath];
        let twigContent: string | null = null;
        let usedPath: string | null = null;

        for (const path of sourcePaths) {
            if (existsSync(path)) {
                twigContent = await fs.readFile(path, 'utf8');
                usedPath = path;
                console.info(`Using icon sprite from: ${path}`);
                break;
            }
        }

        if (!twigContent) {
            throw new Error('None of the provided icon sprite paths exist');
        }

        const spacelessRegex = /{% apply spaceless %}([\s\S]*?)(?:{% endapply %}|$)/;
        const match = twigContent.match(spacelessRegex);

        if (!match || !match[1]) {
            throw new Error(`Could not find content within spaceless block in the Twig file: ${usedPath}`);
        }

        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="display: none;">\n${match[1]}\n</svg>`;

        const targetDir = dirname(targetPath);
        await fs.mkdir(targetDir, { recursive: true });
        await fs.writeFile(targetPath, svgContent, 'utf8');

        console.info('Icon sprites successfully extracted to', targetPath);
    } catch (error) {
        // Catch variables are `unknown`; everything thrown in this try is an Error instance.
        console.error('Error extracting icon sprites:', (error as Error).message);
    }
};
