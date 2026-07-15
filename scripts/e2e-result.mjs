import { chromium } from "playwright-core";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const CDP_URL = process.env.CDP_URL || "http://localhost:29229";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  console.log("Connecting to Chrome via CDP at", CDP_URL);
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  try {
    console.log("1. Open an existing project on mobile");
    await page.goto(`${BASE_URL}/projects/0191bc50-b524-420b-8c8a-d41bd6f15a14`);
    await page.waitForLoadState("networkidle");
    const body = await page.locator("body").innerText();
    assert(body.includes("КаркасПро") || (await page.locator("img").count()) > 0, "Project not loaded");
    console.log("   Project loaded");

    console.log("2. Check result layout elements");
    const hasImage = await page.locator("img").first().isVisible({ timeout: 10000 });
    assert(hasImage, "Result image not visible");
    const hasDownload = await page.locator("text=Скачать").first().isVisible();
    assert(hasDownload, "Download action not visible");
    console.log("   Result layout OK");

    await page.screenshot({ path: "/tmp/e2e-result-mobile.png" });
    console.log("   Screenshot saved to /tmp/e2e-result-mobile.png");
  } catch (e) {
    console.error("E2E result test failed:", e.message);
    await page.screenshot({ path: "/tmp/e2e-result-failure.png" });
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
  }
}

run();
