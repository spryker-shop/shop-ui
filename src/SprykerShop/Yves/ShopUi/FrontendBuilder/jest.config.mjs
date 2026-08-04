// Builder sources and tests are TypeScript (.mts) run natively by Node 24 type stripping. Jest
// cannot strip types itself, so ts-jest transforms the .mts tree in ESM mode; the files execute as
// ES modules through Node's VM modules API, enabled by NODE_OPTIONS=--experimental-vm-modules in
// the documented run command. ts-jest is used (not @swc/jest) so no native binaries are pulled in.
//
// Run from the repository root:
//   NODE_OPTIONS=--experimental-vm-modules \
//   npx jest --config src/SprykerShop/ShopUi/src/SprykerShop/Yves/ShopUi/FrontendBuilder/jest.config.mjs
export default {
    displayName: 'yves-builder',
    rootDir: '.',
    testEnvironment: 'node',
    testMatch: ['<rootDir>/__tests__/**/*.test.mts'],
    // `js`/`mjs`/`json` are here to resolve imported dependencies (webpack, sass-embedded, chokidar,
    // package.json), not to match test files — testMatch above is `.mts`-only.
    moduleFileExtensions: ['mts', 'mjs', 'js', 'json'],
    extensionsToTreatAsEsm: ['.mts'],
    transform: {
        '^.+\\.mts$': [
            'ts-jest',
            {
                useESM: true,
                tsconfig: '<rootDir>/tsconfig.json',
            },
        ],
    },
    // Node type stripping requires the literal `.mts` extension on relative specifiers, but ts-jest
    // resolves them through Jest, which expects extensionless module ids. Map the `.mts` suffix away
    // so the same import statements resolve under both runtimes. Component `.ts` (tsconfig.base has
    // no allowImportingTsExtensions) imports extensionless and is resolved via moduleFileExtensions.
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.mts$': '$1',
    },
};
