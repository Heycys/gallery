import type { Plugin } from "vite";

/** Live report previews for `npm run dev:local`; see src/server/index.mjs. */
export declare function reportPreview(): Plugin;

/** Make the workspace when it is not there, bring its old layout into .gallery/ once and make its default home page when due; see src/server/index.mjs. */
export declare function adoptWorkspace(root: string, options?: { devState?: string | null }): Promise<{ adopted: boolean; copied: string[]; home: { did: string } }>;

/** The watcher's paths to leave alone in a workspace (.gallery/ but its pages, exports/); see src/server/index.mjs. */
export declare function ignoredIn(root: string): (file: string) => boolean;
