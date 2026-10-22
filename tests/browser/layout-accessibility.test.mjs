import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startAuditServer} from '../../scripts/serve-audit-build.mjs';
import {installApiFixtures} from '../fixtures/api.mjs';
export const phase = 7;
const evidence = path.resolve('plan/audit-evidence/phase7');
fs.mkdirSync(evidence,{recursive:true});
const viewports = [{width:390,height:844},{width:768,height:1024},{width:1440,height:1000}];
async function session(run) {
  const server = await startAuditServer({port:4178});
  let browser;
  try {
    browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--disable-background-networking',`--log-file=${path.join(evidence,'chromium.log')}`]});
    await run(browser,server.origin);
  } finally {await browser?.close(); await server.close();}
}
async function open(browser,origin,viewport,options={}) {
  const context = await browser.newContext({viewport,deviceScaleFactor:1,serviceWorkers:'block',locale:'en-US',colorScheme:options.dark?'dark':'light',reducedMotion:options.reduced?'reduce':'no-preference'});
  await context.addCookies([{name:'strxldr-theme',value:options.dark?'dark':'light',url:origin}]);
  await context.addInitScript(({dark}) => {
    delete Navigator.prototype.serviceWorker;
    localStorage.setItem('theme',dark?'dark':'light');
    window.__shifts=[];
    new PerformanceObserver(list=>{for(const entry of list.getEntries()) if(!entry.hadRecentInput) window.__shifts.push({value:entry.value,time:entry.startTime,sources:entry.sources?.map(source=>({node:source.node?.tagName,html:source.node?.outerHTML?.slice(0,350),previous:source.previousRect,current:source.currentRect}))});}).observe({type:'layout-shift',buffered:true});
  },{dark:!!options.dark});
  const fixture = await installApiFixtures(context,{origin,...options});
  const page = await context.newPage();
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin);
  await page.getByPlaceholder('Search by username...').waitFor();
  await options.beforeReady?.(page);
  await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('html').evaluate(node=>node.classList.contains('dark')),!!options.dark,'requested theme actually rendered');
  return {context,page,fixture,errors};
}
async function finish(state) {
  assert.deepEqual(state.errors,[],'no browser exceptions');
  assert.deepEqual(state.fixture.blocked,[],'all external requests synthetic or blocked before network');
  await state.context.close();
}
test('TEST-016: 27 cold layout runs stay at CLS <= .10 with native viewport/full-page evidence', async()=>session(async(browser,origin)=>{
  const results=[];
  try {
    for(const viewport of viewports) for(const delay of [0,300,1000]) for(let repeat=0;repeat<3;repeat++) {
      const label=`cls-${viewport.width}-${delay}-${repeat}`;
      const state=await open(browser,origin,viewport,{dark:repeat===1,reduced:repeat===2,delayByKind:{snapshot:delay,table:delay*2,newStakers:delay*3,history:delay*2,raydium:delay*3,dex:delay*2,xsol:delay*3,balance:delay}});
      await state.page.waitForTimeout(500);
      const shifts=await state.page.evaluate(()=>window.__shifts);
      let maximum=0,score=0,start=0,last=0;
      for(const shift of shifts){if(shift.time-last>1000 || shift.time-start>5000){score=0;start=shift.time;} score+=shift.value; last=shift.time;maximum=Math.max(maximum,score);}
      const viewportImage=path.join(evidence,label+'-viewport.png'),fullPageImage=path.join(evidence,label+'-full.png');
      await state.page.screenshot({path:viewportImage,fullPage:false,scale:'css'});
      await state.page.screenshot({path:fullPageImage,fullPage:true,scale:'css'});
      const rows=await state.page.locator('table.table-custom').last().locator('tbody tr').filter({hasNot:state.page.locator('[colspan]')}).count();
      results.push({label,viewport,delay,repeat,theme:repeat===1?'dark':'light',reducedMotion:repeat===2,cls:maximum,shifts,rows,viewportImage,fullPageImage});
      await finish(state);
    }
  } finally {fs.writeFileSync(path.join(evidence,'cls.json'),JSON.stringify(results,null,2));}
  assert.equal(results.length,27);
  assert.deepEqual(results.filter(run=>run.cls>.10),[], 'each cold run <= .10; see sources and screenshots');
  assert.ok(results.every(run=>run.rows===10),'ten loaded leaderboard rows remain present');
}));
async function tableGeometry(page,expectedRows) {
  await page.waitForFunction(expected=>[...[...document.querySelectorAll('table.table-custom')].at(-1).querySelectorAll('tbody tr')].filter(row=>!row.querySelector('[colspan]')).length===Math.min(10,expected),expectedRows);
  const result=await page.locator('table.table-custom').last().evaluate(table=>{
    const headers=[...table.querySelectorAll('thead th')];
    const rows=[...table.querySelectorAll('tbody tr')].filter(row=>!row.querySelector('[colspan]'));
    return {rows:rows.length,overflow:document.documentElement.scrollWidth>innerWidth,display:getComputedStyle(table.tBodies[0]).display,geometry:rows.map(row=>({position:getComputedStyle(row).position,display:getComputedStyle(row).display,deltas:[...row.cells].map((cell,index)=>Math.abs(cell.getBoundingClientRect().x-headers[index].getBoundingClientRect().x))}))};
  });
  assert.equal(result.rows,Math.min(10,expectedRows));
  assert.equal(result.overflow,false,'column/filter/page states do not overflow the document');
  assert.equal(result.display,'table-row-group');
  for(const row of result.geometry){assert.equal(row.display,'table-row');assert.notEqual(row.position,'absolute');assert.ok(row.deltas.every(delta=>delta<=2),JSON.stringify(result));}
}
test('TEST-017: semantic ten-row pagination, alignment, filters and every mobile column',async()=>session(async(browser,origin)=>{
  assert.doesNotMatch(fs.readFileSync('src/index.tsx','utf8'),/useVirtualizer|@tanstack\/react-virtual/);
  assert.ok(!JSON.parse(fs.readFileSync('package.json','utf8')).dependencies?.['@tanstack/react-virtual']);
  for(const viewport of viewports) for(const count of [0,1,100,162,1000]) {
    const data=Object.fromEntries(Array.from({length:count},(_,i)=>[`demo${String(i).padStart(7,'0')}`,{staked:(count-i)*200000,unstaked:100}]));
    const state=await open(browser,origin,viewport,{snapshot:data}); const {page}=state;
    await tableGeometry(page,count);
    if(count>10){await page.getByRole('button',{name:'Next',exact:true}).click();await tableGeometry(page,count-10);await page.getByRole('button',{name:'Previous',exact:true}).click();}
    if(viewport.width===390) for(const column of ['unstaked','total','usdValue','rewards','staked']) {await page.locator('select').filter({has:page.locator('option[value="usdValue"]')}).selectOption(column);await tableGeometry(page,count);}
    await page.getByPlaceholder('Search by username...').fill('no-synthetic-account');
    await tableGeometry(page,0);
    await page.getByPlaceholder('Search by username...').fill('');await tableGeometry(page,count);
    if(count){const amount=page.locator('table.table-custom').last().locator('tbody tr').first().locator('td.cursor-pointer').first();const before=await amount.innerText();await amount.click();assert.notEqual(await amount.innerText(),before,'amount toggles to an alternate unit');await tableGeometry(page,count);}
    await page.getByText('No Stake',{exact:true}).first().click();await tableGeometry(page,0);
    await page.getByText('No Stake',{exact:true}).first().click();await tableGeometry(page,count);
    await finish(state);
  }
}));
test('loading and recoverable errors keep visible local content in both themes',async()=>session(async(browser,origin)=>{
  for(const dark of [false,true]){
    const loading=await open(browser,origin,viewports[0],{dark,delayMs:1000,beforeReady:async page=>{
      const busy=page.locator('[aria-busy="true"]').first();await busy.waitFor();assert.equal(await busy.isVisible(),true);
      assert.equal(await page.locator('header').isVisible(),true);
      await page.screenshot({path:path.join(evidence,`loading-${dark?'dark':'light'}.png`),fullPage:false,scale:'css'});
    }});
    await finish(loading);
    const state=await open(browser,origin,viewports[0],{dark,fail:'raydium'});
    const alert=state.page.getByRole('alert').first();await alert.waitFor();assert.equal(await alert.isVisible(),true);
    const retry=alert.getByRole('button',{name:'Retry',exact:true});assert.equal(await retry.isEnabled(),true);
    assert.equal(await state.page.locator('table.table-custom').last().locator('tbody tr').first().isVisible(),true);
    await state.page.screenshot({path:path.join(evidence,`error-${dark?'dark':'light'}.png`),fullPage:true,scale:'css'});
    await finish(state);
  }
}));
test('failed config/oracle keeps unavailable financial cards explicit and healthy snapshot rows usable',async()=>session(async(browser,origin)=>{
  for(const dark of [false,true]){
    const state=await open(browser,origin,viewports[0],{dark,fail:'table'});
    for(const title of ['Global Staked (API)','STRX Price']){
      const card=state.page.getByText(title,{exact:true}).locator('..').locator('..');
      assert.match(await card.innerText(),/Unavailable|N\/A/i,`${title} unavailable is explicit`);
      assert.doesNotMatch(await card.innerText(),/\b0\.0000|\$0(?:\.00)?\b/,`${title} does not invent a zero`);
      assert.equal(await card.getAttribute('aria-busy'),'false',`${title} failure releases loading state`);
    }
    assert.equal(await state.page.getByRole('button',{name:'Retry',exact:true}).first().isEnabled(),true);
    await tableGeometry(state.page,10);
    await state.page.screenshot({path:path.join(evidence,`table-api-error-${dark?'dark':'light'}.png`),fullPage:true,scale:'css'});
    await finish(state);
  }
}));
test('snapshot errors release reserved-card loading and expose Retry',async()=>session(async(browser,origin)=>{
  for(const dark of [false,true]){
    const state=await open(browser,origin,viewports[0],{dark,fail:'snapshot'});
    const card=state.page.getByText('Total Stakers',{exact:true}).locator('..').locator('..');
    assert.match(await card.innerText(),/Unavailable/i);
    assert.equal(await card.getAttribute('aria-busy'),'false');
    const pending=await state.page.locator('[aria-busy="true"]').allTextContents();
    assert.deepEqual(pending,[],'failed snapshot does not leave reserved cards perpetually loading');
    assert.equal(await state.page.getByRole('button',{name:'Retry',exact:true}).first().isEnabled(),true);
    await finish(state);
  }
}));
test('TEST-018/019: native modal keyboard containment, rerender, focus restoration and responsive header',async()=>session(async(browser,origin)=>{
  for(const viewport of viewports) for(const reduced of [false,true]){
    const state=await open(browser,origin,viewport,{reduced,dark:reduced});const {page}=state;
    const header=await page.locator('header').evaluate(header=>{
      const grid=header.firstElementChild, share=header.querySelector('[aria-label="Share page"]'),menu=header.querySelector('[aria-haspopup="menu"]'),logo=header.querySelector('img');
      return {tracks:getComputedStyle(grid).gridTemplateColumns.split(' ').length,share:share.getBoundingClientRect().toJSON(),menu:menu.getBoundingClientRect().toJSON(),logo:{src:logo.getAttribute('src'),width:logo.getAttribute('width'),height:logo.getAttribute('height')},overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert.equal(header.tracks,2); assert.equal(header.overflow,false);
    assert.ok(Math.abs((header.share.y+header.share.height/2)-(header.menu.y+header.menu.height/2))<=2);
    for(const box of [header.share,header.menu])assert.ok(box.x>=0 && box.right<=viewport.width);
    assert.match(header.logo.src,/\.webp$/);assert.equal(header.logo.width,'32');assert.equal(header.logo.height,'32');
    const opener=page.getByRole('button',{name:'About STRX Staking Leaderboard'});
    const prior=await page.evaluate(()=>document.body.style.overflow);
    for(const closeMode of ['Escape','Close']){
      await opener.focus();await opener.press('Enter');
      const dialog=page.getByRole('dialog');await dialog.waitFor();
      assert.equal(await dialog.evaluate(node=>node instanceof HTMLDialogElement && node.open && node.matches(':modal')),true);
      assert.equal(await page.getByRole('button',{name:'Close dialog',exact:true}).evaluate(node=>node===document.activeElement),true);
      for(const key of ['Tab','Tab','Tab','Shift+Tab','Shift+Tab','Shift+Tab']){await page.keyboard.press(key);const focus=await dialog.evaluate(node=>({contained:node.contains(document.activeElement),active:document.activeElement?.outerHTML?.slice(0,300)}));assert.equal(focus.contained,true,`${key}: ${JSON.stringify(focus)}`);}
      await page.getByRole('button',{name:'Share page'}).evaluate(node=>node.focus());
      assert.equal(await dialog.evaluate(node=>node.contains(document.activeElement)),true,'background cannot receive focus');
      // Viewport resize dispatches a real React state update while the modal is open.
      await page.setViewportSize({...viewport,height:viewport.height-1});
      if(closeMode==='Escape')await page.keyboard.press('Escape');else await dialog.getByRole('button',{name:'Close',exact:true}).click();
      await dialog.waitFor({state:'detached'});
      assert.equal(await opener.evaluate(node=>node===document.activeElement),true);
      assert.equal(await page.evaluate(()=>document.body.style.overflow),prior);
    }
    await finish(state);
  }
}));
