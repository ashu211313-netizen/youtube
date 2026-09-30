const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const forbidden=['channel'+'Ai','CHANNEL'+'_AI','channel'+'-ai','channel'+'-assistant','AI_'+'NOT_CONFIGURED','チャンネル'+'AI','data-ai-'+'question'];
test('retired assistant has no runtime, markup, style or backend files',()=>{
  for(const name of ['app.js','index.html','style.css']){
    const source=fs.readFileSync(path.join(root,name),'utf8');
    for(const token of forbidden)assert(!source.includes(token),`${name}: ${token}`);
  }
  const backend=path.join(root,'supabase/functions',forbidden[3]);
  assert(!fs.existsSync(backend)||fs.readdirSync(backend).length===0);
});
test('all retained HTML label and ARIA targets resolve',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  for(const match of html.matchAll(/\b(?:for|aria-labelledby|aria-describedby)="([^"]+)"/g))
    for(const id of match[1].split(/\s+/))assert(ids.has(id),id);
});
