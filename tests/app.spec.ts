import {expect,test,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import type {Data} from '../src/store';
import {demo} from './fixtures';

async function setup(page:Page,profile=demo) {
  await page.goto('./');
  await page.getByRole('button',{name:'开始填写档案'}).click();
  await page.getByLabel('昵称（选填）').fill(profile.name);
  await page.getByLabel('公式使用的性别').selectOption(profile.sex);
  await page.getByLabel('年龄（岁）').fill(profile.age);
  await page.getByLabel('身高（厘米）').fill(profile.height);
  await page.getByLabel('当前体重（千克）').fill(profile.weight);
  await page.getByLabel('目标体重（千克）').fill(profile.target);
  if(profile.deficit)await page.getByLabel('标准热量缺口').selectOption(profile.deficit.mode);
  await page.getByRole('button',{name:'继续',exact:true}).click();
  await page.getByRole('button',{name:'继续',exact:true}).click();
  await page.getByRole('button',{name:'继续',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('完成并确认');
  await page.getByText('我已核对年龄、孕哺期、进食障碍及医嘱筛查').click();
  await page.getByText('我已核对过敏原与其他强制忌口').click();
  if(profile.deficit?.normalOptIn)await page.getByText(/我主动选择在正常 BMI 时减脂/).click();
  for(let i=0;i<3;i++) await page.getByRole('button',{name:'继续',exact:true}).click();
  await page.getByRole('button',{name:'保存档案'}).click();
  await expect(page.getByRole('heading',{name:'你好，'+profile.name})).toBeVisible();
}
async function generate(page:Page) {
  await page.getByRole('button',{name:'生成七天食谱',exact:true}).click();
  await expect(page.getByText('七天食谱已生成。')).toBeVisible({timeout:12000});
}
const nav=(page:Page, name:string)=>page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name,exact:true});
async function assertFit(page:Page) {
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
}
test('手机问卷、七天食谱、采购、称重、历史与独立存储',async({page,browser})=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await setup(page);
  await generate(page);
  expect(await page.getByRole('button',{name:/^周[一二三四五六日] +\d+\/\d+$/}).count()).toBe(7);
  page.once('dialog',d=>d.accept('测试快照'));
  await page.getByRole('button',{name:'保存到历史'}).click();
  await expect(page.getByText('已保存到历史方案。')).toBeVisible();
  await nav(page,'采购').click();
  await page.getByRole('checkbox').first().click();
  await page.getByRole('button',{name:'保存实际购买',exact:true}).click();
  await expect(page.getByRole('checkbox').first()).toBeChecked();
  await expect(page.getByText('采购记录已更新。')).toBeVisible();
  await page.getByRole('button',{name:'备餐清单',exact:true}).click();
  await page.locator('.prep-batch[open]').locator('summary').filter({hasText:/^储存与复热$/}).click();
  await expect(page.getByText(/生熟分开/).filter({visible:true})).toBeVisible();
  await assertFit(page);
  await nav(page,'首页').click();
  await page.getByRole('button',{name:'记录体重',exact:true}).click();
  await page.getByLabel('体重（千克）',{exact:true}).fill('81.5');
  await page.getByRole('button',{name:'保存体重'}).click();
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await expect(page.getByText(/81.5 千克/).first()).toBeVisible();
  await generate(page);
  await page.getByRole('button',{name:'历史方案',exact:true}).click();
  await expect(page.getByText(/生成体重 83 千克/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:'你好，测试用户'})).toBeVisible();
  await nav(page,'我的').click();
  await page.getByRole('button',{name:/历史方案/}).click();
  await expect(page.getByRole('heading',{name:'测试快照'})).toBeVisible();
  await assertFit(page);
  const separate=await browser.newContext();
  const visitor=await separate.newPage();
  await visitor.goto(page.url());
  await expect(visitor.getByRole('button',{name:'开始填写档案'})).toBeVisible();
  await separate.close();
  expect(errors).toEqual([]);
});
test('备份往返、分享净化、深色及 320 像素布局',async({page})=>{
  await setup(page);
  await generate(page);
  const file=page.waitForEvent('download');
  await page.getByRole('button',{name:'下载食谱文本'}).click();
  const text=await (await file).createReadStream();
  const chunks:Buffer[]=[];
  for await(const c of text)chunks.push(c as Buffer);
  const exported=Buffer.concat(chunks).toString('utf8');
  expect(exported).toContain('天天减 · 七天食谱');
  for(const word of [demo.name,'体重','疾病','身高','年龄']) expect(exported).not.toContain(word);
  await nav(page,'我的').click();
  await page.getByText('外观与安装',{exact:true}).click();
    await page.getByLabel('外观').selectOption('深色');
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.getByText('本机数据与备份',{exact:true}).click();
  const backup=page.waitForEvent('download');
  await page.getByRole('button',{name:'导出个人备份'}).click();
  const path=await (await backup).path();
  await page.getByRole('button',{name:'删除全部数据'}).click();
  await page.getByRole('button',{name:'确认删除'}).click();
  await expect(page.getByText('本机个人数据已清除。')).toBeVisible();
  page.once('dialog',d=>d.accept());
  await page.getByLabel('导入并恢复').setInputFiles(path!);
  await expect(page.getByText('备份已恢复。')).toBeVisible();
  await page.setViewportSize({width:320,height:640});
  for(const name of ['首页','食谱','采购','我的']){await nav(page,name).click();await assertFit(page);}
});
test('子路径资源、安装清单、离线重新打开和生成',async({page,context})=>{
  await setup(page);
  await page.evaluate(async()=>{
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller) await new Promise<void>(r=>navigator.serviceWorker.addEventListener('controllerchange',()=>r(),{once:true}));
  });
  const manifest=await page.evaluate(async()=>await (await fetch('./manifest.webmanifest')).json());
  expect(manifest.start_url).toBe('./');expect(manifest.display).toBe('standalone');
  expect(manifest.icons).toHaveLength(2);
  for(const icon of manifest.icons) expect((await page.request.get(icon.src)).ok()).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/当前离线/)).toBeVisible();
  await generate(page);
  await page.reload();
  await nav(page,'食谱').click();
  await expect(page.getByRole('heading',{name:/周. .*营养/})).toBeVisible();
});

