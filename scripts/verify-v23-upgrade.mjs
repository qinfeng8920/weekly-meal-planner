import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const repo=fileURLToPath(new URL('../',import.meta.url));
const [oldDist,screenshotDirectory,mode]=process.argv.slice(2);
const v322=mode==='--v322';
const v321=mode==='--v321'||v322;
const v32=mode==='--v32'||v321;
const v31=mode==='--v31'||v32;
const v3=mode==='--v3'||v31;
const v241=mode==='--v241';
const v24=mode==='--v24'||v241||v3;
const ingredients=mode==='--ingredients'||v24;
const previousVersion=v322?'3.2.1':v321?'3.2.0':v32?'3.1.2':v31?'3.0.0':v3?'2.4.1':v241?'2.4.0':v24?'2.3.2':ingredients?'2.3.0':'2.2.1';
const currentVersion=v322?'3.2.2':v321?'3.2.1':v32?'3.2.0':v31?'3.1.0':v3?'3.0.0':v241?'2.4.1':v24?'2.4.0':ingredients?'2.3.1':'2.3.0';
const latestAlgorithm=v322?'3.2.2':v32?'3.2.0':v31?'3.1.0':v3?'2.4.1':v241?'2.4.1':v24?'2.4.0':ingredients?'2.3.1':'2.3.0';
const prefix=v322?'v322':v321?'v321':v32?'v32':v31?'v31':v3?'v3':v241?'v241':v24?'v24':ingredients?'v231':'v23';
if(!oldDist||!screenshotDirectory)throw Error('用法 node scripts/verify-v23-upgrade.mjs <旧版 dist> <截图目录> [--ingredients|--v24|--v241|--v3|--v31|--v32|--v321|--v322]');
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
await new Promise(r=>server.listen(4193,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.TTJ_CHROMIUM});
try {
 const ctx=await browser.newContext({...devices['Pixel 7'],viewport:{width:390,height:850},deviceScaleFactor:1,colorScheme:'light'});
 const page=await ctx.newPage();
 const nav=name=>page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name,exact:true});
 const snap=(name)=>page.screenshot({path:output+'/ttj-'+name+'.png',animations:'disabled',timeout:10000});
 await page.goto('http://127.0.0.1:4193'+base);
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
 await page.getByRole('button',{name:'生成设置',exact:true}).click();
 await page.getByText('固定搭配与随机种子',{exact:true}).click();
 await page.getByLabel('随机种子（选填）').fill('采购验收');
 await page.getByRole('button',{name:v3?'重新搭配':'按设置生成',exact:true}).click();
 await expect(page.getByText('算法 '+(v321?'3.2.0':v32?'3.1.0':v3?'2.4.1':v241?'2.4.0':v24?'2.3.1':ingredients?'2.3.0':'2.2.0'),{exact:false})).toBeVisible();

 await nav('采购').click();
 await page.getByRole('checkbox').first().click();
 if(ingredients)await page.getByRole('button',{name:'保存实际购买'}).click();
 await expect(page.getByText('采购记录已更新。')).toBeVisible();
 await snap(prefix+'-before-purchase-390');
 await nav('我的').click();
 await page.getByRole('button',{name:'食材价格',exact:true}).click();
 await page.getByRole('searchbox',{name:'搜索食材'}).fill('燕麦');
 const oats=page.locator('details').filter({has:page.locator('summary').filter({hasText:/^无糖燕麦片 ·/})}).last();
 await oats.locator('summary').click();
 await oats.getByLabel('单价（元）').fill('18');
 await oats.getByRole('button',{name:'保存此食材价格'}).click();
 await expect(page.getByText('食材价格已保存。')).toBeVisible();
 await nav('我的').click();
 await page.getByRole('button',{name:v241||v3?'食谱大全':'菜谱库与收藏'}).click();
 if(v31){
   await page.getByRole('searchbox',{name:'搜索菜谱'}).fill('燕麦');
   await page.locator('.recipe-card button').first().click();
   await expect(page.getByRole('dialog')).toBeVisible();
 }else await page.locator('details.recipe-card summary').first().click();
 await page.getByRole('button',{name:'收藏菜谱',exact:true}).click();
 if(v31)await page.getByRole('button',{name:'关闭',exact:true}).click();
 await nav('食谱').click();
 const read=(directory=false)=>page.evaluate(directory=>new Promise((resolve,reject)=>{
   const req=indexedDB.open('tiantianjian',1);
   req.onerror=()=>reject(req.error);
   req.onsuccess=()=>{
     const db=req.result,get=db.transaction('app').objectStore('app').get(directory?'profiles-v2':'data');
     get.onerror=()=>reject(get.error);
     get.onsuccess=()=>{
       const value=get.result;
       db.close();
       if(directory){
         if(value.profiles.length!==1){reject(Error('迁移生成了重复档案'));return;}
         resolve(value.profiles.find(p=>p.id===value.activeProfileId).data);
       }else resolve(value);
     };
   };
 }),directory);
 await page.evaluate(({isPrefsUpgrade,directory})=>new Promise((resolve,reject)=>{
   const req=indexedDB.open('tiantianjian',1);
   req.onerror=()=>reject(req.error);
   req.onsuccess=()=>{
     const db=req.result,tx=db.transaction('app','readwrite'),store=tx.objectStore('app'),key=directory?'profiles-v2':'data',r=store.get(key);
     tx.oncomplete=()=>{db.close();resolve();};
     tx.onerror=()=>reject(tx.error);
     r.onsuccess=()=>{
       const data=directory?r.result.profiles.find(p=>p.id===r.result.activeProfileId).data:r.result;
       if(isPrefsUpgrade)data.poolSettings={...data.poolSettings,method:'手动指定',selected:['oats'],locked:['chicken','beef']};
       const day=data.plan.days[0];
       const ids=new Set(day.meals[0].dishes.flatMap(dish=>dish.ingredients.map(item=>item.id)));
       for(const item of ids)data.supply.ledger.events.push({id:'假资料|'+item,item,source:'假资料|'+item,
         kind:'手动补充',date:data.plan.start,quantity:1000,unit:'克',delta:1000});
       store.put(r.result,key);
     };
   };
 }),{isPrefsUpgrade:v241,directory:v321});
 await page.reload();
 await nav('食谱').click();
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'完成本餐',exact:true}).first().click();
 await expect(page.getByText('本餐已完成',{exact:true})).toBeVisible();
 page.once('dialog',dialog=>dialog.accept('旧版执行快照'));
 await page.getByRole('button',{name:'保存到历史',exact:true}).click();
 await expect(page.getByText('已保存到历史方案。')).toBeVisible();
 const before=await read(v321);
 assert.equal(before.supply.prices.oats.amount,18);
 assert(before.supply.ledger.events.some(e=>e.kind==='实际取用'));
 assert.equal(before.favorites.length,1);
 dir=repo+'/dist';
 await page.evaluate(async()=>{await (await navigator.serviceWorker.ready).update();});
 await Promise.all([
   page.waitForEvent('framenavigated',{predicate:frame=>frame===page.mainFrame()}),
   page.getByRole('button',{name:'应用新版本'}).click(),
 ]);
 await nav('我的').click();
 await expect(page.getByText('V'+currentVersion,{exact:true})).toBeVisible();
 assert.deepEqual(await read(v32),before);
 if(v241){
   await nav('食谱').click();
   await page.getByRole('button',{name:'生成设置',exact:true}).click();
   await expect(page.getByRole('button',{name:'解除鸡胸肉锁定'})).toBeVisible();
   await expect(page.getByRole('button',{name:'解除瘦牛肉锁定'})).toBeVisible();
   await page.getByRole('searchbox',{name:'搜索核心食材'}).fill('燕麦');
   await expect(page.getByRole('combobox',{name:'无糖燕麦片偏好'})).toHaveValue('优先使用');
 }
 await nav('食谱').click();
 const meal=page.locator('.meal-card').filter({has:page.getByText('本餐已完成',{exact:true})});
 await expect(meal.getByRole('button',{name:'换一餐'})).toBeDisabled();
 await snap(prefix+'-executed-390');
 await ctx.setOffline(true);
 await page.getByRole('button',{name:'重生成未执行餐次'}).click();
 await expect(page.getByText('七天食谱已生成。')).toBeVisible({timeout:20000});
 const after=await read(v32);
 assert.equal(after.plan.algorithmVersion,latestAlgorithm);
 assert.deepEqual(after.plan.days[0].meals[0],before.plan.days[0].meals[0]);
 for(const key of ['history','profile','weights','pantry','favorites','supply'])assert.deepEqual(after[key],before[key],key);
 if(v24){
   await nav('我的').click();
   await page.getByRole('button',{name:'原材料大全',exact:true}).click();
   await page.getByRole('searchbox',{name:'搜索原材料'}).fill('huolongguo');
   await expect(page.getByText('火龙果',{exact:true})).toBeVisible();
   for(const width of [360,390,430]){
      await page.setViewportSize({width,height:850});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await snap(prefix+'-ingredients-'+width);
   }
   await (v3?nav('我的'):page.getByRole('button',{name:'返回我的'})).click();
   await page.getByRole('button',{name:'食谱大全',exact:true}).click();
   await expect(page.getByRole('heading',{name:'食谱大全',exact:true})).toBeVisible();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await snap(prefix+'-library-430');
   await page.setViewportSize({width:390,height:850});
 }
 await nav('采购').click();
 await snap(prefix+'-purchase-390');
 await page.getByRole('button',{name:'备餐清单',exact:true}).click();
 await snap(prefix+'-prep-390');
 console.log('V'+previousVersion+' → V'+currentVersion+'，同源 PWA 更新逐字段一致；旧餐次仍锁定，离线重生成保留历史、取用和库存。');
} finally {
 await browser.close();
 await new Promise(r=>server.close(r));
}
