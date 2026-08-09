/**
 * Tiny generic observable store.
 *
 * Not tied to this app's shape — reusable anywhere a small piece of shared,
 * observable state is needed.
 *
 *   const store = createStore({ count: 0 });
 *   const unsubscribe = store.subscribe('count', (value, prev) => ...);
 *   store.set('count', 1);
 *   store.update({ count: 2 });
 *   store.subscribe((state, changedProp) => ...); // listen to everything
 */
export function createStore(initialState = {}) {
  let state = { ...initialState };
  const listeners = new Map(); // prop -> Set<(value, prev) => void>
  const wildcardListeners = new Set(); // (state, changedProp) => void

  /** Read the whole state, or a single property when `prop` is given. */
  function get(prop) {
    return prop === undefined ? state : state[prop];
  }

  /** Set a single property. No-op (and no notification) if unchanged. */
  function set(prop, value) {
    if (state[prop] === value) return;
    const prev = state[prop];
    state = { ...state, [prop]: value };
    notify(prop, value, prev);
  }

  /** Set several properties at once; each changed prop notifies once. */
  function update(partial) {
    const prevState = state;
    state = { ...state, ...partial };
    for (const prop of Object.keys(partial)) {
      if (prevState[prop] !== state[prop]) {
        notify(prop, state[prop], prevState[prop]);
      }
    }
  }

  /**
   * Subscribe to a single property: `subscribe('foo', (value, prev) => ...)`
   * or to every change: `subscribe((state, changedProp) => ...)`.
   * Returns an `unsubscribe` function. Never fires immediately — read
   * `get(prop)` first if you need the current value.
   */
  function subscribe(propOrCallback, maybeCallback) {
    if (typeof propOrCallback === "function") {
      const callback = propOrCallback;
      wildcardListeners.add(callback);
      return () => wildcardListeners.delete(callback);
    }
    const prop = propOrCallback;
    const callback = maybeCallback;
    if (!listeners.has(prop)) listeners.set(prop, new Set());
    listeners.get(prop).add(callback);
    return () => listeners.get(prop)?.delete(callback);
  }

  function notify(prop, value, prev) {
    listeners.get(prop)?.forEach((callback) => callback(value, prev));
    wildcardListeners.forEach((callback) => callback(state, prop));
  }

  return { get, set, update, subscribe };
}
