import http from 'node:http';
import { readFile } from 'node:fs/promises';
import {models,closeModels} from './local-models.js';
import { shortlist, valid, SHAPES } from './public/engine.js';

const port=Number(process.env.PORT||8776);
const json=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
function validate(data) {
  const {board,active}=data;
  if(data.nextPiece!==undefined&&!Object.hasOwn(SHAPES,data.nextPiece))throw new Error('Invalid next piece');
  if(!Array.isArray(board)||board.length!==20||board.some(row=>!Array.isArray(row)||row.length!==10||row.some(v=>v!==0&&!Object.hasOwn(SHAPES,v)&&v!=='G')))throw new Error('Invalid board');
  if(!active||!Object.hasOwn(SHAPES,active.type)||!['x','y','r'].every(k=>Number.isInteger(active[k]))||active.r<0||active.r>3||!valid(board,active))throw new Error('Invalid active piece');
}
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,`http://127.0.0.1:${port}`);
    if(req.method==='GET'&&url.pathname==='/api/status'){
      const id=url.searchParams.get('model')||'laya';if(!Object.hasOwn(models,id))return json(res,400,{error:'Unknown model'});
      return json(res,200,{...models[id].status,engineId:id,busy:models[id].busy});
    }
    if(req.method==='POST'&&url.pathname==='/api/decide') {
      if(req.headers.origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin))return json(res,403,{error:'Local game requests only'});
      let body='';for await(const chunk of req){body+=chunk;if(body.length>16000)return json(res,413,{error:'Request too large'});}
      let data;try{data=JSON.parse(body);validate(data);}catch(e){return json(res,400,{error:e.message});}
      const id=data.model??'laya';if(!Object.hasOwn(models,id))return json(res,400,{error:'Unknown model'});
      const model=models[id];
      if(model.status.state!=='ready')return json(res,503,{error:model.status.message});
      if(model.busy)return json(res,429,{error:'The selected model is already deciding. Please wait.'});
      const candidates=shortlist(data.board,data.active,data.nextPiece).map((p,i)=>({...p,key:String.fromCharCode(65+i)}));
      if(!candidates.length)return json(res,422,{error:'No reachable landing'});
      const started=performance.now();
      const result=await model.decide(candidates,data.active.type);
      const selected=candidates.find(p=>p.key===result.answers.move.choice);
      if(!selected)throw new Error('The selected model returned an invalid move');
      return json(res,200,{engineId:id,selected,candidates,answer:result.answers.move,rawAnswer:result.rawAnswer??result.answers.move,usage:result.usage,model:result.model,backend:result.backend,constrained:!!result.constrained,latencyMs:Math.round(performance.now()-started)});
    }
    if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
    const files={'/':'index.html','/style.css':'style.css','/app.js':'app.js','/engine.js':'engine.js','/planner.js':'planner.js','/versus':'versus.html','/versus.js':'versus.js','/versus.css':'versus.css','/match.js':'match.js'};
    files['/model-ui.js']='model-ui.js';
    const file=files[url.pathname];if(!file)return json(res,404,{error:'Not found'});
    const data=await readFile(new URL('./public/'+file,import.meta.url));
    res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(data);
  }catch(e){json(res,500,{error:e.message});}
});
server.listen(port,'127.0.0.1',()=>console.log(`Laya Tetris: http://127.0.0.1:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{closeModels();server.close();});
