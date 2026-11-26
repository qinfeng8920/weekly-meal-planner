import {expect,test,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import type {Data} from '../src/store';
import {demo} from './fixtures';

async function setup(page:Page) {
  await page.goto('./');
  await page.getByRole('button',{name:'开始填写档案'}).click();
  await page.getByLabel('昵称（选填）').fill(demo.name);
  await page.getByLabel('公式使用的性别').selectOption(demo.sex);
  await page.getByLabel('年龄（岁）').fill(demo.age);
  await page.getByLabel('身高（厘米）').fill(demo.height);
  await page.getByLabel('当前体重（千克）').fill(demo.weight);
  await page.getByLabel('目标体重（千克）').fill(demo.target);
  await page.getByRole('button',{name:'继续',exact:true}).click();
  await page.getByRole('button',{name:'继续',exact:true}).click();
  await page.getByRole('button',{name:'继续',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('完成并确认');
  await page.getByText('我已核对年龄、孕哺期、进食障碍及医嘱筛查').click();
  await page.getByText('我已核对过敏原与其他强制忌口').click();
  for(let i=0;i<3;i++) await page.getByRole('button',{name:'继续',exact:true}).click();
  await page.getByRole('button',{name:'保存档案'}).click();
  await expect(page.getByRole('heading',{name:'你好，测试用户'})).toBeVisible();
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
  await page.getByLabel('外观').selectOption('深色');
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
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
  await page.locator('summary').filter({hasText:/^早餐$/}).click();
  await page.getByLabel('不喜欢的食材',{exact:true}).filter({visible:true}).fill('酸奶');
  await page.getByRole('button',{name:'保存分餐偏好'}).click();
  await expect(page.getByText(/分餐偏好已保存/)).toBeVisible();
  await page.getByText('固定搭配与随机种子',{exact:true}).click();
  await page.getByLabel('固定早餐').selectOption('breakfast-set-0-0');
  await expect(page.getByText('生成设置已保存。')).toBeVisible();
  await page.getByLabel('随机种子（选填）').fill('浏览器验收');
  await page.getByRole('button',{name:'按设置生成'}).click();
  await expect(page.getByText('七天食谱已生成。')).toBeVisible();
  const breakfast=page.locator('section.meal-card').first();
  await expect(breakfast.getByRole('heading',{name:'早餐',exact:true})).toBeVisible();
  await expect(breakfast.getByRole('button',{name:'无糖豆浆煮燕麦',exact:true})).toBeVisible();
  await expect(breakfast.getByRole('button',{name:'水煮蛋（即食）',exact:true})).toBeVisible();
  await expect(breakfast.getByText('熟重',{exact:true})).toBeVisible();
  await page.getByText('全周日均营养检查',{exact:true}).click();
  await expect(page.locator('details[open]').filter({has:page.getByText('全周日均营养检查',{exact:true})}).getByText('参考值 800 毫克',{exact:true})).toBeVisible();
  await nav(page,'我的').click();
  await page.getByRole('button',{name:'菜谱库与收藏'}).click();
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
  await page.getByLabel('采购模式').selectOption('均衡搭配');
  await page.getByLabel('烹饪偏好').selectOption('家常');
  await page.getByRole('button',{name:'保存设置',exact:true}).click();
  await expect(page.getByText('生成设置已保存。')).toBeVisible();
  await nav(page,'首页').click();
  await generate(page);
  const now=await page.evaluate(()=>new Intl.DateTimeFormat('zh-CN',{weekday:'short'}).format(new Date())+
    ' '+(new Date().getMonth()+1)+'/'+new Date().getDate());
  await expect(page.locator('.day-tabs button').first()).toHaveAccessibleName(now);
  await page.getByRole('button',{name:'生成设置',exact:true}).click();
  await expect(page.getByLabel('采购模式')).toHaveValue('均衡搭配');
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
  await page.getByRole('button',{name:'按设置生成'}).click();
  await expect(page.getByText('七天食谱已生成。')).toBeVisible();
  page.once('dialog',d=>d.accept('原价快照'));
  await page.getByRole('button',{name:'保存到历史'}).click();
  await expect(page.getByText('已保存到历史方案。')).toBeVisible();
  await nav(page,'采购').click();
  await expect(page.locator('summary').filter({hasText:/^采购第 [12] 批/})).toHaveCount(2);
  const total=()=>page.locator('.section-title').filter({has:page.getByRole('heading',{name:'本周采购',exact:true})}).locator('strong');
  const old=await total().innerText();
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
  await expect(total()).not.toHaveText(old);
  await page.reload();
  await nav(page,'我的').click();
  await page.getByRole('button',{name:'食材价格',exact:true}).click();
  await page.getByRole('searchbox',{name:'搜索食材'}).fill('燕麦');
  await expect(page.getByText(/¥79\.00\/斤.*用户自定义/)).toBeVisible();
  await nav(page,'我的').click();
  await page.getByRole('button',{name:/历史方案/}).click();
  const saved=page.locator('section.card').filter({has:page.getByRole('heading',{name:'原价快照'})});
  await saved.getByRole('button',{name:'查看',exact:true}).click();
  await expect(total()).toHaveText(old);
  await page.getByRole('button',{name:'按最新价格重新估算',exact:true}).click();
  await expect(total()).not.toHaveText(old);
  await page.getByRole('button',{name:'返回历史价格快照',exact:true}).click();
  await expect(total()).toHaveText(old);
});

test('新生成设置、补充确认、分装进度和三种手机宽度的浅深色布局',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'生成设置'}).click();
  await page.getByLabel('采购模式').selectOption('少量种类');
  await page.getByLabel('选择方式').selectOption('手动指定');
  page.once('dialog',dialog=>{
    expect(dialog.message()).toContain('确认后才保存方案');
    void dialog.dismiss();
  });
  await page.getByRole('button',{name:'按设置生成'}).click();
  await expect(page.getByText('已保留原方案，可继续调整食材池。')).toBeVisible();
  await page.getByLabel('选择方式').selectOption('自动选择');
  await page.getByRole('button',{name:'按设置生成'}).click();
  await expect(page.getByText('本周食材池',{exact:true})).toBeVisible();
  await nav(page,'首页').click();
  await page.getByRole('button',{name:'继续备餐'}).click();
  const selected=page.locator('details.card[open]').filter({has:page.getByText(/备餐第 [123] 批/)}).first();
  await selected.locator('summary').filter({hasText:/^制作步骤/}).click();
  const task=selected.locator('.prep-task').first();
  await task.locator('summary').click();
  const label=task.getByRole('checkbox',{name:'已分装'});
  await label.click();
  await expect(label).toBeChecked();
  await page.reload();
  await page.getByRole('button',{name:'继续备餐'}).click();
  await page.locator('.prep-batch[open]').locator('summary').filter({hasText:/^制作步骤/}).click();
  const saved=page.locator('.prep-batch[open] .prep-task summary').filter({hasText:'已分装'}).first();
  await saved.click();
  await expect(page.getByRole('checkbox',{name:'已分装',checked:true})).toBeVisible();
  for(const theme of ['浅色','深色']) {
    await nav(page,'我的').click();
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
  await expect(page.getByText(/数字是账面库存/)).toBeVisible();
  await page.getByRole('button',{name:'添加或登记购买'}).click();
  await page.getByLabel('选择食材').selectOption('chicken');
  await page.getByLabel('购买单位').selectOption('公斤');
  await page.getByLabel('实际购买数量').fill('1');
  await page.getByLabel('实际支付（元，可选）').fill('29');
  await page.getByRole('button',{name:'保存实际购买'}).click();
  const chicken=()=>page.locator('summary').filter({hasText:/^鸡胸肉.*1,000 克$/});
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
  await expect(page.locator('summary').filter({hasText:/^鸡胸肉.*1,200 克$/})).toBeVisible();
  const edit=page.locator('summary').filter({hasText:/\d{4}-\d{2}-\d{2} · 购买修正/});
  await edit.click();
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'撤销购买',exact:true}).click();
  await expect(page.getByText('购买记录已撤销。')).toBeVisible();
  await expect(page.locator('summary').filter({hasText:/^鸡胸肉.*1,200 克$/})).toHaveCount(0);
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
  await expect(batch.locator('summary').filter({hasText:/^食材取用与分装/})).toBeVisible();
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
  expect(await ledger()).toEqual(before);
});

test('采购勾选实时显示单项、折叠批次、分类和全周进度',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'生成设置',exact:true}).click();
  await page.getByLabel('每周采购次数').selectOption('2');
  await page.getByText('固定搭配与随机种子',{exact:true}).click();
  await page.getByLabel('随机种子（选填）').fill('采购进度验收');
  await page.getByRole('button',{name:'按设置生成'}).click();
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
  await row.getByRole('button',{name:'详情',exact:true}).click();
  await row.getByLabel('实际购买数量').fill('1');
  await row.getByRole('button',{name:'保存实际购买',exact:true}).click();
  await expect(row.locator('.purchase-item-status')).toHaveText('已买部分');
  await expect(mainSummary).toContainText(/已购 0\/\d+ 项/);
  await check.click();
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
