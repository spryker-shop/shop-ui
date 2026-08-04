// Ambient build-time constant injected into the bundle by the development-watch DefinePlugin
// (__RELOAD_MANIFEST_URL__). Declared globally so tsc (tsconfig.base.json) type-checks the reload
// client; the browser value is substituted at build time and is absent from configs that do not
// inject the reload client.
declare const __RELOAD_MANIFEST_URL__: string;
