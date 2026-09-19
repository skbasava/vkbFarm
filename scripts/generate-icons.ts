import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "@playwright/test";

const root = process.cwd();
const source = await readFile(join(root, "public/icons/icon-source.svg"), "utf8");
const browser = await chromium.launch({ headless: true });

try {
  for (const size of [192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden}svg{display:block;width:100%;height:100%}</style>${source}`,
    );
    await page.screenshot({
      animations: "disabled",
      path: join(root, `public/icons/icon-${size}.png`),
      type: "png",
    });
    await page.close();
  }
} finally {
  await browser.close();
}
