import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

async function files(dir='') {
  const entries=await readdir(path.join('dist',dir),{withFileTypes:true});
  const paths=await Promise.all(entries.map(entry=>entry.isDirectory()
    ? files(path.posix.join(dir,entry.name)) : path.posix.join(dir,entry.name)));
  return paths.flat().filter(p=>p!=='sw.js').sort();
}
const names=await files();
const hash=createHash('sha256');
for(const name of names) hash.update(name).update(await readFile('dist/'+name));
const prefix='tiantianjian:'+ 'SCOPE' + ':';
const code=`const base = self.registration.scope;
const prefix = ${JSON.stringify(prefix)}.replace('SCOPE',base);
const key = prefix + '${hash.digest('hex').slice(0,12)}';
const assets = ${JSON.stringify(names)}.map(p=>new URL(p,base).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(key).then(cache => cache.addAll(assets.map(url=>new Request(url,{cache:'reload'})))));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(n=>n.startsWith(prefix)&&n!==key).map(n=>caches.delete(n)))).then(()=>self.clients.claim()));
});
self.addEventListener('message', event => {if(event.data==='UPDATE') void self.skipWaiting();});
self.addEventListener('fetch', event => {
  const request=event.request;
  if (request.method!=='GET'||!request.url.startsWith(base)) return;
  const index=new URL('index.html',base).href;
  if(request.mode==='navigate') {
    event.respondWith(caches.open(key).then(cache=>cache.match(index)).then(cached=>cached||fetch(request)));
  } else if (assets.includes(request.url)) {
    event.respondWith(caches.open(key).then(cache=>cache.match(request)).then(cached=>cached||fetch(request)));
  }
});`;
await writeFile('dist/sw.js',code+'\n');
