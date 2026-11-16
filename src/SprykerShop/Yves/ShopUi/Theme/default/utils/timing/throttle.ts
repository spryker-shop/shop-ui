import { debounce, DebouncedFunction } from './debounce';

export interface ThrottleOptions {
    /** Call on the leading edge of the wait. Default `true`. */
    leading?: boolean;
    /** Call on the trailing edge of the wait. Default `true`. */
    trailing?: boolean;
}

/**
 * Calls `callback` at most once per `wait` milliseconds.
 * The same contract as lodash `throttle`: the calls made during the wait collapse into one trailing call.
 */
export function throttle<Args extends unknown[], Result>(
    callback: (...args: Args) => Result,
    wait = 0,
    options: ThrottleOptions = {},
): DebouncedFunction<Args, Result> {
    return debounce(callback, wait, {
        leading: options.leading ?? true,
        trailing: options.trailing ?? true,
        maxWait: wait,
    });
}
