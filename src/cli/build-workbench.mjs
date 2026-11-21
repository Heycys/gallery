import fs from "node:fs/promises";
import path from "node:path";

// The release and a sandbox from source serve the same compiled workbench.
export async function buildWorkbench(root, web) {
  const { build } = await import("vite");
  const { default: react } = await import("@vitejs/plugin-react");
  await build({
    configFile: false, root, base: "/", publicDir: false, logLevel: "warn",
    plugins: [react()],
    build: { outDir: web, emptyOutDir: true, rollupOptions: { input: path.join(root, "src", "workbench", "app", "index.html") } },
  });
  await fs.rename(path.join(web, "src", "workbench", "app", "index.html"), path.join(web, "index.html"));
}