test('新 Service Worker 版本生效后仍能读取历史',async({page})=>{
  await setup(page);
  await generate(page);
  page.once('dialog',d=>d.accept('更新前保存'));
  await page.getByRole('button',{name:'保存到历史'}).click();
  await expect(page.getByText('已保存到历史方案。')).toBeVisible();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.reload();
  expect(await page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  expect((await page.request.post('./__test_update')).ok()).toBe(true);
  await page.evaluate(async()=>{await (await navigator.serviceWorker.ready).update();});
  const apply=page.getByRole('button',{name:'应用新版本'});
  await expect(apply).toBeVisible();
  await apply.click();
  await expect(apply).toBeHidden();
  await nav(page,'我的').click();
  await page.getByRole('button',{name:/历史方案/}).click();
  await expect(page.getByRole('heading',{name:'更新前保存'})).toBeVisible();
});

test('唯一生成设置保留固定早餐、资料筛选和营养详情',async({page})=>{
  await setup(page);
  await nav(page,'食谱').click();
  await page.getByRole('button',{name:'生成设置',exact:true}).click();
  await page.getByText('早餐、午餐和晚餐偏好',{exact:true}).click();
  await page.getByRole('group',{name:'餐次偏好'}).getByRole('button',{name:'早餐',exact:true}).click();
  await page.getByLabel('不喜欢的食材',{exact:true}).filter({visible:true}).fill('酸奶');
  await page.getByRole('button',{name:'保存分餐偏好'}).click();
  await expect(page.getByText(/分餐偏好已保存/)).toBeVisible();
  await page.getByText('固定搭配与随机种子',{exact:true}).click();
  await page.getByLabel('固定早餐').selectOption('breakfast-set-0-0');
  await expect(page.getByText('生成设置已保存。')).toBeVisible();
  await page.getByLabel('随机种子（选填）').fill('浏览器验收');
  await page.getByRole('button',{name:'重新搭配'}).click();
  await expect(page.getByText('七天食谱已生成。')).toBeVisible();
  const breakfast=page.locator('section.meal-card').first();
  await expect(breakfast.getByRole('heading',{name:'早餐',exact:true})).toBeVisible();
  await expect(breakfast.getByRole('button',{name:'无糖豆浆煮燕麦',exact:true})).toBeVisible();
  await expect(breakfast.getByRole('button',{name:'水煮蛋（即食）',exact:true})).toBeVisible();
  await expect(breakfast.getByText('熟重',{exact:true})).toBeVisible();
  await page.getByText('全周日均营养检查',{exact:true}).click();
  await expect(page.locator('details[open]').filter({has:page.getByText('全周日均营养检查',{exact:true})}).getByText('参考值 800 毫克',{exact:true})).toBeVisible();
  await nav(page,'我的').click();
  await page.getByRole('button',{name:'食谱大全'}).click();
  await page.getByRole('button',{name:'早餐搭配',exact:true}).click();
  await expect(page.getByRole('heading',{name:/43 套早餐搭配/})).toBeVisible();
  await assertFit(page);
});

test('起始日期显示真实星期，首页和食谱共用已保存设置',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'生成设置',exact:true}).click();
  await expect(page.getByLabel('食谱从哪天开始')).toHaveValue('明天');
  await expect(page.getByLabel('烹饪偏好')).toHaveValue('不限制');
  await expect(page.getByText('制作时间上限')).toHaveCount(0);
  await page.getByLabel('食谱从哪天开始').selectOption('今天');
  await page.getByRole('group',{name:'采购模式'}).getByRole('button',{name:'均衡搭配'}).click();
  await page.getByLabel('烹饪偏好').selectOption('家常');
  await page.getByRole('button',{name:'保存设置',exact:true}).click();
  await expect(page.getByText('生成设置已保存。')).toBeVisible();
  await nav(page,'首页').click();
  await generate(page);
  const now=await page.evaluate(()=>new Intl.DateTimeFormat('zh-CN',{weekday:'short'}).format(new Date())+
    ' '+(new Date().getMonth()+1)+'/'+new Date().getDate());
  await expect(page.locator('.day-tabs button').first()).toHaveAccessibleName(now);
  await page.getByRole('button',{name:'生成设置',exact:true}).click();
  await expect(page.getByRole('group',{name:'采购模式'}).getByRole('button',{name:'均衡搭配'})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByLabel('烹饪偏好')).toHaveValue('家常');
});
test('采购两次、备餐三批，改价同步但历史保持快照',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'生成设置',exact:true}).click();
  await page.getByLabel('每周采购次数').selectOption('2');
  await page.getByLabel('备餐周期').selectOption('每2～3天');
  await page.getByLabel('批次划分').selectOption('2＋2＋3');
  await page.getByText('固定搭配与随机种子',{exact:true}).click();
  await page.getByLabel('固定早餐').selectOption('breakfast-set-0-0');
  await expect(page.getByText('生成设置已保存。')).toBeVisible();
  await page.getByLabel('随机种子（选填）').fill('采购验收');
  await page.getByRole('button',{name:'重新搭配'}).click();
  await expect(page.getByText('七天食谱已生成。')).toBeVisible();
  page.once('dialog',d=>d.accept('原价快照'));
  await page.getByRole('button',{name:'保存到历史'}).click();
  await expect(page.getByText('已保存到历史方案。')).toBeVisible();
  await nav(page,'采购').click();
  await expect(page.locator('summary').filter({hasText:/^采购第 [12] 批/})).toHaveCount(2);
  const total=async()=>{
    const costs=page.locator('.purchase-overview details');
    if(await costs.getAttribute('open')===null)await costs.getByText('费用明细',{exact:true}).click();
    return costs.locator('dl > div').filter({hasText:'本周预计总支出'}).locator('dd');
  };
  const old=await (await total()).innerText();
  await page.getByRole('button',{name:'备餐清单',exact:true}).click();
  await expect(page.getByRole('heading',{name:'备餐周期 · 2＋2＋3'})).toBeVisible();
  await expect(page.getByText(/备餐第 [123] 批/)).toHaveCount(3);
  await nav(page,'我的').click();
  await page.getByRole('button',{name:'食材价格',exact:true}).click();
  await page.getByRole('searchbox',{name:'搜索食材'}).fill('燕麦');
  await page.locator('summary').filter({hasText:/^无糖燕麦片 ·/}).click();
  await page.getByRole('spinbutton',{name:'单价（元）',exact:true}).fill('79');
  await page.getByRole('button',{name:'保存此食材价格',exact:true}).click();
  await expect(page.getByText('食材价格已保存。')).toBeVisible();
  await nav(page,'采购').click();
  await expect(await total()).not.toHaveText(old);
  await page.reload();
  await nav(page,'我的').click();
  await page.getByRole('button',{name:'食材价格',exact:true}).click();
  await page.getByRole('searchbox',{name:'搜索食材'}).fill('燕麦');
  await expect(page.getByText(/¥79\.00\/斤.*用户自定义/)).toBeVisible();
  await nav(page,'我的').click();
  await page.getByRole('button',{name:/历史方案/}).click();
  const saved=page.locator('section.card').filter({has:page.getByRole('heading',{name:'原价快照'})});
  await saved.getByRole('button',{name:'查看',exact:true}).click();
  await expect(await total()).toHaveText(old);
  await page.getByRole('button',{name:'按最新价格重新估算',exact:true}).click();
  await expect(await total()).not.toHaveText(old);
  await page.getByRole('button',{name:'返回历史价格快照',exact:true}).click();
  await expect(await total()).toHaveText(old);
});

