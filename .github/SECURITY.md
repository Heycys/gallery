# Security policy

## Reporting a vulnerability

Please do not report security problems in a public issue. Use GitHub's private vulnerability reporting on this repository: [Report a vulnerability](https://github.com/heycys/gallery/security/advisories/new) (under the repository's Security tab).

Please include:

- the Gallery version (the first line of `gallery --version`), your operating system and your browser;
- the steps that show the problem, and what an attacker needs for it to work: a web page you visit, a document or file you open or import, a block pack you install;
- what the attacker gets: files read or written, documents changed, code run.

Gallery is maintained by one person, so a reply can take a while. Please leave time for a fixed release before you share the details.

## Supported versions

Fixes are made on the latest version and go out in a new release; only the latest release of `@heycys/gallery` on npm is supported. To update: `npm i -g @heycys/gallery`, then `gallery skill install`.

## What is in scope

Gallery runs a server on your computer that listens on 127.0.0.1 only. There is no account and no cloud service. A document is an HTML file, and Gallery runs the document's own scripts in the same page as the editor and the endpoints that save it: Gallery is meant for documents that you or your own agent wrote.

In scope, for example:

- a web page on another site, or a host name made to resolve to your computer, reaching the local server to read, change or create documents;
- a document, an import (Markdown, HTML, Word, PDF, CSV, EPUB, ZIP) or an asset path that reads or writes files outside the workspace;
- an image, attachment or embedded file served by Gallery that runs script in the editor's page;
- an exported file that loads or sends anything its content security policy should block;
- the route custom blocks use to go online reaching your computer or your local network, going online without the consent Gallery asks for, or exposing the keys Gallery keeps for sites.

Out of scope:

- what a document's own scripts can do once you open the document in Gallery: open only documents you trust;
- extensions and block packs you install: they are code you chose to run, and an extension's backend runs with your user's permissions;
- attacks that need someone who can already run programs as you on your computer;
- problems in your browser, in Node.js or in your agent: please report those to their projects.
