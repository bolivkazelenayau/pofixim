import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith('--')) continue;
    const key = part.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function parseTypesSpec(spec) {
  const value = (spec ?? '9-21').trim();
  const out = new Set();
  for (const chunk of value.split(',')) {
    const token = chunk.trim();
    if (!token) continue;
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      for (let t = min; t <= max; t += 1) out.add(t);
      continue;
    }
    const num = Number(token);
    if (Number.isInteger(num)) out.add(num);
  }
  return [...out].filter((t) => t >= 9 && t <= 21).sort((a, b) => a - b);
}

const args = parseArgs(process.argv);
const types = parseTypesSpec(args.types ?? process.env.HARVEST_TYPES ?? '9-21');
const count = Number(args.count ?? process.env.HARVEST_COUNT ?? 10);
const fillValue = process.env.HARVEST_FILL_VALUE ?? '1';
const debugFillOnly = process.env.HARVEST_DEBUG_FILL_ONLY === 'true';
const debugClickComposeOnly = process.env.HARVEST_DEBUG_CLICK_COMPOSE_ONLY === 'true';
const outDir = path.resolve(
  process.cwd(),
  'test_sources',
  'raw_live',
  new Date().toISOString().replace(/[:.]/g, '-'),
);

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright is not installed. Run: npm i -D playwright');
  process.exit(2);
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  headless: process.env.HARVEST_HEADLESS !== 'false',
  channel: process.env.HARVEST_BROWSER_CHANNEL ?? 'chrome',
});
const context = await browser.newContext({ locale: 'ru-RU' });
const page = await context.newPage();
const collected = [];

async function getConstructorFrame() {
  for (const frame of page.frames()) {
    const count = await frame.locator('input[name^="prob"]').count();
    if (count > 0) return frame;
  }
  return null;
}

async function dumpDebug(tag) {
  const debugDir = path.resolve(outDir, '_debug');
  await mkdir(debugDir, { recursive: true });
  await page.screenshot({ path: path.resolve(debugDir, `${tag}.png`), fullPage: true });
  await writeFile(path.resolve(debugDir, `${tag}.main.html`), await page.content(), 'utf8');

  const frames = page.frames();
  const meta = [];
  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    const html = await frame.content();
    await writeFile(path.resolve(debugDir, `${tag}.frame-${i}.html`), html, 'utf8');
    const probCount = await frame.locator('input[name^="prob"]').count();
    meta.push({ i, url: frame.url(), probCount });
  }
  await writeFile(path.resolve(debugDir, `${tag}.frames.json`), JSON.stringify(meta, null, 2), 'utf8');
}

async function gotoWithRetry(url, attempts = 3) {
  let lastError;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      return;
    } catch (error) {
      lastError = error;
      if (i < attempts) {
        const delay = 1500 * i;
        console.warn(`goto retry ${i}/${attempts} failed, waiting ${delay}ms...`);
        await page.waitForTimeout(delay);
      }
    }
  }
  throw lastError;
}

function buildWordUrl(url) {
  const u = new URL(url);
  u.searchParams.set('print', 'true');
  u.searchParams.set('svg', '0');
  u.searchParams.set('sol', 'true');
  u.searchParams.set('num', 'true');
  u.searchParams.set('ans', 'true');
  u.searchParams.set('attr1', 'true');
  u.searchParams.set('attr9', 'true');
  u.searchParams.set('attr5', 'true');
  u.searchParams.set('attr8', 'true');
  u.searchParams.set('attr3', 'true');
  u.searchParams.set('tt', '');
  u.searchParams.set('td', '');
  return u.toString();
}

async function detectVariantUrlFromFrames() {
  for (const frame of page.frames()) {
    const frameUrl = frame.url();
    if (/\/test\?id=\d+/i.test(frameUrl)) return frameUrl;
  }
  return null;
}

async function detectVariantUrlFromPageContent(attempts = 4) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      // If page is currently navigating, wait a bit and retry.
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
      const html = await page.content();
      const match = html.match(/\/test\?id=(\d+)&nt=True&pub=False/i);
      if (!match) return null;
      return `https://rus-ege.sdamgia.ru/test?id=${match[1]}&nt=True&pub=False`;
    } catch (error) {
      const msg = String(error?.message ?? error);
      if (!/navigating and changing the content/i.test(msg) || i === attempts) {
        return null;
      }
      await page.waitForTimeout(600 * i);
    }
  }
  return null;
}