test('新生成设置、补充确认、分装进度和三种手机宽度的浅深色布局',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'生成设置'}).click();
  await page.getByRole('group',{name:'采购模式'}).getByRole('button',{name:'少量种类'}).click();
  await page.getByText('高级设置',{exact:true}).click();
  await expect(page.getByLabel('启用严格食材池')).not.toBeChecked();
  await page.getByRole('button',{name:'重新搭配',exact:true}).click();
  await expect(page.getByText('本周食材池',{exact:true})).toBeVisible();
  await nav(page,'首页').click();
  await page.getByRole('button',{name:'继续备餐'}).click();
  const selected=page.locator('details.card[open]').filter({has:page.getByText(/备餐第 [123] 批/)}).first();
  await selected.locator('summary').filter({hasText:/^集中制作与菜谱步骤/}).click();
  const task=selected.locator('.prep-task').first();
  await task.locator('summary').click();
  const label=task.getByRole('checkbox',{name:'已分装'});
  await label.click();
  await expect(label).toBeChecked();
  await page.reload();
  await page.getByRole('button',{name:'继续备餐'}).click();
  await page.locator('.prep-batch[open]').locator('summary').filter({hasText:/^集中制作与菜谱步骤/}).click();
  const saved=page.locator('.prep-batch[open] .prep-task summary').filter({hasText:'已分装'}).first();
  await saved.click();
  await expect(page.getByRole('checkbox',{name:'已分装',checked:true})).toBeVisible();
  for(const theme of ['浅色','深色']) {
    await nav(page,'我的').click();
    await page.getByText('外观与安装',{exact:true}).click();
    await page.getByLabel('外观').selectOption(theme);
    for(const width of [360,390,430]) {
      await page.evaluate(()=>{document.documentElement.style.fontSize='20px';});
      await page.setViewportSize({width,height:850});
      for(const name of ['首页','食谱','采购','我的']) {
        await nav(page,name).click();
        await assertFit(page);
        await expect(nav(page,name)).toBeVisible();
        const overflowing=await page.locator('.nutrition-row > div').evaluateAll(cells=>cells.flatMap(cell=>{
          const value=cell.querySelector('.unit');
          return value&&value.getBoundingClientRect().right>cell.getBoundingClientRect().right+1?[value.textContent]:[];
        }));
        expect(overflowing,theme+' '+width+' 像素 '+name).toEqual([]);
      }
      await expect(page.getByRole('navigation',{name:'主导航'}).getByRole('button')).toHaveCount(4);
      await nav(page,'采购').click();
      await expect(page.getByRole('button',{name:'采购清单',exact:true})).toBeVisible();
      await expect(page.getByRole('button',{name:'备餐清单',exact:true})).toBeVisible();
      await nav(page,'首页').click();
      await page.getByRole('button',{name:'生成设置'}).click();
      await assertFit(page);
      await nav(page,'首页').click();
      await page.getByRole('button',{name:'继续备餐'}).click();
      await assertFit(page);
    }
  }
});
test('生成由 Worker 执行，可以取消并留在当前页面',async({page})=>{
  await page.addInitScript(()=>{
    const Native=window.Worker;
    window.Worker=class extends Native {
      override postMessage(value:unknown):void {
        setTimeout(()=>super.postMessage(value),2000);
      }
    };
  });
  await setup(page);
  await page.getByRole('button',{name:'生成七天食谱',exact:true}).click();
  await expect(page.getByRole('button',{name:'取消生成'})).toBeVisible();
  await page.getByRole('button',{name:'取消生成'}).click();
  await expect(page.getByText('已取消，现有食谱保持原样。')).toBeVisible();
  await expect(page.getByRole('heading',{name:'你好，测试用户'})).toBeVisible();
  await expect(page.getByRole('button',{name:'生成七天食谱',exact:true})).toBeEnabled();
});


test('从库存页按公斤登记购买，修正后刷新保留且可以撤销',async({page})=>{
  await setup(page);
  await nav(page,'我的').click();
  await page.getByRole('button',{name:'家中库存',exact:true}).click();
  await expect(page.getByRole('heading',{name:'账面库存'})).toBeVisible();
  await page.getByRole('button',{name:'添加或登记购买'}).click();
  await page.getByRole('searchbox',{name:'搜索要登记的食材'}).fill('鸡胸肉');
  await page.getByLabel('选择食材').selectOption('chicken');
  await page.getByLabel('购买单位').selectOption('公斤');
  await page.getByLabel('实际购买数量').fill('1');
  await page.getByLabel('实际支付（元，可选）').fill('29');
  await page.getByRole('button',{name:'保存实际购买'}).click();
  const chicken=()=>page.locator('summary').filter({hasText:/^鸡胸肉.*1,000 克$/s});
  await expect(chicken()).toBeVisible();
  expect(await page.getByLabel('可用至').count()).toBe(0);
  expect(await page.getByLabel('保存方式').count()).toBe(0);
  await page.reload();
  await nav(page,'我的').click();
  await page.getByRole('button',{name:'家中库存',exact:true}).click();
  await chicken().click();
  await page.getByText('流水与购买修正',{exact:true}).click();
  await page.locator('summary').filter({hasText:/采购入库/}).click();
  await page.getByLabel('实际购买数量').fill('1.2');
  await page.getByRole('button',{name:'保存实际购买'}).click();
  await expect(page.locator('summary').filter({hasText:/^鸡胸肉.*1,200 克$/s})).toBeVisible();
  const edit=page.locator('summary').filter({hasText:/\d{4}-\d{2}-\d{2} · 购买修正/});
  await edit.click();
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'撤销购买',exact:true}).click();
  await expect(page.getByText('购买记录已撤销。')).toBeVisible();
  await page.getByRole('dialog',{name:'鸡胸肉',exact:true}).getByRole('button',{name:'关闭',exact:true}).click();
  await expect(page.locator('.inventory-row summary').filter({hasText:/^鸡胸肉.*1,200 克$/s})).toHaveCount(0);
});

test('整批取用和食谱完成餐次联动，同一餐只扣一次',async({page})=>{
  await setup(page);
  await page.evaluate(async ids=>{
    await new Promise<void>((resolve,reject)=>{
      const request=indexedDB.open('tiantianjian',1);
      request.onsuccess=()=>{
        const db=request.result, tx=db.transaction('app','readwrite'),store=tx.objectStore('app');
        const existing=store.get('data');
        existing.onsuccess=()=>{
          const data=existing.result;
          data.supply={ledger:{version:1,review:[],events:ids.map(item=>({
            id:'测试|'+item,item,source:'测试|'+item,kind:'手动补充',quantity:5000,unit:'克',delta:5000,
          }))}};
          store.put(data,'data');
        };
        tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
      };
      request.onerror=()=>reject(request.error);
    });
  },(JSON.parse(readFileSync(new URL('../src/foods.json',import.meta.url),'utf8')) as {id:string}[]).map(f=>f.id));
  await page.reload();
  await generate(page);
  await nav(page,'首页').click();
  await page.getByRole('button',{name:'继续备餐'}).click();
  const batch=page.locator('.prep-batch[open]').first();
  await expect(batch.locator('summary').filter({hasText:/^食材取用/})).toBeVisible();
  await batch.locator('summary').filter({hasText:/^调味料用量/}).click();
  const seasonings=batch.locator('details.group-fold[open]').filter({has:page.locator('summary').filter({hasText:/^调味料用量/})});
  await expect(seasonings).toContainText('克');
  await expect(seasonings).not.toContainText('份');
  page.once('dialog',dialog=>{expect(dialog.message()).toContain('确认从账面库存取用');void dialog.accept();});
  await batch.getByRole('button',{name:'确认本批实际取用'}).click();
  await expect(page.getByText('备餐进度已更新。')).toBeVisible();
  const ledger=()=>page.evaluate(()=>new Promise(resolve=>{
    const open=indexedDB.open('tiantianjian',1);
    open.onsuccess=()=>{
      const db=open.result,r=db.transaction('app').objectStore('app').get('data');
      r.onsuccess=()=>{db.close();resolve((r.result as Data).supply?.ledger);};
    };
  }));
  const before=await ledger();
  await nav(page,'食谱').click();
  await page.getByRole('button',{name:'完成本餐',exact:true}).first().click();
  await expect(page.getByText('本餐已完成')).toBeVisible();
  const finished=page.locator('.meal-card').filter({has:page.getByText('本餐已完成',{exact:true})});
  await expect(finished.getByRole('button',{name:'换一餐'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'换一天'})).toBeDisabled();
  await expect(finished.locator('.dish').first().getByRole('button',{name:/^换/})).toBeDisabled();
  await finished.locator('.dish-title').first().click();
  await expect(page.getByRole('dialog').getByRole('button',{name:'调整克数'})).toBeDisabled();
  expect(await ledger()).toEqual(before);
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  page.once('dialog',dialog=>dialog.accept('执行状态快照'));
  await page.getByRole('button',{name:'保存到历史'}).click();
  await expect(page.getByText('已保存到历史方案。')).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());
  await finished.getByRole('button',{name:'撤销完成标记'}).click();
  await expect(page.getByText('本餐已完成',{exact:true})).toHaveCount(0);
  expect(await ledger()).toEqual(before);
  await page.getByRole('button',{name:'历史方案',exact:true}).click();
  await page.locator('.history-item').filter({hasText:'执行状态快照'}).getByRole('button',{name:'查看',exact:true}).click();
  await expect(page.getByText('本餐已完成',{exact:true})).toBeVisible();
});

