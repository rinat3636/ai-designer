import { chromium } from "playwright-core";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const CDP_URL = process.env.CDP_URL || "http://localhost:29229";
const MAX_ATTEMPTS = Number(process.env.E2E_ATTEMPTS || 2);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runOnce() {
  console.log("Connecting to Chrome via CDP at", CDP_URL);
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  try {
    console.log("1. Test /create mobile load");
    await page.goto(`${BASE_URL}/create`);
    await page.waitForLoadState("networkidle");
    await page.locator("text=Чат с ИИ-дизайнером").first().waitFor({ timeout: 15000 });
    const heading = await page.locator("h3").first().innerText({ timeout: 15000 });
    assert(heading.includes("Чат с ИИ-дизайнером"), `Unexpected heading: ${heading}`);
    console.log("   /create loaded with heading:", heading.trim());

    console.log("2. Wait for chat input");
    await page.waitForFunction(() => {
      const t = document.querySelector('textarea');
      return t && !t.disabled;
    }, { timeout: 15000 });
    console.log("   Chat active");

    console.log("3. Send a message and wait for result");
    await page.locator("textarea").fill("Нужен логотип для строительной компании КаркасПро, каркасные дома, минимализм, синий и серый, 1200x1200");
    await page.locator("button:has-text('OK')").click();
    const resultImg = page.locator("img[src^='/generated/']").first();
    await resultImg.waitFor({ timeout: 240000 });
    const src = await resultImg.getAttribute("src");
    assert(src && src.includes("/generated/"), "No generated image");
    console.log("   Result received:", src);
  } catch (e) {
    await page.screenshot({ path: "/tmp/e2e-failure.png" });
    throw e;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function run() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await runOnce();
      return;
    } catch (e) {
      console.error(`E2E attempt ${attempt}/${MAX_ATTEMPTS} failed:`, e.message);
      if (attempt === MAX_ATTEMPTS) {
        process.exitCode = 1;
      }
    }
  }
}

run();