async function clickByText(regex) {
  const locator = page.getByText(regex).first();
  await locator.waitFor({ timeout: 15000 });
  await locator.click();
}

async function clickComposeButton(preferredFrame) {
  const frames = preferredFrame ? [preferredFrame, ...page.frames().filter((f) => f !== preferredFrame)] : page.frames();
  const selectors = [
    'button.ConstructorForm-SubmitButton',
    'button[type="submit"].ConstructorForm-SubmitButton',
    'input[type="submit"].ConstructorForm-SubmitButton',
    '.ConstructorForm-SubmitButton',
  ];

  for (const frame of frames) {
    for (const selector of selectors) {
      const matched =
        selector === 'button.ConstructorForm-SubmitButton'
          ? frame.locator(selector).filter({ hasText: /Составить вариант/i })
          : frame.locator(selector);
      const total = await matched.count();
      if (!total) continue;

      console.log(`Compose candidates in frame: ${frame.url()} via selector: ${selector} (count=${total})`);
      for (let i = 0; i < total; i += 1) {
        const button = matched.nth(i);
        if (!(await button.isVisible())) continue;

        await button.scrollIntoViewIfNeeded();
        try {
          await button.click({ timeout: 8000 });
          return;
        } catch {
          try {
            await button.click({ force: true, timeout: 8000 });
            return;
          } catch {
            // continue to stronger fallbacks below
          }
        }

        // Fallback 1: real mouse click to element center.
        const box = await button.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.up();
          await page.waitForTimeout(250);
          if (/\/test\?id=\d+/i.test(page.url())) return;
        }

        // Fallback 2: DOM click + closest form.submit() inside the same frame.
        const clicked = await frame.evaluate((sel) => {
          const els = Array.from(document.querySelectorAll(sel));
          const visible = els.find((el) => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          });
          if (!visible) return false;
          visible.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          visible.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          visible.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          if (typeof visible.click === 'function') visible.click();
          const form = visible.closest('form');
          if (form && typeof form.submit === 'function') form.submit();
          return true;
        }, selector);
        if (clicked) {
          await page.waitForTimeout(250);
          if (/\/test\?id=\d+/i.test(page.url())) return;
        }
      }
    }
  }
  await clickByText(/Составить вариант/i);
}

async function submitConstructorForm(preferredFrame) {
  const frames = preferredFrame ? [preferredFrame, ...page.frames().filter((f) => f !== preferredFrame)] : page.frames();
  for (const frame of frames) {
    const submitted = await frame.evaluate(() => {
      const submitter =
        document.querySelector('button.ConstructorForm-SubmitButton') ||
        document.querySelector('input[type="submit"].ConstructorForm-SubmitButton') ||
        document.querySelector('.ConstructorForm-SubmitButton');
      const probInput = document.querySelector('input[name^="prob"]');
      const form =
        submitter?.closest('form') ||
        document.querySelector('form[action*="a=generate"]') ||
        probInput?.closest('form') ||
        document.querySelector('form');
      if (!form) return false;

      // First try exactly button-driven behavior.
      if (submitter) {
        submitter.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        submitter.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        submitter.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        if (typeof submitter.click === 'function') submitter.click();
      }

      // Then force submit of that same form with submitter context.
      if (typeof form.requestSubmit === 'function') {
        try {
          if (submitter) {
            form.requestSubmit(submitter);
          } else {
            form.requestSubmit();
          }
        } catch {
          form.requestSubmit();
        }
        return true;
      }
      if (typeof form.submit === 'function') {
        form.submit();
        return true;
      }
      return false;
    });
    if (submitted) {
      console.log(`Constructor form submitted directly in frame: ${frame.url()}`);
      return true;
    }
  }
  return false;
}

