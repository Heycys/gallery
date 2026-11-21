#!/usr/bin/env node
// The gallery command (package.json's bin). The Node it runs on is said first, in syntax any Node
// reads, before anything that needs a newer one is loaded; then the command line goes to the
// dispatcher (src/cli/gallery.mjs here; dist/cli.mjs in the release).
var parts = process.versions.node.split(".").map(Number);
if (parts[0] < 22 || (parts[0] === 22 && parts[1] < 13)) {
  console.error("Gallery needs Node 22.13 or newer; this is Node " + process.versions.node + ". Install the LTS from https://nodejs.org, then run the command again.");
  process.exit(1);
}
import("./gallery.mjs").then(function (gallery) { return gallery.main(); });
