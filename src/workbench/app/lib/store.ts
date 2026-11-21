import { useSyncExternalStore } from 'react';

/**
 * 极简 store：读、写、订阅。
 * 状态按不可变方式更新，组件用 useStore 订阅；selector 必须返回稳定值（原始值或已有对象引用）。
 */
export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next) {
      const value = typeof next === 'function' ? (next as (prev: T) => T)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      listeners.forEach(fn => fn());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export function useStore<T>(store: Store<T>): T;
export function useStore<T, S>(store: Store<T>, selector: (state: T) => S): S;
export function useStore<T, S>(store: Store<T>, selector?: (state: T) => S) {
  const pick = selector ?? ((s: T) => s as unknown as S);
  return useSyncExternalStore(store.subscribe, () => pick(store.get()));
}
