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
    console.log("1. Test /create mobile load");
    await page.goto(`${BASE_URL}/create`);
    await page.waitForLoadState("networkidle");
    const heading = await page.locator("h1").first().innerText({ timeout: 10000 });
    assert(heading.includes("Выберите тип дизайна"), "Template selection heading not found");
    console.log("   /create loaded with heading:", heading.trim());

    console.log("2. Select 'Логотип' template");
    await page.locator('.cursor-pointer:has-text("Логотип")').first().click();
    // wait for the chat to become active
    await page.waitForFunction(() => {
      const t = document.querySelector('textarea');
      return t && !t.disabled;
    }, { timeout: 10000 });
    const activePlaceholder = await page.locator("textarea").getAttribute("placeholder");
    assert(activePlaceholder === "Ваш ответ…", `Expected placeholder 'Ваш ответ…', got ${activePlaceholder}`);
    console.log("   Template selected, chat active");

    console.log("3. Send a message and wait for concepts");
    await page.locator("textarea").fill("Нужен логотип для строительной компании КаркасПро, каркасные дома, минимализм, синий и серый, 1200x1200");
    await page.locator("button:has-text('OK')").click();
    await page.locator("text=Выберите концепцию").first().waitFor({ timeout: 120000 });
    const bodyAfter = await page.locator("body").innerText();
    assert(bodyAfter.includes("Выберите концепцию"), "Concept selection not reached");
    console.log("   Concepts received");

    console.log("4. Select a concept");
    const firstConcept = page.locator('.cursor-pointer [data-slot="card-title"]').first();
    const conceptName = await firstConcept.innerText({ timeout: 10000 });
    await firstConcept.click();
    await page.waitForTimeout(2000);
    const generatingText = await page.locator("body").innerText();
    const hasImage = await page.locator("img").count() > 0;
    assert(generatingText.includes("Генерируем") || generatingText.includes("Макеты") || hasImage, "Generation did not start");
    console.log("   Concept selected:", conceptName.trim());
  } catch (e) {
    console.error("E2E test failed:", e.message);
    await page.screenshot({ path: "/tmp/e2e-failure.png" });
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
  }
}

run();
