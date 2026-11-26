import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const repo=fileURLToPath(new URL('../',import.meta.url));
const [oldDist,screenshotDirectory]=process.argv.slice(2);
if(!oldDist||!screenshotDirectory)throw Error('用法 node scripts/verify-upgrade.mjs <1.3.0 dist> <截图目录>');
const output=resolve(screenshotDirectory);
await mkdir(output,{recursive:true});
const {chromium,devices,expect}=createRequire(repo+'/package.json')('@playwright/test');
let dir=resolve(oldDist);
const base='/weekly-meal-planner/';
const mime={js:'text/javascript',css:'text/css',html:'text/html',png:'image/png',webp:'image/webp',webmanifest:'application/manifest+json'};
const server=createServer(async(req,res)=>{
  try {
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(!pathname.startsWith(base))throw Error('outside scope');
    const filename=pathname.slice(base.length)||'index.html';
    res.writeHead(200,{'Content-Type':mime[filename.split('.').at(-1)],'Cache-Control':'no-cache'}).end(await readFile(dir+'/'+filename));
  } catch {res.writeHead(404).end();}
});
await new Promise(r=>server.listen(4182,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.TTJ_CHROMIUM});
try {
 const ctx=await browser.newContext({...devices['Pixel 7'],viewport:{width:390,height:850},deviceScaleFactor:1,colorScheme:'light'});
 const page=await ctx.newPage();
 const nav=name=>page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name,exact:true});
 const snap=(name)=>page.screenshot({path:output+'/ttj-'+name+'.png',animations:'disabled',timeout:10000});
 await page.goto('http://127.0.0.1:4182'+base);
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await page.getByRole('button',{name:'开始填写档案'}).click();
 for(const [label,value] of [['昵称（选填）','演示用户'],['年龄（岁）','34'],['身高（厘米）','170'],['当前体重（千克）','83'],['目标体重（千克）','72']])await page.getByLabel(label).fill(value);
 await page.getByLabel('公式使用的性别').selectOption('男');
 for(let i=0;i<2;i++) await page.getByRole('button',{name:'继续',exact:true}).click();
 await page.getByText('我已核对年龄、孕哺期、进食障碍及医嘱筛查').click();
 await page.getByText('我已核对过敏原与其他强制忌口').click();
 for(let i=0;i<3;i++) await page.getByRole('button',{name:'继续',exact:true}).click();
 await page.getByRole('button',{name:'保存档案'}).click();
 await page.getByRole('button',{name:'记录体重',exact:true}).click();
 await page.getByLabel('体重（千克）',{exact:true}).fill('82.5');
 await page.getByRole('button',{name:'保存体重'}).click();
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 await nav('食谱').click();
 await page.getByText('生成设置',{exact:true}).click();
 await page.getByLabel('随机种子（选填）').fill('采购验收');
 await page.getByRole('button',{name:'生成本周食谱',exact:true}).click();
 await expect(page.getByText(/算法 1\.2\.0/)).toBeVisible();
 await nav('首页').click();
 await snap('v13-home-390-light');
 await nav('采购').click();
 await page.getByRole('button',{name:'分批采购',exact:true}).click();
 await page.getByRole('checkbox').first().click();
 await expect(page.getByText('采购记录已更新。')).toBeVisible();
 await page.getByRole('button',{name:'家中库存',exact:true}).click();
 await page.getByRole('searchbox',{name:'搜索食材'}).fill('燕麦');
 await page.locator('summary').filter({hasText:'无糖燕麦片'}).first().click();
 await page.getByLabel('实有库存净重（克）').fill('60');
 await page.getByRole('button',{name:'保存库存'}).click();
 await page.getByRole('button',{name:'食材价格',exact:true}).click();
 await page.getByRole('searchbox',{name:'搜索食材'}).fill('燕麦');
 await page.locator('summary').filter({hasText:'无糖燕麦片'}).first().click();
 await page.getByLabel('单价（元）').fill('17');
 await page.getByRole('button',{name:'保存此食材价格'}).click();
 await expect(page.getByText('食材价格已保存。')).toBeVisible();
 await nav('菜谱库').click();
 await page.locator('details.recipe-card summary').first().click();
 await page.getByRole('button',{name:'收藏菜谱',exact:true}).click();
 await nav('食谱').click();
 page.once('dialog',d=>d.accept('升级前食谱'));
 await page.getByRole('button',{name:'保存到历史'}).click();
 await expect(page.getByText('已保存到历史方案。')).toBeVisible();
 const read=()=>page.evaluate(()=>new Promise((resolve,reject)=>{
   const req=indexedDB.open('tiantianjian',1);
   req.onsuccess=()=>{const db=req.result;const found=db.transaction('app').objectStore('app').get('data');found.onsuccess=()=>{db.close();resolve(found.result);};};
   req.onerror=reject;
 }));
 const before=await read();
 assert.equal(before.pantry.oats.stock,60);
 assert.equal(before.supply.prices.oats.amount,17);
 assert.equal(Object.keys(before.supply.receipts).length,1);
 assert.equal(before.favorites.length,1);
 await page.reload();
 dir=repo+'/dist';
 await page.evaluate(async()=>{await (await navigator.serviceWorker.ready).update();});
 await page.getByRole('button',{name:'应用新版本'}).click();
 await expect(page.getByRole('button',{name:'设置并生成'})).toBeVisible();
 assert.deepEqual(await read(),before);
 await ctx.setOffline(true);
 await page.reload();
 await expect(page.getByText(/当前离线/)).toBeVisible();
 await page.getByRole('button',{name:'设置并生成'}).click();
 await page.getByLabel('采购模式').selectOption('极简采购');
 await page.getByRole('button',{name:'按食材池生成'}).click();
 await expect(page.getByText('七天食谱已生成。')).toBeVisible({timeout:20000});
 const after=await read();
 for(const key of ['history','profile','weights','pantry','favorites','supply'])assert.deepEqual(after[key],before[key],key);
 assert.equal(after.plan.algorithmVersion,'2.0.0');
 assert.equal(after.poolSettings.mode,'极简采购');
 await ctx.setOffline(false);
 await page.reload();
 for(const theme of ['浅色','深色']){
   await nav('我的').click();
   await page.getByLabel('外观').selectOption(theme);
   for(const width of [360,390,430]){
     await page.setViewportSize({width,height:850});
     await nav('首页').click();
     const suffix=width+'-'+(theme==='浅色'?'light':'dark');
     await snap('v2-home-'+suffix);
     await page.getByRole('button',{name:'继续备餐'}).click();
     await expect(page.getByRole('heading',{name:/备餐周期 ·/})).toBeVisible();
     if(width===390&&theme==='深色') {
       await page.getByRole('heading',{name:/备餐周期 ·/}).evaluate(el=>el.scrollIntoView({block:'start'}));
       await snap('v2-prep-390-dark');
     }
     await nav('食谱').click();
     if(width===390&&theme==='浅色')await snap('v2-plan-390-light');
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   }
 }
 console.log('V1.3→V2.0 同源缓存升级，原始 IndexedDB 对象全量一致。离线生成后档案、价格、收据、库存、收藏、体重、历史逐项一致。完成 9 张真实页面截图。');
} finally {
 await browser.close();
 await new Promise(r=>server.close(r));
}
