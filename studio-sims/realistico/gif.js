const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto('http://127.0.0.1:8795/'); await p.waitForFunction('window.ready', null, { timeout: 240000 });
  await p.evaluate(() => view(31, 6, 2.9, 2.4, 1.35, 0.7));
  for (let i = 0; i < 60; i++) { await p.evaluate(t => step(t), 1 + i / 12); await p.screenshot({ path: `/tmp/rp/out/f${String(i).padStart(3, '0')}.png` }); }
  await b.close();
})();
