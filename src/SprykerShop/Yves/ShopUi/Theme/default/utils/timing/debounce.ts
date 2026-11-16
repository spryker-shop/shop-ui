export interface DebounceOptions {
    /** Call on the leading edge of the wait. Default `false`. */
    leading?: boolean;
    /** Call on the trailing edge of the wait. Default `true`. */
    trailing?: boolean;
    /** The longest time the call may be delayed, in milliseconds. Never shorter than `wait`. */
    maxWait?: number;
}

export interface DebouncedFunction<Args extends unknown[], Result> {
    (...args: Args): Result | undefined;
    /** Drops the pending call. */
    cancel(): void;
    /** Runs the pending call now and returns its result. */
    flush(): Result | undefined;
    /** Tells whether a call is waiting. */
    pending(): boolean;
}

/**
 * Delays `callback` until `wait` milliseconds passed since the last call of the returned function.
 * Returns the result of the latest completed call, `undefined` before the first one.
 * The same contract as lodash `debounce`, so `throttle` can be built on it.
 */
export function debounce<Args extends unknown[], Result>(
    callback: (...args: Args) => Result,
    wait = 0,
    options: DebounceOptions = {},
): DebouncedFunction<Args, Result> {
    const leading = options.leading ?? false;
    const trailing = options.trailing ?? true;
    const maxWait = options.maxWait === undefined ? undefined : Math.max(options.maxWait, wait);

    let timerId: ReturnType<typeof setTimeout> | undefined;
    let lastArgs: Args | undefined;
    let lastThis: unknown;
    let lastCallTime: number | undefined;
    let lastInvokeTime = 0;
    let result: Result | undefined;

    const invoke = (time: number): Result | undefined => {
        const args = lastArgs as Args;
        const context = lastThis;

        lastArgs = undefined;
        lastThis = undefined;
        lastInvokeTime = time;
        result = callback.apply(context, args);

        return result;
    };

    const shouldInvoke = (time: number): boolean =>
        lastCallTime === undefined ||
        time - lastCallTime >= wait ||
        (maxWait !== undefined && time - lastInvokeTime >= maxWait);

    const getRemainingWait = (time: number): number => {
        const remainingWait = wait - (time - (lastCallTime as number));

        return maxWait === undefined ? remainingWait : Math.min(remainingWait, maxWait - (time - lastInvokeTime));
    };

    const trailingEdge = (time: number): Result | undefined => {
        timerId = undefined;

        if (trailing && lastArgs) {
            return invoke(time);
        }

        lastArgs = undefined;
        lastThis = undefined;

        return result;
    };

    const onTimerExpired = (): void => {
        const time = performance.now();

        if (shouldInvoke(time)) {
            trailingEdge(time);

            return;
        }

        timerId = setTimeout(onTimerExpired, getRemainingWait(time));
    };

    const leadingEdge = (time: number): Result | undefined => {
        lastInvokeTime = time;
        timerId = setTimeout(onTimerExpired, wait);

        return leading ? invoke(time) : result;
    };

    const debounced = function (this: unknown, ...args: Args): Result | undefined {
        const time = performance.now();
        const isInvoking = shouldInvoke(time);

        lastArgs = args;
        lastThis = this;
        lastCallTime = time;

        if (isInvoking && timerId === undefined) {
            return leadingEdge(time);
        }

        if (isInvoking && maxWait !== undefined) {
            clearTimeout(timerId);
            timerId = setTimeout(onTimerExpired, wait);

            return invoke(time);
        }

        if (timerId === undefined) {
            timerId = setTimeout(onTimerExpired, wait);
        }

        return result;
    } as DebouncedFunction<Args, Result>;

    debounced.cancel = (): void => {
        clearTimeout(timerId);
        lastInvokeTime = 0;
        lastArgs = undefined;
        lastThis = undefined;
        lastCallTime = undefined;
        timerId = undefined;
    };

    debounced.flush = (): Result | undefined => (timerId === undefined ? result : trailingEdge(performance.now()));

    debounced.pending = (): boolean => timerId !== undefined;

    return debounced;
}