test('采购勾选实时显示单项、折叠批次、分类和全周进度',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'生成设置',exact:true}).click();
  await page.getByLabel('每周采购次数').selectOption('2');
  await page.getByText('固定搭配与随机种子',{exact:true}).click();
  await page.getByLabel('随机种子（选填）').fill('采购进度验收');
  await page.getByRole('button',{name:'重新搭配'}).click();
  await expect(page.getByText('七天食谱已生成。')).toBeVisible();
  await nav(page,'采购').click();
  const batch=page.locator('.batch-fold').first();
  const batchSummary=batch.locator(':scope > summary');
  const main=batch.locator('.group-fold').filter({has:page.locator('summary').filter({hasText:/^主要食材/})});
  const mainSummary=main.locator(':scope > summary');
  const weeklySummary=page.locator('summary').filter({hasText:/^全周食材汇总/});
  const row=main.locator('.purchase-list > li').first();
  const check=row.getByRole('checkbox');
  await expect(batchSummary).toContainText(/已购 0\/\d+ 项/);
  await expect(mainSummary).toContainText(/已购 0\/\d+ 项/);
  await check.click();
  const buyDialog=page.getByRole('dialog',{name:'确认实际购买',exact:true});
  const suggested=await buyDialog.getByLabel('实际购买数量').inputValue();
  await buyDialog.getByLabel('实际购买数量').fill('1');
  await buyDialog.getByRole('button',{name:'保存实际购买',exact:true}).click();
  await expect(row.locator('.purchase-item-status')).toHaveText('已买部分');
  await expect(mainSummary).toContainText(/已购 0\/\d+ 项/);
  await row.getByRole('button',{name:'详情',exact:true}).click();
  await row.getByLabel('实际购买数量').fill(suggested);
  await row.getByRole('button',{name:'保存实际购买',exact:true}).click();
  await expect(check).toBeChecked();
  await expect(row.locator('.purchase-item-status')).toHaveText('已购');
  const mainCount=await mainSummary.locator('.purchase-progress').innerText();
  const batchCount=await batchSummary.locator('.purchase-progress').innerText();
  const weeklyCount=await weeklySummary.locator('.purchase-progress').innerText();
  for (const value of [mainCount,batchCount,weeklyCount]) expect(value).toMatch(/已购 1\/\d+ 项/);
  await mainSummary.click();
  await expect(check).toBeHidden();
  await expect(mainSummary).toContainText(mainCount);
  await batchSummary.click();
  await expect(mainSummary).toBeHidden();
  await expect(batchSummary).toContainText(batchCount);
  await expect(weeklySummary).toContainText(weeklyCount);
  await page.reload();
  await nav(page,'采购').click();
  await expect(batchSummary).toContainText(batchCount);
  await expect(weeklySummary).toContainText(weeklyCount);
  await expect(check).toBeChecked();
  page.once('dialog',dialog=>dialog.accept());
  await check.click();
  await expect(check).not.toBeChecked();
  await expect(mainSummary).toContainText(/已购 0\/\d+ 项/);
  await expect(batchSummary).toContainText(/已购 0\/\d+ 项/);
  await expect(weeklySummary).toContainText(/已购 0\/\d+ 项/);
  await assertFit(page);
});

test('两标签页写入冲突及生成期间新库存不会被旧方案覆盖',async({page,context})=>{
  await setup(page);
  const second=await context.newPage();
  await second.goto(page.url());
  await expect(second.getByRole('heading',{name:'你好，测试用户'})).toBeVisible();
  const addOats=async(target:Page,grams:string)=>{
    await nav(target,'我的').click();
    await target.getByRole('button',{name:'家中库存',exact:true}).click();
    await target.getByRole('button',{name:'添加或登记购买'}).click();
    await target.getByLabel('选择食材').selectOption('oats');
    await target.getByRole('spinbutton',{name:'实际购买数量',exact:true}).fill(grams);
  };
  const findOats=(target:Page,grams:string)=>target.locator('summary').filter({hasText:new RegExp('^无糖燕麦片.*'+grams+' 克$')});
  await addOats(page,'50');
  await addOats(second,'30');
  await page.getByRole('button',{name:'保存实际购买'}).click();
  await expect(findOats(page,'50')).toBeVisible();
  await expect(findOats(second,'50')).toBeVisible();
  await second.getByRole('button',{name:'保存实际购买',exact:true}).click();
  await expect(findOats(second,'80')).toBeVisible();
  await expect(findOats(page,'80')).toBeVisible();

  await page.reload();
  await page.evaluate(()=>{
    const post=Worker.prototype.postMessage;
    Worker.prototype.postMessage=function(message:unknown){setTimeout(()=>post.call(this,message),2500);};
  });
  await page.getByRole('button',{name:'生成七天食谱',exact:true}).click();
  await addOats(second,'20');
  await second.getByRole('button',{name:'保存实际购买',exact:true}).click();
  await expect(findOats(second,'100')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('本机数据已更新');
  await nav(page,'我的').click();
  await page.getByRole('button',{name:'家中库存',exact:true}).click();
  await expect(findOats(page,'100')).toBeVisible();
});

test('逐页检查手机的三个宽度、两种主题和常用操作',async({page})=>{
  await setup(page);
  await generate(page);
  page.once('dialog',dialog=>dialog.accept('布局验收历史'));
  await page.getByRole('button',{name:'保存到历史'}).click();
  await expect(page.getByText('已保存到历史方案。')).toBeVisible();
  const routes=[
    ['编辑档案','编辑个人档案'],
    ['食谱大全','食谱大全'],
    ['家中库存','库存'],
    ['食材价格','食材价格'],
    [/^历史方案 ·/,'历史方案'],
  ] as const;
  for(const theme of ['浅色','深色']) {
    await nav(page,'我的').click();
    await page.getByText('外观与安装',{exact:true}).click();
    await page.getByLabel('外观').selectOption(theme);
    for(const width of [360,390,430]) {
      await page.setViewportSize({width,height:850});
      await page.evaluate(()=>{document.documentElement.style.fontSize='20px';});
      for(const [button,heading] of routes) {
        await nav(page,'我的').click();
        await page.getByRole('button',{name:button,exact:true}).click();
        await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
        await assertFit(page);
        if(heading==='食材价格') {
          await page.getByRole('searchbox',{name:'搜索食材'}).fill('燕麦');
          await expect(page.locator('summary').filter({hasText:/^无糖燕麦片 ·/})).toBeVisible();
        }
        if(heading==='历史方案')await expect(page.getByRole('heading',{name:'布局验收历史'})).toBeVisible();
      }
    }
  }
});

test('单项和全部清空只改真实库存，撤销后采购恢复，已付凭证仍可查询',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'生成设置',exact:true}).click();
  await page.getByLabel('食谱从哪天开始').selectOption('今天');
  await page.getByRole('button',{name:'重新搭配',exact:true}).click();
  await expect(page.getByText('七天食谱已生成。')).toBeVisible();
  await nav(page,'采购').click();
  await page.getByRole('checkbox').first().click();
  await page.getByLabel('实际支付（元，可选）').fill('17.36');
  await page.getByRole('button',{name:'保存实际购买',exact:true}).click();
  await expect(page.getByText('采购记录已更新。')).toBeVisible();
  await page.getByText('费用明细',{exact:true}).click();
  const value=(label:string)=>page.locator('dt').filter({hasText:new RegExp('^'+label+'$')}).locator('..').locator('dd');
  await expect(value('已实际支付')).toHaveText('¥17.36');
  const cost=await value('剩余预计采购费用').innerText();
  const openStock=async()=>{
    await nav(page,'我的').click();
    await page.getByRole('button',{name:'家中库存',exact:true}).click();
  };
  await openStock();
  const item=page.locator('.inventory-manager .group-fold > .item-fold').first();
  await item.locator(':scope > summary').click();
  await page.getByRole('button',{name:'清空此项库存'}).click();
  await page.getByRole('dialog',{name:/^清空 /}).getByRole('button',{name:'取消',exact:true}).click();
  await page.getByRole('button',{name:'清空此项库存'}).click();
  await page.getByRole('button',{name:'确认清空'}).click();
  await expect(page.getByRole('dialog',{name:/^清空 /})).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
  await expect(page.getByRole('button',{name:'撤销最近清空'})).toBeVisible();
  await nav(page,'采购').click();
  await page.getByText('费用明细',{exact:true}).click();
  await expect(value('已实际支付')).toHaveText('¥17.36');
  await expect(value('剩余预计采购费用')).not.toHaveText(cost);
  await openStock();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'撤销最近清空'}).click();
  await expect(item).toBeVisible();
  await page.getByText('库存管理',{exact:true}).click();
  await page.getByRole('button',{name:'清空全部库存'}).click();
  await page.getByRole('button',{name:'确认清空'}).click();
  await expect(page.getByRole('button',{name:'撤销最近清空'})).toBeVisible();
  await page.reload();
  await openStock();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'撤销最近清空'}).click();
  await expect(item).toBeVisible();
  await nav(page,'采购').click();
  await page.getByText('费用明细',{exact:true}).click();
  await expect(value('已实际支付')).toHaveText('¥17.36');
  await expect(value('剩余预计采购费用')).toHaveText(cost);
});

