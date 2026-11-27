import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep,join} from 'node:path';
import {chromium,devices,expect,webkit} from '@playwright/test';
import {fresh} from '../src/store';
import {regenerate} from '../src/planner';
import {dateKey} from '../src/profile';
import {addDays} from '../src/batches';
import {demo} from '../tests/fixtures';

const [directory,out,edition='after',engine='chromium']=process.argv.slice(2);
if(!directory||!out)throw Error('用法 node --import tsx scripts/capture-ui.ts <构建目录> <输出目录> [before|after] [chromium|webkit]');
const base='/weekly-meal-planner/';
const root=resolve(directory);
await mkdir(out,{recursive:true});
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
  const path=new URL(req.url!,'http://localhost').pathname;
  if(path==='/seed') {res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>测试数据</title>');return;}
  if(!path.startsWith(base)){res.writeHead(404).end();return;}
  const file=resolve(root,decodeURIComponent(path.slice(base.length))||'index.html');
  if(!file.startsWith(root+sep)){res.writeHead(404).end();return;}
  try {const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream'}).end(data);}
  catch {res.writeHead(404).end();}
});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
const address=server.address() as {port:number};
const url='http://127.0.0.1:'+address.port;
const profile={...demo,name:'林晓'};
const today=dateKey();
const weights=[12,8,5,2,0].map((d,i)=>({date:addDays(today,-d),kg:[83,82.7,82.2,82.5,81.8][i]}));
const plan=regenerate(profile,weights,{oats:{stock:850},chicken:{stock:420},salt:{stock:300}},[],'ui-v3',
  undefined,[],undefined,undefined,undefined,{settings:fresh().poolSettings,startChoice:'今天'});
const fixture={...fresh(),profile,weights,plan,history:[{...plan,id:crypto.randomUUID(),name:'工作日清淡搭配',favorite:true}],
  pantry:{oats:{stock:850},chicken:{stock:420},salt:{stock:300}}};
try {
  const browser=await (engine==='webkit'?webkit:chromium).launch();
  const device=devices[engine==='webkit'?'iPhone 13':'Pixel 7'];
  try {
  for(const theme of ['light','dark'] as const){
    const context=await browser.newContext({...device,deviceScaleFactor:1,viewport:{width:390,height:844},colorScheme:theme});
    const page=await context.newPage();page.setDefaultTimeout(4500);
    const errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(url+'/seed');
    await page.evaluate(value=>new Promise<void>((done,fail)=>{
      const request=indexedDB.open('tiantianjian',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('app');
      request.onerror=()=>fail(request.error);
      request.onsuccess=()=>{const db=request.result;const tx=db.transaction('app','readwrite');
        tx.objectStore('app').put(value,'data');tx.oncomplete=()=>{db.close();done();};tx.onerror=()=>fail(tx.error);};
    }),{...fixture,theme:theme==='dark'?'深色' as const:'浅色' as const});
    await page.goto(url+base);
    const nav=(name:string)=>page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name,exact:true});
    const button=(name:string|RegExp)=>page.getByRole('button',{name,exact:typeof name==='string'});
    const snap=async(name:string,top=true)=>{if(top)await page.evaluate(()=>window.scrollTo(0,0));
      if(edition==='after')expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:join(out,edition+'-'+theme+'-'+name+'.png'),animations:'disabled'});};
    async function frame(name:string,flow:()=>Promise<unknown>,top=true) {
      try {await flow();await snap(name,top);console.log(edition,theme,name);}
      catch(error) {console.error(edition,theme,name,(error as Error).message.split('\n')[0]); process.exitCode=1;}
    }
    await expect(page.getByRole('heading',{name:'你好，林晓'})).toBeVisible();
    await frame('01-home',async()=>{});
    await nav('食谱').click();
    await frame('02-plan',async()=>{await expect(page.getByRole('heading',{name:'每周食谱'})).toBeVisible();});
    await frame('03-recipe-detail',()=>page.locator('.dish-title').first().click(),false);
    if(edition!=='before')await page.keyboard.press('Escape');
    await frame('04-replacement',()=>page.locator('.dish').getByRole('button',{name:/^换/}).first().click(),false);
    if(edition!=='before')await page.keyboard.press('Escape');
    await nav('采购').click();
    await frame('05-shopping',async()=>{});
    await frame('06-receipt',()=>page.locator('.purchase-list input[type=checkbox]').first().click(),false);
    if(edition!=='before')await page.keyboard.press('Escape');
    await frame('07-prep',()=>button('备餐清单').click());
    await nav('我的').click();
    await frame('08-mine',async()=>{});
    await frame('09-inventory',()=>button('家中库存').click());
    await frame('10-clear',async()=>{await page.getByText('库存管理',{exact:true}).click();
      if(edition!=='before')await button('清空全部库存').click();},false);
    if(edition!=='before')await page.keyboard.press('Escape');
    await nav('我的').click();
    await frame('11-prices',()=>button('食材价格').click());
    await nav('我的').click();
    await frame('12-library',async()=>{await button('食谱大全').click();await expect(page.getByRole('heading',{name:'食谱大全'})).toBeVisible();});
    await nav('我的').click();
    await frame('13-ingredients',async()=>{await button('原材料大全').click();await expect(page.getByRole('heading',{name:'原材料大全'})).toBeVisible();});
    await frame('14-ingredient-detail',async()=>{
      await page.getByRole('searchbox',{name:'搜索原材料'}).fill('火龙果');
      await page.getByText('火龙果',{exact:true}).click();
    },false);
    if(edition!=='before')await page.keyboard.press('Escape');
    await nav('我的').click();
    await frame('15-profile',()=>button('编辑档案').click());
    await nav('我的').click();
    await frame('16-history',()=>button(/历史方案/).click());
    await nav('食谱').click();
    await frame('17-settings',()=>button('生成设置').click());
    expect(errors).toEqual([]);
    await context.close();
  }
  } finally {await browser.close();}
} finally {await new Promise<void>(done=>server.close(()=>done()));}