async function setTypeValues() {
  let frame = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    frame = await getConstructorFrame();
    if (frame) break;

    // Sometimes constructor appears only after opening the Russian subject page explicitly.
    const ruTab = page.getByText(/Русский язык/i).first();
    if (await ruTab.count()) {
      try {
        await ruTab.click({ timeout: 5000 });
      } catch {
        await ruTab.click({ force: true, timeout: 5000 });
      }
      await page.waitForTimeout(1200);
      frame = await getConstructorFrame();
      if (frame) break;
    }

    if (attempt < 4) {
      console.warn(`Constructor not found (attempt ${attempt}/4). Reloading page...`);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(1000 * attempt);
    }
  }

  if (!frame) {
    await dumpDebug('constructor-not-found');
    throw new Error(
      `Constructor inputs (name^="prob") not found after retries. Debug saved to ${path.resolve(outDir, '_debug')}`,
    );
  }

  // Reset state first, then set explicit values for selected types.
  const clearAll = frame.getByText(/убрать все/i).first();
  if (await clearAll.count()) {
    await clearAll.click();
  }

  for (const type of types) {
    let setOk = false;
    // Prefer exact mapping first: --types N -> probN.
    // Keep +1 as compatibility fallback for occasional constructor shifts.
    for (const name of [`prob${type}`, `prob${type + 1}`]) {
      const input = frame.locator(`input[name="${name}"]`).first();
      if (await input.count()) {
        await input.fill(fillValue);
        await input.blur();
        console.log(`Type ${type}: filled ${name}=${fillValue}`);
        setOk = true;
        break;
      }
    }

    if (!setOk) {
      console.warn(`Type ${type}: input not found`);
    }
  }
  await page.waitForTimeout(500);
  return frame;
}

for (let i = 0; i < count; i += 1) {
  await gotoWithRetry('https://rus-ege.sdamgia.ru/');
  const constructorFrame = await setTypeValues();
  if (debugFillOnly) {
    console.log(`Debug fill-only mode: set value "${fillValue}" for types ${types.join(',')}`);
    await page.waitForTimeout(30000);
    break;
  }

  // Capture variant URL even if Playwright misses a top-level URL transition.
  let requestedVariantUrl = null;
  const onRequest = (request) => {
    const url = request.url();
    if (/\/test\?id=\d+/i.test(url)) {
      requestedVariantUrl = url;
    }
  };
  page.on('request', onRequest);

  // Primary path: direct form submit is more stable than UI click for this constructor.
  let submitted = await submitConstructorForm(constructorFrame);
  if (!submitted) {
    console.warn('Direct constructor submit failed, trying compose button click fallback...');
    await clickComposeButton(constructorFrame);
  }
  let variantUrl = null;
  try {
    await page.waitForURL(/\/test\?id=\d+/i, { timeout: 25000 });
    variantUrl = page.url();
  } catch {
    if (requestedVariantUrl) {
      console.warn(`waitForURL missed navigation, using captured request URL: ${requestedVariantUrl}`);
      await gotoWithRetry(requestedVariantUrl);
      variantUrl = page.url();
    } else {
      // Some constructor runs submit into a hidden/secondary frame and top-level URL never changes.
      // Recover variant id from frame URL or page HTML and continue.
      const frameVariantUrl = await detectVariantUrlFromFrames();
      if (frameVariantUrl) {
        console.warn(`waitForURL missed navigation, using frame URL: ${frameVariantUrl}`);
        await gotoWithRetry(frameVariantUrl);
        variantUrl = page.url();
      } else {
        const htmlVariantUrl = await detectVariantUrlFromPageContent();
        if (htmlVariantUrl) {
          console.warn(`waitForURL missed navigation, using URL from page content: ${htmlVariantUrl}`);
          await gotoWithRetry(htmlVariantUrl);
          variantUrl = page.url();
        } else {
          await dumpDebug('variant-url-not-detected');
          throw new Error(
            `Compose submit/click completed, but variant URL was not detected. Debug saved to ${path.resolve(outDir, '_debug')}`,
          );
        }
      }
    }
  } finally {
    page.off('request', onRequest);
  }
  if (debugClickComposeOnly) {
    console.log(`Debug compose-click mode: navigated to ${variantUrl}`);
    console.log('Debug compose-click mode: stopping before print URL generation');
    await page.waitForTimeout(30000);
    break;
  }
  const wordUrl = buildWordUrl(variantUrl);
  await gotoWithRetry(wordUrl);
  const html = await page.content();
  const idMatch = variantUrl.match(/id=(\d+)/);
  const id = idMatch?.[1] ?? `idx-${i + 1}`;
  const file = path.resolve(outDir, `variant-${id}.html`);
  await writeFile(file, html, 'utf8');
  collected.push({ id, variantUrl, wordUrl, file });
  console.log(`Saved ${id} (${i + 1}/${count})`);
}

await writeFile(
  path.resolve(outDir, 'manifest.json'),
  JSON.stringify({ types, count, generatedAt: new Date().toISOString(), items: collected }, null, 2),
  'utf8',
);

await browser.close();
console.log(`Done. Raw variants saved to: ${outDir}`);