test('菜谱详情手动选库存中的替代油后同步实际配方和采购',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'生成设置',exact:true}).click();
  await page.getByText('固定搭配与随机种子',{exact:true}).click();
  await page.getByLabel('随机种子（选填）').fill('手动食材验收');
  await page.getByRole('button',{name:'重新搭配',exact:true}).click();
  await expect(page.getByText('七天食谱已生成。')).toBeVisible();
  const data=await page.evaluate(()=>new Promise<Data>((resolve,reject)=>{
    const request=indexedDB.open('tiantianjian');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result;
      const read=db.transaction('app').objectStore('app').get('data');
      read.onsuccess=()=>{resolve(read.result);db.close();};
      read.onerror=()=>{reject(read.error);db.close();};
    };
  }));
  const dish=data.plan!.days.flatMap((day,d)=>day.meals.flatMap((meal,m)=>meal.dishes.map((row,i)=>({d,m,i,row}))))
    .find(({row})=>row.ingredients.some(item=>item.id==='canola')&&
      (row.recipe.id.startsWith('boil-')||row.recipe.id.startsWith('steam-')||['quick-tofu','quick-steam-tofu','bowl-tofu-grain','bowl-chicken-rice'].includes(row.recipe.id)));
  expect(dish).toBeDefined();
  await nav(page,'我的').click();
  await page.getByRole('button',{name:'家中库存',exact:true}).click();
  await page.getByRole('button',{name:'添加或登记购买'}).click();
  await page.getByLabel('选择食材').selectOption('olive');
  await page.getByLabel('实际购买数量').fill('230');
  await page.getByRole('button',{name:'保存实际购买',exact:true}).click();
  await expect(page.getByText('采购记录已更新。')).toBeVisible();
  await nav(page,'食谱').click();
  await page.locator('.day-tabs button').nth(dish!.d).click();
  const row=page.locator('.meal-card').nth(dish!.m).locator('.dish-wrap').nth(dish!.i);
  await row.locator('.dish-title').click();
  await page.getByRole('dialog').getByRole('button',{name:'换做法',exact:true}).click();
  await page.getByRole('searchbox',{name:'搜索替换候选'}).fill('橄榄油');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('.replacement-row').filter({hasText:dish!.row.recipe.name}).filter({hasText:'橄榄油'}).getByRole('button',{name:'选择此项'}).first().click();
  await expect(page.getByText(/调整完成，已同步采购和备餐/)).toBeVisible();
  await expect(row.locator('.dish-ingredients')).toContainText('橄榄油');
  await expect(row.locator('.dish-ingredients')).not.toContainText('菜籽油');
  await nav(page,'采购').click();
  await page.getByText(/已有库存抵扣/).click();
  await expect(page.getByText('橄榄油',{exact:true}).filter({visible:true})).toBeVisible();
  await page.getByText(/本周食材替换/).click();
  await expect(page.getByText('菜籽油 → 橄榄油',{exact:true})).toBeVisible();
});

test('大字号采购行的食材、部分购买状态、长规格和详情互不重叠',async({page})=>{
  await setup(page);
  await generate(page);
  await nav(page,'采购').click();
  const row=page.locator('.batch-fold[open] .group-fold[open] .purchase-list > li').first();
  await row.getByRole('button',{name:'详情',exact:true}).click();
  await row.getByText('修改此食材单价',{exact:true}).click();
  await row.getByLabel('购买包装重量（克，可选）').fill('1590');
  await row.getByRole('button',{name:'保存此食材价格'}).click();
  await expect(page.getByText('食材价格已保存。')).toBeVisible();
  await row.getByRole('checkbox').click();
  const purchase=page.getByRole('dialog',{name:'确认实际购买'});
  await purchase.getByLabel('实际购买数量').fill('1');
  await purchase.getByRole('button',{name:'保存实际购买',exact:true}).click();
  await expect(row.locator('.purchase-item-status')).toHaveText('已买部分');
  await expect(row.locator('.purchase-quantity b')).toHaveText(/1,590\s克/);
  await expect(row.locator('.purchase-quantity small')).toContainText('1,590');
  for(const theme of ['浅色','深色']) {
    await nav(page,'我的').click();
    await page.getByText('外观与安装',{exact:true}).click();
    await page.getByLabel('外观').selectOption(theme);
    await nav(page,'采购').click();
    for(const width of [320,360,390,430]) {
      await page.setViewportSize({width,height:850});
      await page.evaluate(()=>{document.documentElement.style.fontSize='22px';});
      await assertFit(page);
      const fits=await row.locator('.purchase-row').evaluate(el=>{
        const detail=el.querySelector('button')!.getBoundingClientRect();
        const quantity=el.querySelector('.purchase-quantity')!.getBoundingClientRect();
        const identity=el.querySelector('label')!.getBoundingClientRect();
        const bounds=el.getBoundingClientRect();
        const allText=[...el.querySelectorAll('.purchase-name,.purchase-item-status,.purchase-quantity b,.purchase-quantity small')];
        return identity.right<=quantity.left+1&&quantity.right<=detail.left+1&&detail.right<=bounds.right+1&&allText.every(child=>{
          const range=document.createRange();
          range.selectNodeContents(child);
          const column=child.closest('label,.purchase-quantity')!.getBoundingClientRect();
          return [...range.getClientRects()].every(text=>text.left>=column.left-1&&text.right<=column.right+1);
        });
      });
      expect(fits,theme+' '+width+' 像素').toBe(true);
      await expect(row.getByRole('button',{name:'详情',exact:true})).toBeVisible();
    }
  }
  await row.getByRole('button',{name:'详情',exact:true}).click();
  await expect(row.getByText(/净需求/).filter({visible:true}).first()).toBeVisible();
});

