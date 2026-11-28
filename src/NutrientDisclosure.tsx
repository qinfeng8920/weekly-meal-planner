import {lazy,Suspense,useState,type ComponentProps} from 'react';
import {Skeleton} from './design';

const NutrientFacts=lazy(()=>import('./NutrientFacts').then(module=>({default:module.NutrientFacts})));

export function NutrientDisclosure({label,...props}:{label:string}&ComponentProps<typeof NutrientFacts>){
  const [open,setOpen]=useState(false);
  return <details className="item-fold" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>{label}</summary>
    {open&&<Suspense fallback={<Skeleton label="正在读取营养成分…"/>}><NutrientFacts {...props}/></Suspense>}
  </details>;
}
