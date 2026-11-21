// node update-fetch.mjs <cache file> <registry>: what gallery --version starts, detached and never
// waited for, when its cache of the registry's answer is stale (./updates.mjs): it asks the registry
// for @heycys/gallery's latest version (TIMEOUT at most), writes the cache, and exits; every failure
// quiet (the cache then says the check failed, and the version known before). The release bundles it
// as dist/update-fetch.mjs, beside the chunk of ./updates.mjs that starts it.
import { refreshCache } from "./updates.mjs";

const [file, registry] = process.argv.slice(2);
try {
  if (file && registry) await refreshCache(file, registry);
} catch {}
process.exit(0);
