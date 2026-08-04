import { describe, expect, it } from '@jest/globals';
import { merge } from 'webpack-merge';

// The watch config relies on webpack-merge appending its `plugins` override onto the base config's
// plugins rather than replacing them. This pins that default behavior for the installed
// webpack-merge v6 so a dependency bump that changed array-merge strategy would fail here.
describe('webpack-merge array-append behavior (watch plugin wiring precondition)', () => {
    it('appends the second configuration plugins array after the first rather than replacing it', () => {
        const merged = merge({ plugins: ['base-plugin-a', 'base-plugin-b'] }, { plugins: ['watch-plugin'] });

        expect(merged.plugins).toEqual(['base-plugin-a', 'base-plugin-b', 'watch-plugin']);
    });
});
