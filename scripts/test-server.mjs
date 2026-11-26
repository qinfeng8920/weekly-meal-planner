import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile,stat} from 'node:fs/promises';
import {extname,resolve} from 'node:path';

const root=resolve('dist');
const base='/weekly-meal-planner/';
let update=0;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css',
  '.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'};
createServer(async (req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if (!url.pathname.startsWith(base)) {res.writeHead(404).end();return;}
    if(url.pathname===base+'__test_update'&&req.method==='POST') {
      update++;res.writeHead(204).end();return;
    }
    const file=resolve(root,decodeURIComponent(url.pathname.slice(base.length))||'index.html');
    if (!file.startsWith(root+'/')||!(await stat(file)).isFile()) {res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream','Cache-Control':'no-cache'});
    if(url.pathname===base+'sw.js'&&update) {
      const code=await readFile(file,'utf8');
      res.end(code.replace("const key = prefix + '","const key = prefix + 'test-"+update+"-"));
    } else createReadStream(file).pipe(res);
  } catch {res.writeHead(404).end();}
}).listen(4173,'127.0.0.1');
