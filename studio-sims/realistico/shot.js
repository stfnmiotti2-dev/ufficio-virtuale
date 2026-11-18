const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('console', m => { if (m.type() === 'error') console.log('C:', m.text().slice(0, 200)); });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://127.0.0.1:8795/');
  await p.waitForFunction('window.ready', null, { timeout: 240000 });
  const views = JSON.parse(process.argv[2] || '[[-35,30,9.5,0.3,0.7,-0.6]]');
  for (let i = 0; i < views.length; i++) {
    await p.evaluate(v => { view(...v); step(1); }, views[i]);
    await p.screenshot({ path: `/tmp/rp/out/v${i}.png` });
  }
  await b.close();
})();
