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
    console.log("1. Open /create");
    await page.goto(`${BASE_URL}/create`);
    await page.waitForSelector("text=Выберите тип дизайна", { timeout: 10000 });

    console.log("2. Select 'Сертификат' template");
    await page.locator('.cursor-pointer:has-text("Сертификат")').first().click();
    await page.waitForFunction(() => {
      const t = document.querySelector("textarea");
      return t && !t.disabled;
    }, { timeout: 10000 });

    console.log("3. Upload certificate image and request red background");
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles("/tmp/cert_test.png");
    // wait for image chip to appear
    await page.waitForSelector("img[src^='/uploads/']", { timeout: 20000 });
    await page.locator("textarea").fill("Сделай фон красным, сохрани весь текст");
    await page.locator("button:has-text('OK')").click();

    console.log("4. Wait for result image");
    const resultImg = page.locator("img[src^='/generated/']").first();
    await resultImg.waitFor({ timeout: 180000 });
    const src = await resultImg.getAttribute("src");
    assert(src && src.includes("/generated/"), "No generated image");
    console.log("   Result image:", src);

    console.log("5. Verify red background in SVG");
    const svgText = await fetch(`${BASE_URL}${src}`).then((r) => r.text());
    assert(svgText.includes("СЕРТИФИКАТ"), "Certificate text not preserved");
    const redMatch = svgText.match(/<rect[^>]*fill="(#[cC][0-9a-fA-F]{5}|#ef4444|red|#FF0000|#D32F2F|#cc0000|#c8102e)"/i);
    assert(redMatch, "Background not red");
    console.log("   SVG text and red background OK");
  } catch (e) {
    console.error("E2E image edit test failed:", e.message);
    await page.screenshot({ path: "/tmp/e2e-image-edit-failure.png" });
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
  }
}

run();
