const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium, firefox } = require(process.env.REDDIT_TOOLBOX_PLAYWRIGHT_MODULE || 'playwright');
const out = process.env.REDDIT_TOOLBOX_BROWSER_OUTPUT || path.resolve(__dirname, '../artifacts/browser');
fs.mkdirSync(out, { recursive: true });
const script = fs.readFileSync(path.resolve(__dirname, '../userscripts/reddit-toolbox.user.js'), 'utf8');
const results = [];

async function exercise(browserType, label) {
  const browser = await browserType.launch({ headless: true });
  try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', reducedMotion: 'reduce' });
  const errors = [];
  const requests = [];
  const calls = [];
  const records = new Map();
  let signedIn = true;
  let deletionMode = 'removed-body';
  let identityRateOnce = false;
  let deleteReads = new Map();
  let owner = 'fixture-owner';
  const data = (name, kind='t1', self=true) => ({ kind, data: { name, id:name.slice(3), author:'fixture-owner', created_utc:1700000000, subreddit:'fixture', score:1, is_self:self, body:'Synthetic disposable fixture.', selftext:self?'Synthetic body.':'', title:'Synthetic title', permalink:'/r/fixture/comments/a/' } });
  const reset = (mixed=false) => {
    records.clear(); calls.length=0; deleteReads.clear();
    const rows=mixed?[data('t1_a'),data('t3_b','t3'),data('t3_c','t3',false)]:[data('t1_a'),data('t1_b')];
    for(const row of rows)records.set(row.data.name,row);
  };
  reset();
  await context.route('**/*', async (route) => {
    const request=route.request(); const url=new URL(request.url());
    requests.push(url.origin+url.pathname);
    if(url.origin !== 'https://www.reddit.com') throw new Error('Unexpected request origin: '+url.origin);
    let payload={};
    if(request.isNavigationRequest()) return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reddit Toolbox acceptance fixture</title></head><body style="margin:0;background:#edf0f2;font:16px system-ui"><main style="padding:40px"><h1>Reddit fixture</h1><p>Isolated browser acceptance. All API responses are synthetic.</p></main></body></html>'});
    if(url.pathname==='/api/me.json' && identityRateOnce){identityRateOnce=false;return route.fulfill({status:429,headers:{'retry-after':'1'},body:''});}
    if(url.pathname==='/api/me.json') payload={data:signedIn?{name:owner,modhash:'fixture-only'}:{}};
    else if(url.pathname.includes('/comments.json')) payload={data:{children:[...records.values()].filter(x=>x.kind==='t1'),after:null}};
    else if(url.pathname.includes('/submitted.json')) payload={data:{children:[...records.values()].filter(x=>x.kind==='t3'),after:null}};
    else if(url.pathname==='/api/info.json') payload={data:{children:records.has(url.searchParams.get('id'))?[records.get(url.searchParams.get('id'))]:[]}};
    else if(url.pathname==='/api/editusertext') {
      const values=new URLSearchParams(request.postData()); const row=records.get(values.get('thing_id'));
      assert.equal(values.get('uh'), 'fixture-only');
      assert.equal(request.headers()['x-modhash'], 'fixture-only');
      calls.push({op:'edit',id:row.data.name,page:request.frame().page()});
      row.data[row.kind==='t1'?'body':'selftext']=values.get('text');
      payload={json:{errors:[]}};
    } else if(url.pathname==='/api/del') {
      const values=new URLSearchParams(request.postData()); const row=records.get(values.get('id'));
      assert.equal(values.get('uh'), 'fixture-only');
      calls.push({op:'delete',id:row.data.name,page:request.frame().page()});
      const attempts=(deleteReads.get(row.data.name)||0)+1; deleteReads.set(row.data.name,attempts);
      if(deletionMode==='uncertain' && row.data.name==='t1_a') return route.abort('failed');
      if(deletionMode==='noop' && attempts===1) {}
      else if(deletionMode==='missing') records.delete(row.data.name);
      else if(deletionMode==='removed-body' && row.kind==='t1'){row.data.author='[deleted]';row.data.body='[removed]';}
      else {row.data.author=null; row.data[row.kind==='t1'?'body':'selftext']='[deleted]';}
    } else throw new Error('Unrecognized fixture endpoint: '+url.pathname);
    return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'https://www.reddit.com'},body:JSON.stringify(payload)});
  });
  await context.addInitScript({content:`globalThis.GM_getValue=(key,fallback)=>{const saved=localStorage.getItem(key);return saved?JSON.parse(saved):key.endsWith(':settings')?({...fallback,minimumDelaySeconds:1,maximumDelaySeconds:1}):fallback;};globalThis.GM_setValue=(key,value)=>localStorage.setItem(key,JSON.stringify(value));globalThis.GM_deleteValue=key=>localStorage.removeItem(key);\n${script}`});
  const newPage=async()=>{
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(['error','warning'].includes(message.type()))errors.push(message.text());});
    await page.goto('https://www.reddit.com/');
    assert.equal(await page.title(),'Reddit Toolbox acceptance fixture');
    await page.locator('.launcher').click();
    assert.equal(await page.locator('#oauth-client').count(),0);
    assert.equal(await page.locator('.connect').count(),0);
    return page;
  };
  const prepare=async(page,direct=false)=>{
    if(direct){await page.locator('.advanced summary').click();await page.locator('#delete-uneditable').check();}
    await page.locator('.scan').click();
    await page.waitForFunction(()=>!!globalThis.__redditToolboxApp.plan&&!globalThis.__redditToolboxApp.busy);
    assert.equal(await page.locator('.start').isEnabled(),true);
  };
  const page=await newPage();
  assert.equal(await page.locator('.advanced').getAttribute('open'),null);
  await page.screenshot({path:out+'/'+label+'-desktop.png'});
  const box=()=>page.locator('.panel').boundingBox();
  const drag=async(selector,dx,dy)=>{const r=await page.locator(selector).boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+dx,r.y+r.height/2+dy,{steps:12});await page.mouse.up();};
  const initial=await box();
  await drag('.brand',-350,-100);
  let moved=await box(); assert.ok(Math.abs(moved.x-initial.x+350)<2 && Math.abs(moved.y-initial.y+100)<2);
  await drag('.resize-right',180,-120);
  let resized=await box(); assert.ok(resized.width>moved.width+170&&resized.height<moved.height-110);
  await drag('.resize-left',-70,0);
  assert.ok((await box()).width>resized.width+60);
  await page.locator('.move-window').focus(); await page.keyboard.press('ArrowRight');
  await page.locator('.resize-right').focus(); await page.keyboard.press('Shift+ArrowDown');
  const saved=await box();
  await page.reload();await page.locator('.launcher').click();
  assert.deepEqual(await box(),saved);
  await page.locator('.close').click();await drag('.launcher',-150,-100);
  assert.equal(await page.locator('.panel').isVisible(),false);
  await page.locator('.launcher').click();assert.equal(await page.locator('.panel').isVisible(),true);
  await page.locator('.reset-window').click();assert.deepEqual(await box(),initial);
  await prepare(page);
  assert.equal(await page.locator('#limit-mode').inputValue(),'all');
  assert.equal(await page.locator('#max-items').isVisible(),false);
  await page.locator('#limit-mode').selectOption('count');
  await page.locator('#max-items').fill('1');
  await page.waitForFunction(()=>__redditToolboxApp.plan?.items.length===1);
  assert.equal(await page.locator('.start').textContent(),'Delete 1 item');
  await page.locator('.keep-item').click();
  assert.equal(await page.locator('.start').isDisabled(),true);
  await page.locator('#limit-mode').selectOption('all');
  await page.waitForFunction(()=>__redditToolboxApp.plan?.items.length===2);
  await drag('.resize-right',-200,-380);
  await page.screenshot({path:out+'/'+label+'-compact-review.png'});
  const compact=await box();const button=await page.locator('.start').boundingBox();
  assert.ok(button.y>=compact.y&&button.y+button.height<=compact.y+compact.height);
  await page.locator('.reset-window').click();
  assert.equal(await page.locator('.confirmation-input').count(),0);
  assert.equal(await page.locator('.build-preview').count(),0);
  await page.locator('.content').evaluate(el=>{el.scrollTop=el.scrollHeight;});
  assert.equal(await page.locator('.start').isVisible(),true);
  await page.screenshot({path:out+'/'+label+'-archive-review.png'});
  const second=await newPage(); await prepare(second);
  identityRateOnce = true;
  await page.locator('.start').click();
  await page.waitForFunction(()=>['running','waiting'].includes(globalThis.__redditToolboxApp.runner?.state));
  assert.equal(await page.locator('#include-comments').isDisabled(),true);
  const warning=await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});dispatchEvent(event);return event.defaultPrevented;});
  assert.equal(warning,true);
  await second.locator('.start').click();
  await second.waitForFunction(()=>!globalThis.__redditToolboxApp.busy);
  assert.match(await second.locator('.run-status').textContent(),/already active/);
  assert.equal(calls.filter(call=>call.page===second).length,0);
  await page.locator('.close').click();
  assert.equal(await page.locator('.panel').isVisible(),false);
  await page.waitForFunction(()=>globalThis.__redditToolboxApp.runner?.state==='completed',null,{timeout:90000});
  assert.deepEqual(calls.map(({op,id})=>op+':'+id),['edit:t1_a','delete:t1_a','edit:t1_b','delete:t1_b']);
  assert.equal(await page.locator('.launcher-label').textContent(),'✓');
  await page.screenshot({path:out+'/'+label+'-closed-complete.png'});
  await page.locator('.launcher').click();
  assert.equal(await page.locator('.deleted-count').textContent(),'2');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>globalThis.__redditToolboxApp.shadow.activeElement===globalThis.__redditToolboxApp.refs.launcher),true);
  await page.reload();
  assert.equal(await page.evaluate(()=>globalThis.__redditToolboxApp.plan),null);
  assert.equal(await page.evaluate(()=>globalThis.__redditToolboxApp.runner),null);
  reset(true); deletionMode='missing';
  await page.locator('.launcher').click();

  await prepare(page,true);
  await page.locator('.start').click();
  await page.waitForFunction(()=>globalThis.__redditToolboxApp.runner?.state==='completed');
  assert.deepEqual(calls.map(({op,id})=>op+':'+id),['edit:t1_a','delete:t1_a','edit:t3_b','delete:t3_b','delete:t3_c']);
  await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
  await page.setViewportSize({width:390,height:844});
  await page.locator('.content').evaluate(el=>{el.scrollTop=0;});
  await page.screenshot({path:out+'/'+label+'-narrow-dark.png'});
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:844});
    await page.waitForFunction(()=>{const r=__redditToolboxApp.refs.panel.getBoundingClientRect();return r.right<=innerWidth&&r.left>=0;});
    const overflow=await page.evaluate(()=>{
      const root=globalThis.__redditToolboxApp.shadow;
      const panel=root.querySelector('.panel'); const rect=panel.getBoundingClientRect();
      return {left:rect.left,right:rect.right,width:innerWidth,overflow:root.querySelector('.content').scrollWidth-root.querySelector('.content').clientWidth};
    });
    assert.ok(overflow.left>=0&&overflow.right<=overflow.width&&overflow.overflow<=1,JSON.stringify(overflow));
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.reload(); await page.locator('.launcher').click(); reset(); deletionMode='uncertain';
  await prepare(page);
  // Accelerate only the synthetic fixture's read-back delays; production adapter and runner stay wired.
  await page.evaluate(()=>{const Original=RedditToolbox.Reddit.RedditRemovalService;RedditToolbox.Reddit.RedditRemovalService=class extends Original{constructor(...args){super(...args);this.verificationDelayMs=100;this.deletionVerificationAttempts=2;}};});
  await page.locator('.start').click();
  await page.waitForFunction(()=>__redditToolboxApp.runner?.state==='completed-with-failures');
  assert.equal(await page.locator('.deleted-count').textContent(),'1');
  assert.equal(await page.locator('.unconfirmed-count').textContent(),'1');
  assert.equal(await page.locator('.launcher-label').textContent(),'!');
  assert.deepEqual(calls.map(({op,id})=>op+':'+id),['edit:t1_a','delete:t1_a','edit:t1_b','delete:t1_b']);
  records.get('t1_a').data.author=null; records.get('t1_a').data.body='[deleted]';
  const beforeRecheck=calls.length;
  identityRateOnce = true;
  await page.locator('.recheck').click();
  await page.waitForFunction(()=>__redditToolboxApp.refs.currentAction.textContent.includes('Reddit cooldown'));
  assert.equal(await page.locator('.stop').textContent(),'Cancel recheck');
  await page.locator('.stop').click();
  await page.waitForFunction(()=>!__redditToolboxApp.busy);
  assert.equal(await page.locator('.unconfirmed-count').textContent(),'1');
  assert.equal(calls.length,beforeRecheck);
  await page.locator('.recheck').click();await page.waitForFunction(()=>!__redditToolboxApp.busy);
  assert.equal(await page.locator('.deleted-count').textContent(),'2');assert.equal(calls.length,beforeRecheck);
  assert.equal(await page.locator('.unconfirmed-count').textContent(),'0');
  assert.equal(await page.locator('.launcher-label').textContent(),'✓');
  await page.reload();await page.locator('.launcher').click();reset();deletionMode='noop';
  await page.evaluate(()=>{const Original=RedditToolbox.Reddit.RedditRemovalService;RedditToolbox.Reddit.RedditRemovalService=class extends Original{constructor(...args){super(...args);this.verificationDelayMs=100;this.deletionVerificationAttempts=2;}};});
  await prepare(page);await page.locator('.start').click();await page.waitForFunction(()=>__redditToolboxApp.runner?.state==='completed');
  assert.deepEqual(calls.map(({op,id})=>op+':'+id),['edit:t1_a','delete:t1_a','delete:t1_a','edit:t1_b','delete:t1_b','delete:t1_b']);
  deletionMode='missing';
  signedIn = false;
  await page.reload();
  await page.locator('.launcher').click();
  await page.locator('.scan').click();
  await page.waitForFunction(()=>!globalThis.__redditToolboxApp.busy);
  assert.match(await page.locator('.scan-status').textContent(),/Sign in|sign in|session/i);
  const csv='id,created_utc,body\n'+Array.from({length:50000},(_,i)=>`${i.toString(36)},1700000000,synthetic archive row`).join('\n');
  await page.evaluate(()=>{globalThis.fixtureTicks=0;globalThis.fixtureTimer=setInterval(()=>fixtureTicks++,5);});
  const began=Date.now();
  await page.locator('.archive-input').setInputFiles({name:'comments.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await page.waitForFunction(()=>!globalThis.__redditToolboxApp.busy&&globalThis.__redditToolboxApp.archiveItems.length===50000);
  const ticks=await page.evaluate(()=>{clearInterval(fixtureTimer);return fixtureTicks;});
  assert.ok(ticks>5,'Archive parsing did not yield to the UI');
  await page.waitForFunction(()=>!__redditToolboxApp.busy&&__redditToolboxApp.plan?.items.length===50000);
  assert.equal(await page.locator('.start').isDisabled(),true);
  assert.match(await page.locator('.account-status').textContent(),/Local review/);
  await page.locator('.item-text summary').first().click();
  assert.match(await page.locator('.item-text div').first().textContent(),/synthetic archive row/);
  await page.screenshot({path:out+'/'+label+'-offline-review.png'});
  signedIn = true;

  if(await page.locator('.advanced').getAttribute('open')===null) await page.locator('.advanced summary').click();
  await page.locator('.check-login').click();
  await page.waitForFunction(()=>!globalThis.__redditToolboxApp.busy&&globalThis.__redditToolboxApp.plan?.items.length===50000);
  assert.equal(await page.locator('.preview .item').count(),100);
  const archiveMs=Date.now()-began;
  await page.locator('.preview-next').click();
  assert.match(await page.locator('.preview-page').textContent(),/Items 101–200 of 50000/);
  const keepId=await page.locator('.preview .item').first().getAttribute('data-queue-id');
  await page.locator('.keep-item').first().click();
  assert.equal(await page.evaluate(id=>__redditToolboxApp.plan.items.some(item=>item.id===id),keepId),false);
  assert.equal(await page.locator('.start').isEnabled(),true);
  assert.equal(await page.locator('.start').textContent(),'Delete 49999 items');
  assert.equal(await page.locator('.selected-count').textContent(),'49999');
  await page.locator('.preview-previous').click();
  assert.match(await page.locator('.preview-page').textContent(),/Items 1–100 of 49999/);
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('.preview-section').scrollIntoViewIfNeeded();
  await page.screenshot({path:out+'/'+label+'-review.png'});
  owner = 'different-fixture-owner';
  if(await page.locator('.advanced').getAttribute('open')===null) await page.locator('.advanced summary').click();
  await page.locator('.check-login').click();
  await page.waitForFunction(()=>!__redditToolboxApp.busy);
  assert.equal(await page.evaluate(()=>__redditToolboxApp.plan),null);
  assert.equal(await page.locator('.export-backup').isDisabled(), true);
  owner = 'fixture-owner';
  reset();
  await prepare(page);
  signedIn = false;
  await page.locator('.check-login').click();
  await page.waitForFunction(()=>!__redditToolboxApp.busy);
  assert.equal(await page.locator('.start').isDisabled(), true);
  assert.equal(await page.evaluate(()=>__redditToolboxApp.plan),null);
  await page.locator('.clear-history').click();
  assert.equal(await page.evaluate(()=>__redditToolboxApp.allItems().length),0);
  assert.equal(await page.evaluate(()=>__redditToolboxApp.plan),null);
  const unexpectedErrors=errors.filter(error=>!error.includes('net::ERR_FAILED')&&!error.includes('NetworkError')&&error!=='Failed to load resource: the server responded with a status of 429 (Too Many Requests)');
  assert.deepEqual(unexpectedErrors,[]);
  results.push({browser:label,version:browser.version(),twoCommentBatch:'passed',liveRemovedBodyResponse:'passed',noLimitOption:'passed',initialIdentityRateLimitRecovers:'passed',mixedBatch:'passed',crossTabLock:'passed',panelClosedRun:'passed',reloadDoesNotResume:'passed',navigationWarning:'passed',settingsLock:'passed',sessionFirstWithoutSetup:'passed',logoutInvalidatesReview:'passed',accountChangeClearsStaleHistory:'passed',paginatedReview:'passed',keepItemUpdatesDeleteCount:'passed',dragResizeKeyboardPersistence:'passed',uncertainContinues:'passed',readOnlyRecheck:'passed',acknowledgedNoopRetry:'passed',clearHistory:'passed',sessionModhashOnMutations:'passed',largeArchive:{rows:50000,renderedRows:100,elapsedMs:archiveMs,uiTicks:ticks},keyboard:'passed',narrow:[390,320],expectedTransportErrors:errors.length,consoleErrors:unexpectedErrors,allNetworkIntercepted:true});
  } finally { await browser.close(); }
}
(async()=>{
  for(const [type,label] of [[chromium,'chromium'],[firefox,'firefox']]) {
    try {await exercise(type,label);console.log(label,'PASS');} catch(error){console.error(label,error);results.push({browser:label,error:String(error)});process.exitCode=1;}
    fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));
  }
})();