test('食谱大全和原材料大全分开浏览，支持拼音、分页、价格编辑及手机布局',async({page})=>{
  await setup(page);
  await nav(page,'我的').click();
  await page.getByRole('button',{name:'原材料大全',exact:true}).click();
  await expect(page.getByRole('heading',{name:'原材料大全',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'查看全部原材料'}).click();
  await page.getByRole('button',{name:'下一页'}).click();
  await expect(page.getByText(/第 2 \/ /)).toBeVisible();
  await page.getByRole('searchbox',{name:'搜索原材料'}).fill('shengnvguo');
  await page.getByText('红色小番茄',{exact:true}).click();
  await expect(page.getByText(/圣女果、樱桃番茄/)).toBeVisible();
  await expect(page.getByRole('link',{name:'查看营养原始条目'})).toHaveAttribute('href',/mext\.go\.jp/);
  await page.getByRole('button',{name:'修改价格',exact:true}).click();
  await page.getByLabel('单价（元）').fill('19');
  await page.getByRole('button',{name:'保存此食材价格'}).click();
  await expect(page.getByText('食材价格已保存。')).toBeVisible();
  await expect(page.getByText(/¥19\.00\/斤 · 净重 · 用户自定义/)).toBeVisible();
  await page.getByRole('button',{name:/查看 .* 道相关菜谱/}).click();
  await expect(page.getByRole('heading',{name:'食谱大全'})).toBeVisible();
  await expect(page.getByRole('searchbox',{name:'搜索菜谱'})).toHaveValue('红色小番茄');
  await expect(page.getByText('小番茄凉拌黄瓜',{exact:true})).toBeVisible();
  for(const width of [360,390,430]){
    await page.setViewportSize({width,height:860});
    await assertFit(page);
  }
  await page.getByRole('searchbox',{name:'搜索菜谱'}).fill('');
  await page.getByRole('button',{name:'查看全部',exact:true}).click();
  await page.getByRole('button',{name:'下一页'}).click();
  await expect(page.getByText(/第 2 \/ /)).toBeVisible();
  await expect(page.getByRole('navigation',{name:'主导航'}).getByRole('button')).toHaveCount(4);
});

test('指定固定橙子，候选排除同水果，明确选择后同步食谱和采购',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'生成设置',exact:true}).click();
  await page.getByLabel('每周水果').selectOption('每周固定一种');
  await page.getByLabel('搜索固定水果').fill('chengzi');
  await page.getByRole('combobox',{name:'固定水果',exact:true}).selectOption('orange');
  await page.getByText('固定搭配与随机种子',{exact:true}).click();
  await page.getByRole('combobox',{name:'固定早餐'}).selectOption('breakfast-set-0-0');
  await expect(page.getByText('生成设置已保存。')).toBeVisible();
  await page.getByRole('button',{name:'重新搭配'}).click();
  await expect(page.getByText('七天食谱已生成。')).toBeVisible({timeout:12000});
  await page.getByRole('button',{name:'换水果',exact:true}).click();
  const panel=page.getByRole('region',{name:'智能替换选择'});
  const search=panel.getByRole('searchbox',{name:'搜索替换候选'});
  await search.fill('橙子');
  await expect(panel.locator('.replacement-row')).toHaveCount(0);
  await expect(panel.getByText(/暂无其他符合条件/)).toBeVisible();
  await search.fill('猕猴桃');
  for(const width of [360,390,430]){
    await page.setViewportSize({width,height:860});
    await assertFit(page);
  }
  const candidate=panel.locator('.replacement-row').filter({hasText:/猕猴桃/}).filter({hasNotText:/黄心/}).first();
  await expect(candidate).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());
  await candidate.getByRole('button',{name:'选择此项'}).click();
  await expect(page.getByText(/调整完成，已同步采购和备餐/)).toBeVisible();
  await expect(page.locator('.dish-ingredients').filter({hasText:/猕猴桃/})).toBeVisible();
  await nav(page,'采购').click();
  await expect(page.getByText(/猕猴桃/).first()).toBeAttached();
});

async function generationSettings(page:Page) {
  await nav(page,'食谱').click();
  await page.getByRole('button',{name:'生成设置',exact:true}).click();
}
async function choosePreference(page:Page,name:string,state:string) {
  await page.getByRole('searchbox',{name:'搜索核心食材'}).fill(name);
  await page.getByRole('combobox',{name:name+'偏好',exact:true}).selectOption(state);
}
test('快速连续多项锁定、跨分类、跨页写入、刷新及沿用和轮换',async({page,context})=>{
  await setup(page);
  await generationSettings(page);
  const chicken=page.getByRole('combobox',{name:'鸡胸肉偏好',exact:true});
  const beef=page.getByRole('combobox',{name:'瘦牛肉偏好',exact:true});
  await page.evaluate(()=>{
    const input=(name:string)=>document.querySelector<HTMLSelectElement>('select[aria-label="'+name+'偏好"]')!;
    for(const item of [input('鸡胸肉'),input('瘦牛肉')]){
      item.value='锁定必用';
      item.dispatchEvent(new Event('change',{bubbles:true}));
    }
  });
  await expect(chicken).toHaveValue('锁定必用');
  await expect(beef).toHaveValue('锁定必用');
  await expect(page.getByText('食材偏好已保存。',{exact:true})).toBeVisible();
  await page.getByText('高级设置',{exact:true}).click();
  page.once('dialog',dialog=>dialog.accept('原有两项锁定'));
  await page.getByRole('button',{name:'收藏为模板'}).click();
  await expect(page.getByText('已收藏食材池模板。')).toBeVisible();
  const second=await context.newPage();
  await second.goto(page.url());
  await generationSettings(second);
  await Promise.all([choosePreference(page,'西兰花','锁定必用'),choosePreference(second,'北豆腐','锁定必用')]);
  await expect(page.getByText('食材偏好已保存。',{exact:true})).toBeVisible();
  await expect(second.getByText('食材偏好已保存。',{exact:true})).toBeVisible();
  await expect(second.getByRole('button',{name:'解除西兰花锁定'})).toBeVisible();
  await second.close();
  await page.reload();
  await generationSettings(page);
  for(const name of ['鸡胸肉','瘦牛肉','西兰花','北豆腐'])await expect(page.getByRole('button',{name:'解除'+name+'锁定'})).toBeVisible();
  await page.getByText('高级设置',{exact:true}).click();
  await page.getByRole('combobox',{name:'已收藏模板'}).selectOption({label:'原有两项锁定'});
  await page.getByRole('button',{name:'载入模板'}).click();
  await expect(page.getByRole('button',{name:'解除北豆腐锁定'})).toBeVisible();
  await expect(page.getByRole('button',{name:'解除西兰花锁定'})).toBeVisible();
  await page.getByRole('combobox',{name:'食材一级分类'}).selectOption('蔬菜');
  await page.getByRole('combobox',{name:'食材二级分类'}).selectOption('花球类');
  await expect(page.getByRole('combobox',{name:'西兰花偏好'})).toHaveValue('锁定必用');
  await page.getByRole('button',{name:'重新搭配',exact:true}).click();
  await expect(page.getByText('七天食谱已生成。')).toBeVisible({timeout:15000});
  await generationSettings(page);
  await choosePreference(page,'番石榴','锁定必用');
  page.once('dialog',dialog=>{expect(dialog.message()).toContain('番石榴');void dialog.accept();});
  await page.getByRole('button',{name:'沿用食材',exact:true}).click();
  await expect(page.getByText('七天食谱已生成。')).toBeVisible({timeout:15000});
  await generationSettings(page);
  await expect(page.getByRole('button',{name:'解除番石榴锁定'})).toBeVisible();
  await page.getByRole('button',{name:'轮换食材',exact:true}).click();
  await expect(page.getByText('七天食谱已生成。')).toBeVisible({timeout:15000});
  await page.getByText('本周食材池',{exact:true}).click();
  await page.getByRole('button',{name:'查看食材与使用次数'}).click();
  for(const name of ['鸡胸肉','瘦牛肉','番石榴'])await expect(page.locator('details[open] .ingredients li').filter({hasText:new RegExp('^'+name)})).toBeVisible();
});

