import {useEffect,useId,useRef,useState,type ButtonHTMLAttributes,type ReactNode} from 'react';
import {createPortal} from 'react-dom';

const lines={
  home:'M3 11.5 12 4l9 7.5M5.5 10v10h13V10M10 20v-5h4v5',
  book:'M4 5h5a3 3 0 0 1 3 3v12a4 4 0 0 0-3-2H4zM20 5h-5a3 3 0 0 0-3 3v12a4 4 0 0 1 3-2h5z',
  basket:'M3 10h18l-2.5 10h-13zM8 10l4-6 4 6M9 14v2m6-2v2',
  user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2',
  arrow:'m9 6 6 6-6 6', back:'m15 6-6 6 6 6', close:'m6 6 12 12M18 6 6 18',
  search:'M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Zm-2 4.5 5 5',
  slider:'M4 7h16M4 17h16M8 4v6m8 4v6', box:'m4 7 8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4m-8 4v10',
  clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-5v5l3 2',
  calendar:'M4 6h16v14H4zM8 4v4m8-4v4M4 10h16m-12 4h2m4 0h2m-8 3h2',
  tag:'M3 12 12 3h8v8l-9 9zM15 8h.01',
  shield:'M12 3 4 6v6c0 5 4 8 8 9 4-1 8-4 8-9V6zM9 12l2 2 4-4',
  palette:'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3.8 1 1 0 0 1 .5-1.9H17a4 4 0 0 0 4-4c0-4.5-4-8.3-9-8.3ZM7 10h.01M10 6h.01m5 1h.01m3 4h.01',
  bars:'M3 20h18M6 16v-3m6 3V8m6 8V4',
  check:'m5 12 4 4L19 6', plus:'M12 5v14M5 12h14', lock:'M6 10h12v10H6zM8 10V7a4 4 0 0 1 8 0v3m-4 4v2',
  star:'m12 3 2.8 5.6 6.2.9-4.5 4.4 1 6.1-5.5-2.9-5.5 2.9 1-6.1L3 9.5l6.2-.9z',
  dots:'M5 12h.01m7 0h.01m7 0h.01',
  edit:'M4 16 16 4l4 4L8 20H4zm10-10 4 4', trash:'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5',
  copy:'M8 8h12v12H8zM4 16V4h12', share:'M12 15V3m-4 4 4-4 4 4M6 11H4v9h16v-9h-2',
  scale:'M5 4h14l2 16H3zM8 9a4 4 0 0 1 8 0m-4 0 2-2',
  swap:'M4 8h16l-3-3M20 16H4l3 3', pot:'M4 9h16v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zm-2 3h2m16 0h2M8 6h8m-4-2v2',
} as const;
export type IconName=keyof typeof lines;
export function Icon({name,size=22}:{name:IconName;size?:number}) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={name==='dots'?3.3:1.75} strokeLinecap="round" strokeLinejoin="round"><path d={lines[name]}/></svg>;
}
const pictures={
  meat:['#b54648','#f8d5ce','M7 22c0-9 9-15 18-15 8 0 12 7 9 13-3 6-10 4-14 10-5 6-13 0-13-8Z','M12 22c0-5 6-10 10-11m-1 12c4-4 7-3 9-6'],
  fish:['#26748a','#cce9eb','M3 20c7-10 17-11 24-4l8-5v18l-8-5C20 31 10 30 3 20Z','M13 19h.1m7-3 2 4-2 4'],
  egg:['#966027','#fbe3bc','M20 5c-7 0-14 11-14 19a14 14 0 0 0 28 0c0-8-7-19-14-19Z','M12 25c0 3 2 6 5 7'],
  veg:['#2b7548','#ccebd0','M30 7C14 7 6 14 9 25s21 8 23-17Z','m7 34 17-17m-7 7v-7m0 7h8'],
  mushroom:['#905e41','#f1dac5','M5 20a15 15 0 0 1 30 0c-4 5-26 5-30 0Zm11 4-2 9c2 4 10 4 12 0l-2-9','M11 18c2-4 5-6 8-6'],
  grain:['#8b601e','#f7e5b8','M4 20h32a16 14 0 0 1-32 0Z','M10 17c2-4 5-5 7-3 0-6 5-7 7-2 4-2 7 1 7 5m-19 10c2 2 4 3 7 3'],
  bean:['#897142','#ece5c3','M11 29c-8-8-2-20 6-20 7 0 8 5 5 8-4 4 1 7 4 4 5-6 11 0 5 7-6 7-15 7-20 1Z','M13 25c2 3 6 5 9 3'],
  milk:['#5274a4','#dfe7f8','M12 5h13l5 9v20H10V14zm-2 9h20M25 5l-4 9v20','M13 21h5m-5 4h5'],
  fruit:['#b55335','#f9dcc7','M20 15c-6-6-15-3-14 7 1 7 6 13 11 11l3-1 3 1c5 2 10-4 11-11 1-10-8-13-14-7Z','M20 15c0-6 4-9 9-9m-9 8c-1-4-4-7-7-8'],
  nut:['#866437','#eadbc1','M6 25C8 16 21 6 31 7c5 8-5 23-14 26-5 2-10-1-11-8Z','M12 27c3-5 9-10 15-14m-11 8 1-4m3 2 4 1'],
  oil:['#8b6320','#f8e6ad','M14 4h12v6l4 6v17H10V16l4-6Zm0 6h12','M20 17c-3 4-5 6-4 8 1 3 7 3 8 0 1-2-1-4-4-8Z'],
  spice:['#a35651','#f4dadd','M11 8h18v5H11zm2 5h14l3 5v15H10V18z','M15 22h10m-10 4h8'],
  pot:['#427463','#d3eadc','M5 16h30v6a9 9 0 0 1-9 9H14a9 9 0 0 1-9-9Z','M3 20h2m30 0h2M10 12h20m-10-4v4'],
} as const;
const pictureFor:Record<string,keyof typeof pictures>={'肉类':'meat','鱼虾海鲜':'fish','蛋类':'egg','蔬菜':'veg','蔬菜菌菇':'veg','菌菇':'mushroom',
  '主食':'grain','豆制品':'bean','豆类及豆制品':'bean','奶制品':'milk','水果':'fruit','坚果种子':'nut','食用油':'oil','调味料':'spice',
  '早餐':'egg','汤类':'pot','凉拌菜':'veg','一锅套餐':'pot','加餐':'nut'};
