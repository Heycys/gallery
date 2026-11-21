// Code languages as pasted: the name a fence (```js), a class (language-ts) or VS Code gives, as a
// language's display name (the names Notion's HTML writes in data-notion-code-syntax are read the same
// way); to-blocks.mjs takes the kit's own id from it where the kit knows the language
// (src/shared/code-languages.mjs).
// [display name, Prism's alias, file extensions].
const LANGUAGES = [
  ["ABAP", "abap", "abap"], ["Agda", "agda", "agda lagda"], ["Arduino", "arduino", "arduino ino"], ["ASCII Art", null, ""],
  ["Assembly", "nasm", "asm nasm s x86"], ["Bash", "bash", "bash sh"], ["BASIC", "basic", "basic"], ["BNF", "bnf", "bnf"],
  ["C", "c", "c h"], ["C#", "csharp", "cs csharp"], ["C++", "cpp", "c++ cpp cxx hpp hxx"], ["Clojure", "clojure", "clojure clojurescript clj cljs"],
  ["CoffeeScript", "coffeescript", "coffee coffeescript"], ["CSS", "css", "css"], ["Dart", "dart", "dart"], ["Dhall", "dhall", "dhall"],
  ["Diff", "diff", "diff"], ["Docker", "docker", "docker dockerfile"], ["EBNF", "ebnf", "ebnf"], ["Elixir", "elixir", "elixir ex exs"],
  ["Elm", "elm", "elm"], ["Erlang", "erlang", "erlang erl"], ["F#", "fsharp", "fs fsharp"], ["Flow", "flow", "flow flow.js"],
  ["Fortran", "fortran", "f03 f08 f77 f90 f95 for fortran"], ["Gherkin", "gherkin", "feature gherkin"], ["GLSL", "glsl", "glsl"], ["Go", "go", "go"],
  ["GraphQL", "graphql", "graphql gql"], ["Groovy", "groovy", "groovy"], ["Haskell", "haskell", "haskell hs lhs"], ["HCL", "hcl", "hcl"],
  ["HTML", "html", "html xhtml mhtml"], ["Idris", "idris", "idr idris lidr"], ["Java", "java", "java"], ["JavaScript", "jsx", "javascript js jsx webpack"],
  ["JSON", "json", "json jsonc eslintrc prettierrc stylelintrc babelrc"], ["Julia", "julia", "jl julia"], ["Kotlin", "kotlin", "kotlin kt"], ["LaTeX", "latex", "latex tex"],
  ["Less", "less", "less"], ["Lisp", "lisp", "cl lisp lsp"], ["LiveScript", "livescript", "livescript ls"], ["LLVM IR", "llvm", "llvm"],
  ["Lua", "lua", "lua"], ["Makefile", "makefile", "mk makefile"], ["Markdown", "markdown", "markdown md mdown"], ["Markup", "markup", "markup"],
  ["Mathematica", "mathematica", "mathematica nb wl wls"], ["MATLAB", "matlab", "matlab"], ["Mermaid", "mermaid", "mermaid"], ["Nix", "nix", "nix"],
  ["Notion Formula", "notion", "notion"], ["Objective-C", "objectivec", "m objc objectivec"], ["OCaml", "ocaml", "mli ml ocaml"], ["Pascal", "pascal", "pascal"],
  ["Perl", "perl", "perl pl"], ["PHP", "php", "php"], ["PowerShell", "powershell", "powershell ps1 psm1"], ["Prolog", "prolog", "pro prolog"],
  ["Protobuf", "protobuf", "proto protobuf"], ["PureScript", "purescript", "purescript purs"], ["Python", "python", "py python"], ["R", "r", "r"],
  ["Racket", "racket", "racket rkt scrbl"], ["Reason", "reason", "re reason rei"], ["Coq", "coq", "coq rocq v"], ["Ruby", "ruby", "rb ruby"],
  ["Rust", "rust", "rs rust"], ["Sass", "sass", "sass"], ["Scala", "scala", "scala"], ["Scheme", "scheme", "scheme scm"],
  ["Scss", "scss", "scss"], ["Shell", "bash", "shen shell bat cmd ps bashrc bash_profile"], ["Smalltalk", "smalltalk", "smalltalk st"], ["Solidity", "solidity", "solidity sol"],
  ["SQL", "sql", "sql"], ["Swift", "swift", "swift"], ["TOML", "toml", "toml"], ["TypeScript", "tsx", "ts tsx typescript"],
  ["VB.Net", "vbnet", "vb vbs"], ["Verilog", "verilog", "verilog"], ["VHDL", "vhdl", "vhdl"], ["Visual Basic", "visual-basic", "visual-basic vbnet"],
  ["WebAssembly", "wasm", "wasm wat"], ["XML", "xml", "xml"], ["YAML", "yaml", "yaml yml"],
  ["Plain Text", null, "txt log cfg ini conf gitignore gitattributes npmrc yarnrc editorconfig"],
];

/** The display name for a fence's name, a class's or an extension (Prism's alias, then an extension, then the name); undefined when unknown. */
export function languageFromFence(tag) {
  const name = String(tag ?? "").trim().toLowerCase();
  if (!name) return undefined;
  return (LANGUAGES.find((l) => l[1] === name) ?? LANGUAGES.find((l) => l[2].split(" ").includes(name)) ?? LANGUAGES.find((l) => l[0].toLowerCase() === name))?.[0];
}

// VS Code's language ids (its clipboard's vscode-editor-data) that no name, alias or extension above matches.
const VSCODE = { dockerfile: "Docker", javascriptreact: "JavaScript", jsonc: "JSON", "objective-c": "Objective-C", proto: "Protobuf", shellscript: "Shell", typescriptreact: "TypeScript", vb: "Visual Basic" };

/** The language of code copied from VS Code (its mode), Plain Text when unknown. */
export const vscodeLanguage = (mode) => VSCODE[mode] ?? languageFromFence(mode) ?? "Plain Text";
