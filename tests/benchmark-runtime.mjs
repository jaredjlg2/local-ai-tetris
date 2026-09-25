import {Laya} from '@receptron/laya';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {decisionRequest} from '../decision.js';
import {Game,shortlist} from '../public/engine.js';
const name=process.argv[2]||'cpu4';
const configs={cpu4:{executionProviders:['cpu'],sessionOptions:{intraOpNumThreads:4}},cpu8:{executionProviders:['cpu'],sessionOptions:{intraOpNumThreads:8}},cpu2:{executionProviders:['cpu'],sessionOptions:{intraOpNumThreads:2}},auto:{executionProviders:['cpu'],sessionOptions:{intraOpNumThreads:0}},dml:{executionProviders:['dml','cpu'],sessionOptions:{intraOpNumThreads:4,enableMemPattern:false,executionMode:'sequential'}}};
configs.webgpu={executionProviders:['webgpu','cpu'],sessionOptions:{intraOpNumThreads:4}};
configs.webgpu1={executionProviders:['webgpu','cpu'],sessionOptions:{intraOpNumThreads:1}};
const config=configs[name];if(!config)throw new Error('Unknown runtime '+name);
await mkdir('test-results/performance',{recursive:true});
let fixtures;
const extended=!!process.env.BENCH_EXTENDED;
const fixturePath=`test-results/performance/${extended?'verification-':''}fixtures.json`;
try{fixtures=JSON.parse(await readFile(fixturePath,'utf8'));}
catch{
  let seed=723;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const generated=[];
  for(const garbage of [0,3,7]){
    const game=new Game({garbage,random});
    for(let i=0;i<(extended?48:24)&&!game.over;i++){
      const candidates=shortlist(game.board,game.active).map((c,i)=>({...c,key:String.fromCharCode(65+i)}));
      generated.push({piece:game.active.type,candidates});
      for(const action of candidates[extended?Math.floor(random()*candidates.length):0].path){if(action==='drop')game.drop();else game.move(action);}
    }
  }
  fixtures=[];
  for(let n=1;n<=6;n++)fixtures.push(...generated.filter(f=>f.candidates.length===n).slice(0,extended?8:2));
  for(const f of generated)if(fixtures.length<(extended?48:12)&&!fixtures.includes(f))fixtures.push(f);
  await writeFile(fixturePath,JSON.stringify(fixtures,null,2));
}
const limit=Number(process.env.BENCH_CASES||fixtures.length), rounds=Number(process.env.BENCH_ROUNDS||1);
fixtures=fixtures.slice(0,limit);
const suffix=process.env.BENCH_SUFFIX||'';
const path=`test-results/performance/${name}${suffix}.json`;
console.log(`Loading ${name}; ${fixtures.length} positions × ${rounds} rounds`);
let model;
try{
  model=await Laya.load({modelDir:fileURLToPath(new URL('../models/receptron--laya-onnx/main',import.meta.url)),...config});
  if(process.env.BENCH_METADATA)console.log(model.session.inputMetadata);
  const request=f=>{const {state,questions}=decisionRequest(f.candidates,f.piece);return model.systemOne(state,questions);};
  for(let i=0;i<2;i++)await request(fixtures[i%fixtures.length]);
  const measurements=[];
  for(let r=0;r<rounds;r++)for(let i=0;i<fixtures.length;i++){
    const started=performance.now(),result=await request(fixtures[i]);
    measurements.push({fixture:i,round:r,ms:performance.now()-started,tokens:result.usage.input_tokens,answer:result.answers.move});
  }
  const sorted=measurements.map(m=>m.ms).sort((a,b)=>a-b);
  const report={name,config,precision:'original FP32',cases:fixtures.length,rounds,meanMs:sorted.reduce((a,b)=>a+b,0)/sorted.length,medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))],measurements};
  await writeFile(path,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,measurements:undefined}));
}catch(e){await writeFile(path,JSON.stringify({name,error:e.message},null,2));console.error(e.message);process.exitCode=1;}
finally{if(model)await model.close();}
