import translations from './pinyin-index.json';
const pronunciation:Record<string,string>=translations;
const cache=new Map<string,string>();
const tidy=(value:string)=>value.toLowerCase().normalize('NFKC').replace(/[’'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/g,c=>
  c.normalize('NFD').includes('\u0308')?'v':c.normalize('NFD')[0]);
export function searchMatches(fields:string[],query:string) {
  const words=tidy(query).trim().split(/\s+/).filter(Boolean);
  if(!words.length)return true;
  return words.every(word=>fields.some(field=>{
    const literal=tidy(field);
    if(literal.includes(word))return true;
    if(!/^[a-z]+$/.test(word))return false;
    let index=cache.get(field);
    if(index===undefined){
      const syllables=field
        .replace(/[\p{Script=Han}]+/gu,part=>' '+(pronunciation[part]??[...part].map(x=>pronunciation[x]??x).join(' '))+' ')
        .trim().toLowerCase().split(/\s+/);
      index=syllables.join('')+' '+syllables.map(s=>s[0]).join('');
      cache.set(field,index);
    }
    return index.includes(word);
  }));
}
