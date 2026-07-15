import fs from "fs";
import { chromium } from "playwright-core";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const CDP_URL = process.env.CDP_URL || "http://localhost:29229";
const MAX_ATTEMPTS = Number(process.env.E2E_ATTEMPTS || 2);
const CERT_PATH = "/tmp/cert_test.png";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const CERT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
  <rect width="800" height="600" fill="#f8f5ec"/>
  <rect x="20" y="20" width="760" height="560" fill="none" stroke="#b08d2f" stroke-width="6"/>
  <text x="400" y="180" text-anchor="middle" font-family="serif" font-size="56" fill="#1f2937" font-weight="700">СЕРТИФИКАТ</text>
  <text x="400" y="260" text-anchor="middle" font-family="serif" font-size="28" fill="#374151">Вручается Ивану Иванову</text>
  <text x="400" y="330" text-anchor="middle" font-family="serif" font-size="22" fill="#4b5563">за успешное прохождение курса</text>
  <text x="400" y="480" text-anchor="middle" font-family="serif" font-size="20" fill="#6b7280">Директор — А. А. Петров</text>
</svg>`;

async function ensureCertImage(browser) {
  if (fs.existsSync(CERT_PATH)) return;
  console.log("   Generating test certificate image at", CERT_PATH);
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const page = await context.newPage();
  await page.setContent(`<body style="margin:0">${CERT_SVG}</body>`);
  await page.screenshot({ path: CERT_PATH });
  await context.close();
}

async function runOnce() {
  console.log("Connecting to Chrome via CDP at", CDP_URL);
  const browser = await chromium.connectOverCDP(CDP_URL);
  await ensureCertImage(browser);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  try {
    console.log("1. Open /create");
    await page.goto(`${BASE_URL}/create`);
    await page.waitForSelector("text=Что хотите сделать?", { timeout: 15000 });

    console.log("2. Select 'Редактировать свой макет'");
    await page.locator('.cursor-pointer:has-text("Редактировать свой макет")').first().click();
    await page.waitForFunction(() => {
      const t = document.querySelector("textarea");
      return t && !t.disabled;
    }, { timeout: 15000 });

    console.log("3. Upload certificate image and request red background");
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(CERT_PATH);
    // wait for image chip to appear
    await page.waitForSelector("img[src^='/uploads/']", { timeout: 30000 });
    await page.locator("textarea").fill("Сделай фон красным, сохрани весь текст");
    await page.locator("button:has-text('OK')").click();

    console.log("4. Wait for result image");
    const resultImg = page.locator("img[src^='/generated/']").first();
    await resultImg.waitFor({ timeout: 240000 });
    const src = await resultImg.getAttribute("src");
    assert(src && src.includes("/generated/"), "No generated image");
    console.log("   Result image:", src);

    console.log("5. Verify red background in SVG");
    const svgText = await fetch(`${BASE_URL}${src}`).then((r) => r.text());
    assert(svgText.includes("СЕРТИФИКАТ"), "Certificate text not preserved");
    const isRedHex = (hex) => {
      const h = hex.length === 4 ? hex.replace(/([0-9a-f])/gi, "$1$1").slice(0, 7) : hex;
      const r = parseInt(h.slice(1, 3), 16);
      const g = parseInt(h.slice(3, 5), 16);
      const b = parseInt(h.slice(5, 7), 16);
      return r >= 120 && r > g * 1.5 && r > b * 1.5;
    };
    const fills = [...svgText.matchAll(/(?:fill|stop-color)="(#[0-9a-f]{3}(?:[0-9a-f]{3})?)"/gi)].map((m) => m[1]);
    assert(fills.some(isRedHex) || /(?:fill|stop-color)="red"/i.test(svgText), "Background not red");
    console.log("   SVG text and red background OK");
  } catch (e) {
    await page.screenshot({ path: "/tmp/e2e-image-edit-failure.png" });
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
      console.error(`E2E image edit attempt ${attempt}/${MAX_ATTEMPTS} failed:`, e.message);
      if (attempt === MAX_ATTEMPTS) {
        process.exitCode = 1;
      }
    }
  }
}

run();
