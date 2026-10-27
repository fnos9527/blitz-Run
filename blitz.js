const { chromium } = require('playwright');

const EMAIL = process.env.BLITZ_EMAIL;
const PASSWORD = process.env.BLITZ_PASSWORD;
const APP_URL = 'https://dashboard.blitz.cloud/apps/99e3c4e4-ea46-4788-be63-5c29a66c59ce';

async function notify(text) {
  const { TG_BOT_TOKEN, TG_CHAT_ID } = process.env;
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text }),
    });
  } catch (e) { console.log('TG 发送失败', e.message); }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.setDefaultTimeout(30000);

  try {
    // 1. 打开首页并点击 Sign in
    await page.goto('https://blitz.cloud', { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: 'Sign in', exact: true })
      .or(page.getByRole('button', { name: 'Sign in', exact: true })).first().click();

    // 2. 登录页
    await page.waitForURL(/login\.blitz\.cloud/);
    await page.getByLabel('Email address').fill(EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    // 3. 等待回到 dashboard
    await page.waitForURL(/dashboard\.blitz\.cloud/, { timeout: 60000 });
    await page.screenshot({ path: '1-logged-in.png' });

    // 4. 跳转到容器页
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: '2-app.png' });

    // 5. 判断是否 Paused
    const paused = await page.getByText('Paused', { exact: true }).first().isVisible().catch(() => false);
    const startBtn = page.getByRole('button', { name: 'Start it again' }).first();

    if (!paused && !(await startBtn.isVisible().catch(() => false))) {
      console.log('容器不是暂停状态，无需操作');
      await browser.close();
      return;
    }

    console.log('容器已暂停，点击 Start it again');
    await startBtn.click();
    await page.waitForTimeout(8000);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: '3-after-start.png' });

    const stillPaused = await page.getByText('Paused', { exact: true }).first().isVisible().catch(() => false);
    if (stillPaused) {
      await notify('❌ Blitz 容器 Komari 启动失败，仍为 Paused');
      process.exitCode = 1;
    } else {
      await notify('✅ Blitz 容器 Komari 已从暂停状态重新启动');
    }
  } catch (e) {
    console.error(e);
    await page.screenshot({ path: 'error.png' }).catch(() => {});
    await notify('❌ Blitz 保活脚本出错：' + e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
