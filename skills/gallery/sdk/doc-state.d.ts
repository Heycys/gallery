export type DocStateChange =
  | { type: "set"; key: string }
  | { type: "update"; keys: string[] }
  | { type: "reset" }
  | { type: "hydrate" };

export interface DocState<T extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: string;
  readonly version: number;
  get<K extends keyof T>(key: K, fallback?: T[K]): T[K];
  snapshot(): T;
  set<K extends keyof T>(key: K, value: T[K]): void;
  update(values: Partial<T>): void;
  /** Restore defaults and save them, so an older embedded snapshot cannot reappear. */
  reset(): void;
  subscribe(listener: (snapshot: T, change: DocStateChange) => void): () => void;
  serialize(): string;
  hydrate(serialized: string): void;
}

export interface DocStateOptions<T extends Record<string, unknown>> {
  /** The state's name within this document, such as "view". Storage is kept per document (its data-doc-id), so "view" and "<slug>:view" name the same state. */
  id: string;
  /** Positive integer checked against stored/embedded snapshots. */
  version: number;
  /** JSON-serializable default state; reuse one instance per id/version. */
  defaults: T;
  /** Overrides the browser storage key; normally left out. */
  storageKey?: string;
  /** A name the state was kept under before (a component's instance before it had a block id): read when nothing is kept under `id`, and carried to it. */
  formerId?: string;
  /** Default: []; excluded from browser restoration and exported snapshots. */
  transientKeys?: Array<keyof T & string>;
}

export interface DocStateFactory {
  readonly schemaVersion: 1;
  /** Throws when the state exists already: one id and version is one state. */
  create<T extends Record<string, unknown>>(options: DocStateOptions<T>): DocState<T>;
  /** The state of this id: the one made already when its version and the shape of its defaults are these, a new one when there is none, and an error otherwise. */
  getOrCreate<T extends Record<string, unknown>>(options: DocStateOptions<T>): DocState<T>;
  serializeAll(): string;
}
