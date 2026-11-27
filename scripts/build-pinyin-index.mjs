import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {pinyin} from 'pinyin-pro';

const folder=new URL('../src/',import.meta.url);
const files=readdirSync(folder).filter(name=>/\.(tsx?|json)$/.test(name)&&name!=='pinyin-index.json');
const phrases=new Set();
for(const file of files) {
  const content=readFileSync(new URL(file,folder),'utf8');
  for(const match of content.matchAll(/[\p{Script=Han}]+/gu)) {
    const value=match[0];
    for(const char of value)phrases.add(char);
    if(value.length>=2&&value.length<=12)phrases.add(value);
  }
}
// 仅存储需要上下文才能读对的短语，其余按字索引。
const transliterate=value=>pinyin(value,{toneType:'none',type:'array',v:true}).join(' ');
const syllables=new Map([...phrases].filter(p=>p.length===1).map(p=>[p,transliterate(p)]));
for(const phrase of phrases) {
  if(phrase.length===1)continue;
  const value=transliterate(phrase);
  if([...phrase].map(c=>syllables.get(c)).join(' ')!==value)syllables.set(phrase,value);
}
writeFileSync(new URL('pinyin-index.json',folder),JSON.stringify(Object.fromEntries([...syllables].sort()))+'\n');