test('固定水果硬上限冲突、生成失败后保留、库存清空归零及手机布局',async({page})=>{
  await setup(page);
  await generate(page);
  await generationSettings(page);
  await page.getByLabel('每周水果').selectOption('每周固定一种');
  await page.getByRole('combobox',{name:'固定水果',exact:true}).selectOption('orange');
  await choosePreference(page,'番石榴','锁定必用');
  await expect(page.getByText(/固定水果橙子与锁定的番石榴冲突/)).toBeVisible();
  await page.getByRole('button',{name:'重新搭配',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('番石榴');
  await page.getByRole('button',{name:'改为多种水果轮换'}).click();
  await expect(page.getByRole('button',{name:'解除番石榴锁定'})).toBeVisible();
  await page.getByText('高级设置',{exact:true}).click();
  await page.getByRole('spinbutton',{name:'水果上限（种）'}).fill('0');
  await expect(page.getByText(/超过你设置的上限 0 种/)).toBeVisible();
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'确认提高上限'}).click();
  await expect(page.getByRole('spinbutton',{name:'水果上限（种）'})).toHaveValue('1');
  for(const width of [360,390,430]){
    await page.setViewportSize({width,height:860});
    await assertFit(page);
  }
  await page.getByRole('spinbutton',{name:'全周预算（元，可选）'}).fill('1');
  await page.getByRole('button',{name:'重新搭配',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText(/预算|搜索上限/,{timeout:18000});
  await page.reload();
  await nav(page,'食谱').click();
  await expect(page.locator('.meal-card').first()).toBeVisible();
  await generationSettings(page);
  await expect(page.getByRole('button',{name:'解除番石榴锁定'})).toBeVisible();
  await expect(page.getByRole('spinbutton',{name:'全周预算（元，可选）'})).toHaveValue('1');
  await nav(page,'我的').click();
  await page.getByRole('button',{name:'家中库存',exact:true}).click();
  await page.getByRole('button',{name:'添加或登记购买'}).click();
  await page.getByRole('searchbox',{name:'搜索要登记的食材'}).fill('鸡胸肉');
  await page.getByLabel('选择食材').selectOption('chicken');
  await page.getByLabel('实际购买数量').fill('300');
  await page.getByRole('button',{name:'保存实际购买',exact:true}).click();
  await expect(page.getByText('采购记录已更新。')).toBeVisible();
  await generationSettings(page);
  await page.getByRole('searchbox',{name:'搜索核心食材'}).fill('鸡胸肉');
  await expect(page.getByText('账面库存 300 克',{exact:true})).toBeVisible();
  await nav(page,'我的').click();
  await page.getByRole('button',{name:'家中库存',exact:true}).click();
  await page.getByText('库存管理',{exact:true}).click();
  await page.getByRole('button',{name:'清空全部库存',exact:true}).click();
  await page.getByRole('button',{name:'确认清空'}).click();
  await expect(page.getByText(/库存已清空/)).toBeVisible();
  await generationSettings(page);
  await page.getByRole('searchbox',{name:'搜索核心食材'}).fill('鸡胸肉');
  await expect(page.locator('.pool-items > li').filter({has:page.getByRole('combobox',{name:'鸡胸肉偏好',exact:true})})
    .getByText('账面库存 0 克',{exact:true})).toBeVisible();
});

test('原材料按两级分类浏览，返回关闭详情并保留筛选',async({page})=>{
  await page.goto('./');
  await nav(page,'我的').click();
  await page.getByRole('button',{name:'原材料大全',exact:true}).click();
  await page.getByText('肉类',{exact:true}).click();
  const search=page.getByRole('searchbox',{name:'搜索原材料'});
  await search.fill('jixiongrou');
  const chicken=page.getByRole('button').filter({has:page.getByText('鸡胸肉',{exact:true})});
  await chicken.click();
  const details=page.getByRole('dialog',{name:'鸡胸肉',exact:true});
  await expect(details.getByRole('heading',{name:'营养概览'})).toBeVisible();
  await page.goBack();
  await expect(details).toHaveCount(0);
  await expect(search).toHaveValue('jixiongrou');
  await expect(chicken).toBeFocused();
  await page.goBack();
  await search.fill('');
  await expect(page.getByText('鱼虾海鲜',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'返回',exact:true}).click();
  await expect(page.getByRole('heading',{name:'食谱与食材'})).toBeVisible();
});

test('采购弹层验证无效数量、约束焦点并可返回取消',async({page})=>{
  await setup(page);
  await generate(page);
  await nav(page,'采购').click();
  const checkbox=page.locator('.batch-fold[open]').getByRole('checkbox').first();
  await checkbox.click();
  const modal=page.getByRole('dialog',{name:'确认实际购买'});
  await expect(modal).toBeVisible();
  await modal.getByRole('spinbutton',{name:'实际购买数量'}).fill('0');
  await modal.getByRole('button',{name:'保存实际购买'}).click();
  await expect(modal.getByRole('alert')).toContainText('请核对购买数量');
  for(let i=0;i<8;i++){
    await page.keyboard.press('Tab');
    expect(await page.evaluate(()=>Boolean(document.activeElement?.closest('dialog[open]')))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await expect(checkbox).toBeFocused();
  await expect(checkbox).not.toBeChecked();
});

test('筛选内批量锁定跨搜索保留选择，刷新后恢复',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'生成设置'}).click();
  await page.getByRole('button',{name:'批量选择'}).click();
  const search=page.getByRole('searchbox',{name:'搜索核心食材'});
  for(const name of ['鸡胸肉','瘦牛肉']){
    await search.fill(name);
    await page.getByRole('checkbox',{name:'选择'+name,exact:true}).check();
  }
  await page.getByLabel('批量状态').selectOption('锁定必用');
  await page.getByRole('button',{name:'应用到 2 种'}).click();
  await expect(page.getByText('食材偏好已保存。')).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:'生成设置'}).click();
  await expect(page.getByLabel('解除鸡胸肉锁定')).toBeVisible();
  await expect(page.getByLabel('解除瘦牛肉锁定')).toBeVisible();
});