export function CategoryGlyph({category}:{category:string}) {
  const [ink,fill,shape,detail]=pictures[pictureFor[category]??'bean'];
  return <span className="category-glyph" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d={shape} fill={fill} stroke={ink} strokeWidth="1.65" strokeLinejoin="round"/><path d={detail} stroke={ink} strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"/></svg></span>;
}
export function IconButton({icon,label,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{icon:IconName;label:string}) {
  return <button type="button" {...props} className={'icon-button '+(props.className??'')} aria-label={label}><Icon name={icon}/></button>;
}
export function Action({icon,children,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{icon?:IconName}) {
  return <button type="button" {...props} className={'app-action '+(props.className??'')}>{icon&&<Icon name={icon} size={18}/>}<span>{children}</span></button>;
}
export function PageHeader({title,subtitle,children}:{title:string;subtitle?:ReactNode;children?:ReactNode}) {
  return <div className="page-title"><div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>{children}</div>;
}
export function ListRow({title,detail,aside,icon,onClick,label,className=''}:{title:ReactNode;detail?:ReactNode;aside?:ReactNode;icon?:ReactNode;onClick:()=>void;label?:string;className?:string}) {
  return <button type="button" onClick={onClick} className={'list-row '+className} aria-label={label}>
    {icon&&<span className="list-art">{icon}</span>}<span className="list-copy"><strong>{title}</strong>{detail&&<small>{detail}</small>}</span>
    {aside&&<span className="list-aside">{aside}</span>}<span className="list-chevron"><Icon name="arrow" size={16}/></span>
  </button>;
}
export function SearchField({label,value,change,placeholder}:{label:string;value:string;change:(s:string)=>void;placeholder:string}) {
  return <label className="app-search"><Icon name="search" size={19}/><span className="sr-only">{label}</span>
    <input type="search" value={value} onChange={e=>change(e.target.value)} placeholder={placeholder}/></label>;
}
export function Segment<T extends string>({label,items,value,change}:{label:string;items:readonly T[];value:T;change:(v:T)=>void}) {
  return <div className="segmented app-segment" aria-label={label} role="group">{items.map(item=><button type="button" key={item}
    aria-pressed={value===item} onClick={()=>change(item)}>{item}</button>)}</div>;
}
export function Progress({value,max,label}:{value:number;max:number;label:string}) {
  return max>0?<progress value={Math.min(max,Math.max(0,value))} max={max} aria-label={label}/>:null;
}
export function StatusLabel({children,tone='neutral'}:{children:ReactNode;tone?:'neutral'|'positive'|'warning'|'danger'}) {
  return <span className={'status-pill status-'+tone}>{tone==='positive'&&<Icon name="check" size={14}/>} {children}</span>;
}
export function Skeleton({label}:{label:string}) {
  return <div className="skeleton card" role="status"><span>{label}</span><i/><i/><i/></div>;
}
const liveLayers=new Set<string>();
export const knownLayer=(token:string)=>liveLayers.has(token);
export function Sheet({title,children,close,kind='sheet',subtitle,onBack}:{title:string;children:ReactNode;close:()=>void;kind?:'sheet'|'detail'|'dialog';subtitle?:string;onBack?:()=>void}) {
  const panel=useRef<HTMLDialogElement>(null), dragging=useRef(false);
  const id=useId(), dismiss=useRef(close);dismiss.current=close;
  const layer=useRef<string|undefined>(undefined);
  const active=useRef(false);
  useEffect(()=>{
    const element=panel.current!;
    const previous=document.activeElement as HTMLElement|null;
    active.current=true;
    if(!layer.current)layer.current=crypto.randomUUID();
    const key=layer.current;
    liveLayers.add(key);
    if(window.history.state?.ttjLayer!==key)window.history.pushState({...window.history.state,ttjLayer:key},'');
    element.showModal();
    window.dispatchEvent(new Event('ttj-layer-change'));
    const back=()=>{if(window.history.state?.ttjLayer!==key&&element.open&&[...document.querySelectorAll('dialog[open]')].at(-1)===element)dismiss.current();};
    window.addEventListener('popstate',back);
    return ()=>{
      active.current=false;
      liveLayers.delete(key);
      window.removeEventListener('popstate',back);
      element.close();
      window.dispatchEvent(new Event('ttj-layer-change'));
      if(previous?.isConnected)previous.focus({preventScroll:true});
      queueMicrotask(()=>{if(!active.current&&window.history.state?.ttjLayer===key)window.history.back();});
    };
  },[]);
  const exit=()=>dismiss.current();
  return createPortal(<dialog ref={panel} className={'app-sheet '+kind} aria-labelledby={id} onCancel={e=>{e.preventDefault();exit();}}
    onKeyDown={e=>{
      if(e.key!=='Tab')return;
      const controls=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],summary,[tabindex]'))
        .filter(control=>control.tabIndex>=0&&!control.matches(':disabled')&&control.getClientRects().length>0);
      const edge=e.shiftKey?controls[0]:controls.at(-1);
      const next=e.shiftKey?controls.at(-1):controls[0];
      if(next&&(document.activeElement===edge||!controls.includes(document.activeElement as HTMLElement))){
        e.preventDefault();next.focus();
      }
    }} onPointerDown={e=>{dragging.current=e.target===e.currentTarget;}}
    onClick={e=>{if(dragging.current&&e.target===e.currentTarget)exit();dragging.current=false;}}>
    <div className="sheet-inner">
      <header className="sheet-head">{onBack&&<IconButton icon="back" label="返回" onClick={onBack}/>}<div><h2 id={id}>{title}</h2>
        {subtitle&&<p className="meta">{subtitle}</p>}</div><IconButton icon="close" label="关闭" onClick={exit}/></header>
      <div className="sheet-body">{children}</div>
    </div>
  </dialog>,document.body);
}

const views=new Map<string,unknown>();
export const resetRememberedViews=()=>views.clear();
export function useRemembered<T>(key:string,initial:T) {
  const [value,setValue]=useState<T>(()=>views.has(key)?views.get(key) as T:initial);
  useEffect(()=>{views.set(key,value);},[key,value]);
  return [value,setValue] as const;
}


export function useCatalogBack(name:string,reset:()=>void) {
  const callback=useRef(reset);callback.current=reset;
  const entered=useRef(false);
  useEffect(()=>{
    entered.current=window.history.state?.ttjBrowse===name;
    const back=()=>{
      if(entered.current&&window.history.state?.ttjBrowse!==name) {
        entered.current=false;callback.current();
      }
    };
    window.addEventListener('popstate',back);
    return ()=>window.removeEventListener('popstate',back);
  },[name]);
  return {
    enter:()=>{if(window.history.state?.ttjBrowse!==name){
      window.history.pushState({...window.history.state,ttjBrowse:name},'');entered.current=true;
    }},
    back:()=>{if(entered.current&&window.history.state?.ttjBrowse===name)window.history.back();else callback.current();},
  };
}
