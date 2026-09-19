import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const fromRoot = (path: string) => join(process.cwd(), path);

describe("production readiness", () => {
  it("publishes the approved install manifest", async () => {
    const manifest = JSON.parse(await readFile(fromRoot("public/manifest.webmanifest"), "utf8")) as {
      id: string;
      name: string;
      short_name: string;
      start_url: string;
      scope: string;
      display: string;
      background_color: string;
      theme_color: string;
      icons: Array<{ sizes: string; src: string; type: string }>;
    };

    expect(manifest).toMatchObject({
      id: "/",
      name: "VKB Farm Manager",
      short_name: "VKB Farm",
      start_url: "/dashboard",
      scope: "/",
      display: "standalone",
      background_color: "#eef2f3",
      theme_color: "#057db8",
    });
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        { sizes: "192x192", src: "/icons/icon-192.png", type: "image/png" },
        { sizes: "512x512", src: "/icons/icon-512.png", type: "image/png" },
      ]),
    );
  });

  it("keeps API traffic network-only and scopes cache cleanup to VKB caches", async () => {
    const worker = await readFile(fromRoot("public/sw.js"), "utf8");

    expect(worker).toContain('url.pathname === "/api" || url.pathname.startsWith("/api/")');
    expect(worker).toContain("event.respondWith(fetch(request))");
    expect(worker).not.toContain("skipWaiting");
    expect(worker).not.toContain("indexedDB");
    expect(worker).toContain('cacheName.startsWith("vkb-")');
  });

  it("uses production bindings for every deploy path", async () => {
    const packageJson = JSON.parse(await readFile(fromRoot("package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["build:production"]).toBe("CLOUDFLARE_ENV=production vite build");
    expect(packageJson.scripts["deploy:dry-run"]).toContain("wrangler deploy --env production --dry-run");
    expect(packageJson.scripts.deploy).toContain("wrangler deploy --env production");
    expect(packageJson.scripts["db:migrate:remote"]).toContain("--env production --remote");
  });

  it("requires account-level Access before production identity mapping or deployment", async () => {
    const readme = await readFile(fromRoot("README.md"), "utf8");
    const accessStep = readme.indexOf("Protect all Workers");
    const identityStep = readme.indexOf("UPDATE people SET email");
    const deployStep = readme.indexOf("\nnpm run deploy\n");

    expect(accessStep).toBeGreaterThan(-1);
    expect(identityStep).toBeGreaterThan(accessStep);
    expect(deployStep).toBeGreaterThan(identityStep);
    expect(readme).toContain("All traffic");
    expect(readme).toContain("default-deny");
    expect(readme).toContain("forged `Cf-Access-Authenticated-User-Email`");
    expect(readme).not.toContain("Before the first deployment, open the Worker");
  });

  it("keeps native zoom and installed-window checks as explicit owner release gates", async () => {
    const [readme, status] = await Promise.all([
      readFile(fromRoot("README.md"), "utf8"),
      readFile(fromRoot("IMPLEMENTATION_STATUS.md"), "utf8"),
    ]);

    expect(readme).toContain("## Owner-browser release gates");
    expect(readme).toContain("native 200% browser zoom");
    expect(readme).toContain("installed standalone PWA window");
    expect(status).toContain("Code and automated PWA/accessibility acceptance: complete");
    expect(status).toContain("Owner-browser release gates: pending");
  });

  it("keeps developer setup locked and aligned with pre-deployment Access protection", async () => {
    const development = await readFile(fromRoot("docs/DEVELOPMENT.md"), "utf8");
    const accessStep = development.indexOf("Protect all Workers");
    const deployStep = development.indexOf("`npm run deploy`");

    expect(development).toContain("npm ci");
    expect(development).not.toContain("npm install\n");
    expect(accessStep).toBeGreaterThan(-1);
    expect(development).toContain("All traffic");
    expect(deployStep).toBeGreaterThan(accessStep);
  });
});