test('原材料分类浅深色适配小屏、平板和桌面',async({page})=>{
  await page.goto('./');
  await nav(page,'我的').click();
  await page.getByRole('button',{name:'原材料大全',exact:true}).click();
  for(const colorScheme of ['light','dark'] as const){
    await page.emulateMedia({colorScheme});
    for(const width of [320,360,375,390,430,768,1200]){
      await page.setViewportSize({width,height:800});
      await assertFit(page);
      const row=page.getByText('主食杂粮',{exact:true});
      await expect(row).toBeVisible();
      await expect(page.getByRole('navigation',{name:'主导航'}).getByRole('button')).toHaveCount(4);
      const text=row.locator('..');
      expect(await text.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
    }
  }
});

test('小屏保留超长菜名、大额库存和缺失微量营养提示',async({page})=>{
  await setup(page);
  await nav(page,'食谱').click();
  await expect(page.getByRole('heading',{name:'还没有每周食谱'})).toBeVisible();
  await generate(page);
  const name='广东家常蒸煮混合杂粮饭搭配时令蔬菜与新鲜豆制品的测试菜名'.repeat(3);
  await page.evaluate(name=>new Promise<void>((resolve,reject)=>{
    const request=indexedDB.open('tiantianjian',1);
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('app','readwrite'),store=tx.objectStore('app');
      const entry=store.get('data');
      entry.onsuccess=()=>{
        const data=entry.result;
        const dish=data.plan.days[0].meals[0].dishes[0];
        dish.recipe.name=name;
        dish.nutrients.calcium=null;
        data.supply??={};
        data.supply.ledger??={version:1,review:[],events:[]};
        data.supply.ledger.events.push({id:'large-stock-v3',item:'chicken',source:'large-stock-v3|chicken',
          kind:'手动补充',quantity:1_234_567,unit:'克',delta:1_234_567});
        store.put(data,'data');
      };
      tx.oncomplete=()=>{db.close();resolve();};
      tx.onerror=()=>reject(tx.error);
    };
  }),name);
  await page.reload();
  await page.setViewportSize({width:320,height:750});
  await page.evaluate(()=>{document.documentElement.style.fontSize='22px';});
  await nav(page,'食谱').click();
  const dish=page.getByRole('button',{name,exact:true});
  await expect(dish).toBeVisible();
  await expect(dish).toHaveText(name);
  await assertFit(page);
  await page.getByText('每日微量营养与覆盖',{exact:true}).click();
  await expect(page.getByText('部分食材缺值',{exact:true}).first()).toBeVisible();
  await dish.click();
  await expect(page.getByRole('dialog',{name,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await nav(page,'我的').click();
  await page.getByRole('button',{name:'家中库存',exact:true}).click();
  await expect(page.getByText('1,234,567 克',{exact:true})).toBeVisible();
  await assertFit(page);
});

test('BMI 连续调整、普通称重保留食谱编辑和已锁菜，起点独立',async({page})=>{
  await setup(page,{...demo,weight:'72',target:'60',height:'173',age:'25',deficit:{mode:'缓慢减脂',normalOptIn:true}});
  const calories=page.locator('.home-task').filter({hasText:'每日热量目标'}).locator('strong');
  await expect(calories).toContainText('1,718');
  await generate(page);
  await page.locator('.dish-title').first().click();
  await page.getByRole('dialog').getByRole('button',{name:'锁定这道菜'}).click();
  await expect(page.getByRole('button',{name:'解除锁定'})).toBeVisible();
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await nav(page,'首页').click();
  await page.getByRole('button',{name:'记录体重',exact:true}).click();
  await page.getByLabel('体重（千克）',{exact:true}).fill('71');
  await page.getByRole('button',{name:'保存体重'}).click();
  await expect(page.getByText(/71 千克/).first()).toBeVisible();
  await page.getByLabel('体重（千克）',{exact:true}).fill('70');
  await page.getByRole('button',{name:'保存体重'}).click();
  await expect(page.getByRole('alert')).toContainText('已经有称重记录');
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await expect(calories).toContainText('1,721');
  await page.getByText('查看热量计算依据',{exact:true}).click();
  await expect(page.getByText('BMI 缺口保留比例',{exact:true})).toBeVisible();
  await expect(page.getByText(/累计减重 1 千克/)).toBeVisible();
  await nav(page,'食谱').click();
  await expect(page.getByText(/当前建议 1721 千卡 · 生成时目标 1718 千卡/)).toBeVisible();
  await expect(page.locator('.dish').getByRole('button',{name:/^换/}).nth(1)).toBeEnabled();
  const lockedName=await page.locator('.dish-title').first().innerText();
  await page.getByRole('button',{name:'更新未执行食谱'}).click();
  await expect(page.getByText('七天食谱已生成。')).toBeVisible({timeout:12000});
  await expect(page.getByText('生成时目标 1721 千卡',{exact:true})).toBeVisible();
  await expect(page.locator('.dish-title').first()).toHaveText(lockedName);
  await page.locator('.dish-title').first().click();
  await expect(page.getByRole('button',{name:'解除锁定'})).toBeVisible();
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  for(const width of [360,390,430]){
    await page.setViewportSize({width,height:850});
    await assertFit(page);
  }
  await nav(page,'我的').click();
  await page.getByRole('button',{name:'编辑档案'}).click();
  await expect(page.getByLabel('当前体重（千克）',{exact:true})).toHaveCount(0);
  await expect(page.getByText(/当前体重由首页称重记录更新/)).toBeVisible();
});

test('旧档案在首页确认减脂缺口，称重与百分比显示保持正确',async({page})=>{
  await setup(page,{...demo,age:'25',height:'173',weight:'72',target:'60'});
  await page.getByRole('button',{name:'记录体重',exact:true}).click();
  await page.getByLabel('体重（千克）',{exact:true}).fill('71');
  await page.getByRole('button',{name:'保存体重'}).click();
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  const card=page.locator('.home-task').filter({hasText:'每日热量目标'});
  await expect(card).toContainText('2,006');
  await expect(card).toContainText('正常 BMI 的默认推荐为维持');
  for(const width of [320,360,390,430]){
    await page.setViewportSize({width,height:850});
    await page.evaluate(()=>{document.documentElement.style.fontSize='22px';});
    const percent=page.locator('.weight-note > strong');
    await expect(percent).toHaveText('8%');
    expect(await percent.evaluate(node=>{
      const range=document.createRange();
      range.selectNodeContents(node);
      const boxes=[...range.getClientRects()];
      return boxes.length>0&&Math.max(...boxes.map(box=>box.top))<Math.min(...boxes.map(box=>box.bottom));
    })).toBe(true);
    await assertFit(page);
  }
  await card.getByRole('button',{name:'设置热量缺口',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'设置热量缺口'});
  await sheet.getByLabel('标准热量缺口').selectOption('缓慢减脂');
  await expect(sheet).toContainText('尚未确认正常 BMI 下适合减脂');
  await expect(sheet.getByRole('button',{name:'保存热量设置'})).toBeDisabled();
  await sheet.getByRole('checkbox',{name:/我主动选择在正常 BMI 时减脂/}).check();
  await expect(sheet).toContainText('1,721 千卡');
  await sheet.getByRole('button',{name:'保存热量设置'}).click();
  await expect(card).toContainText('1,721');
  await expect(card).toContainText('实际模式 · 减脂');
  await page.reload();
  await expect(card).toContainText('1,721');
  await expect(page.locator('.weight-note')).toContainText('起点 72 千克');
  await expect(page.locator('.weight-values')).toContainText('71');
});

test('档案体重 71 千克可直接预览缓慢减脂，取消或确认各自生效',async({page,context})=>{
  await setup(page,{...demo,age:'25',height:'173',weight:'71',target:'60'});
  const card=page.locator('.home-task').filter({hasText:'每日热量目标'});
  const choose=card.getByRole('button',{name:'选择缓慢减脂'});
  await expect(page.getByText('还没有称重记录，当前体重来自个人档案。')).toBeVisible();
  await expect(card).toContainText('2,006');
  await choose.click();
  const sheet=page.getByRole('dialog',{name:'选择缓慢减脂'});
  await expect(sheet).toContainText('1,721 千卡');
  await sheet.getByRole('button',{name:'继续维持体重'}).click();
  await expect(card).toContainText('2,006');
  await choose.click();
  await sheet.getByRole('button',{name:'确认适用并启用'}).click();
  await expect(card).toContainText('1,721');
  await expect(card).toContainText('实际模式 · 减脂');
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(card).toContainText('1,721');
  await expect(choose).toHaveCount(0);
});

test('低体重保护边界不出现缓慢减脂快捷选项',async({page})=>{
  await setup(page,{...demo,age:'25',height:'173',weight:'60',target:'60'});
  const card=page.locator('.home-task').filter({hasText:'每日热量目标'});
  await expect(card).toContainText('已达到目标或低体重保护边界');
  await expect(card.getByRole('button',{name:'选择缓慢减脂'})).toHaveCount(0);
});
