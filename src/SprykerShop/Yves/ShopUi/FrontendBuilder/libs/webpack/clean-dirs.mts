import { existsSync, rmSync } from 'node:fs';

export const cleanDirs = (dirs: string[]): void => {
    for (const dir of dirs) {
        if (!existsSync(dir)) {
            return;
        }

        rmSync(dir, { recursive: true, force: true });
        console.log(`Cleaned: ${dir}`);
    }
};
