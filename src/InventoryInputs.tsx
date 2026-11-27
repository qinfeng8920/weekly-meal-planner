import {Action,Icon} from './design';
import {useState} from 'react';
import {food} from './catalog';
import type {PrepJob,Receipt} from './logistics';
import type {TaskRecord} from './execution';
import {edibleRate,priceUnits,purchaseGrams,type PriceInput,type PriceUnit} from './prices';
import {roundGrams} from './purchase-food';
import {dateKey} from './profile';
import {decimal} from './ui';

export function PurchaseForm({id,previous,suggested,price,save}:{id:string;previous?:Receipt;suggested?:number;price?:PriceInput;save:(receipt:Receipt)=>Promise<boolean>}) {
  const [quantity,setQuantity]=useState(String(previous?.quantity??previous?.gross??suggested??''));
  const [unit,setUnit]=useState<PriceUnit>(previous?.unit??'克');
  const [paid,setPaid]=useState(String(previous?.paid??''));
  const [date,setDate]=useState(previous?.date??dateKey);
  const [net,setNet]=useState(String(previous?.net??''));
  const [each,setEach]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const rawGross=previous&&!previous.netOnly&&unit===(previous.unit??'克')&&+quantity===(previous.quantity??previous.gross)?previous.gross:undefined;
  const counted=['个','袋','盒','瓶'].includes(unit);
  const gross=rawGross??purchaseGrams(+quantity,unit,price,each.trim()?+each:undefined);
  const rawNet=net.trim()?+net:gross===undefined?undefined:gross*edibleRate(price);
  const unknownGross=gross===undefined;
  function submit() {
    const codedGross=gross??rawNet;
    if(!quantity.trim()||!Number.isFinite(+quantity)||+quantity<=0||(counted&&!Number.isInteger(+quantity))||
      !codedGross||!Number.isFinite(codedGross)||codedGross>1e8||!rawNet||!Number.isFinite(rawNet)||rawNet>codedGross||
      !date||date>dateKey()||paid.trim()&&(!Number.isFinite(+paid)||+paid<0||+paid>1e8)) {
      setError('请核对购买数量、换算净重、日期及金额。单位换算不明时，填写实测净重或每份克重。');return;
    }
    setError('');setBusy(true);
    const receipt={gross:roundGrams(codedGross),net:roundGrams(rawNet),quantity:+quantity,unit,date,
      ...(unknownGross?{netOnly:true as const}:{}),...(paid.trim()?{paid:+paid,paidGross:roundGrams(codedGross)}:{})};
    void save(receipt).finally(()=>setBusy(false));
  }
  return <section className="inline-editor" aria-label={food(id).name+'购买登记'}>
    <div className="fields purchase-form-fields">
      <label className="field">实际购买数量<input type="number" inputMode={counted?'numeric':'decimal'} min=".01" step={counted?1:'any'} value={quantity} onChange={e=>{setQuantity(e.target.value);setNet('');}}/></label>
      <label className="field">购买单位<select value={unit} onChange={e=>{setUnit(e.target.value as PriceUnit);setNet('');setEach('');}}>
        {priceUnits.map(u=><option key={u}>{u}</option>)}</select></label>
      <label className="field">实际支付（元，可选）<input type="number" min="0" step=".01" value={paid} onChange={e=>setPaid(e.target.value)}/></label>
    </div>
    <details open={unknownGross?true:undefined}><summary>净重、换算与购入日期</summary><div className="fields">
      <label className="field">实际购买日期<input type="date" value={date} max={dateKey()} onChange={e=>setDate(e.target.value)}/></label>
      {unknownGross&&<label className="field">每{unit}重量（克）<input type="number" min=".01" step="any" value={each} onChange={e=>setEach(e.target.value)}/></label>}
      <label className="field">实测可食净重（克，可选）<input type="number" min=".01" step="any" value={net} onChange={e=>setNet(e.target.value)}/></label>
    </div></details>
    {!!rawNet&&<p className="meta">本笔入库 <span className="unit">{decimal(rawNet)} 克净重</span>{previous?'，原入库 '+decimal(previous.net)+' 克':''}</p>}
    {error&&<p className="error" role="alert">{error}</p>}
    <Action icon="check" className="primary purchase-submit" disabled={busy} onClick={submit}>{busy?'正在保存…':'保存实际购买'}</Action>
  </section>;
}

export function WithdrawalControl({label,jobs,tasks,execute}:{label:string;jobs:PrepJob[];tasks?:Record<string,TaskRecord>;execute:(jobs:PrepJob[])=>Promise<boolean>}) {
  const [editing,setEditing]=useState(false),[values,setValues]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const pending=jobs.filter(j=>j.key&&!tasks?.[j.key]?.taken);
  const amounts=new Map<string,number>();
  for(const j of pending)for(const i of j.ingredients)amounts.set(i.id,roundGrams((amounts.get(i.id)??0)+i.grams));
  function confirmUsage() {
    if(Object.entries(values).some(([id,value])=>amounts.has(id)&&(!value.trim()||!Number.isFinite(+value)||+value<0||+value>1e7))) {
      setError('请填写有效的实际用量，未使用的食材可输入 0。');return;
    }
    const remaining=new Map(amounts);
    const quantity=new Map([...amounts].map(([id,g])=>[id,editing&&values[id]!==undefined?+values[id]:g]));
    const corrected=jobs.map(j=>!j.key||tasks?.[j.key]?.taken?j:{...j,ingredients:j.ingredients.map(i=>{
      const left=remaining.get(i.id)??0, target=quantity.get(i.id)??0;
      const share=left?Math.min(target,roundGrams(target*i.grams/left)):0;
      remaining.set(i.id,roundGrams(left-i.grams));quantity.set(i.id,roundGrams(target-share));
      return {...i,grams:share};
    }).filter(i=>i.grams>0)});
    setBusy(true);setError('');
    void execute(corrected).then(ok=>{if(ok){setEditing(false);setValues({});}}).finally(()=>setBusy(false));
  }
  if(!jobs.length)return null;
  return <div className="withdrawal-control">
    <div className="actions">
      <Action icon="check" disabled={busy} onClick={confirmUsage}>{label}</Action>
      {pending.length>0&&<button className="flat" aria-expanded={editing} onClick={()=>setEditing(!editing)}>调整实际用量</button>}
    </div>
    {editing&&<div className="fields">{[...amounts].map(([id,grams])=><label key={id} className="field">{food(id).name}（克）
      <input type="number" inputMode="decimal" min="0" step="any" value={values[id]??String(grams)} onChange={e=>setValues({...values,[id]:e.target.value})}/></label> )}</div>}
    {error&&<p className="error" role="alert">{error}</p>}
  </div>;
}
