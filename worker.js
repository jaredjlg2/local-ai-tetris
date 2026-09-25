import { parentPort } from 'node:worker_threads';
import { Laya } from '@receptron/laya';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { decisionRequest } from './decision.js';
const cacheDir=fileURLToPath(new URL('./models',import.meta.url));
const modelDir=cacheDir+'/receptron--laya-onnx/main';
let last=0;
try {
  const complete=['laya.onnx','laya.onnx.data','laya_config.json','tokenizer/tokenizer.json','tokenizer/tokenizer_config.json'].every(f=>existsSync(modelDir+'/'+f));
  const runtime=JSON.parse(await readFile(new URL('./runtime-config.json',import.meta.url),'utf8'));
  const gpu=runtime.executionProviders.includes('webgpu');
  let backend=gpu?'Laya · GPU + CPU · FP32 · local':'Laya · CPU · FP32 · local';
  let device=gpu?'GPU + CPU':'LOCAL CPU',fallbackReason;
  const loadOptions={...(complete?{modelDir}:{cacheDir}),onProgress:({file,received,total})=>{
    if(Date.now()-last>1000){last=Date.now();parentPort.postMessage({type:'status',status:{state:'loading',message:`Downloading ${file}: ${Math.round(received/1048576)} / ${Math.round(total/1048576)} MB`}});}
  }};
  const warm=async model=>{
    // Compile and warm typical game inputs, rather than a tiny unrelated prompt.
    for(const count of [2,3,6]){
      const candidates=Array.from({length:count},(_,i)=>({key:String.fromCharCode(65+i),lines:0,holes:i%2,height:2+i,aggregate:4+i,bumpiness:2+i}));
      const {state,questions}=decisionRequest(candidates,'T');
      await model.systemOne(state,questions);
    }
  };
  let model;
  try{
    model=await Laya.load({...loadOptions,executionProviders:runtime.executionProviders,sessionOptions:runtime.sessionOptions});
    await warm(model);
  }catch(e){
    if(!gpu)throw e;
    fallbackReason=e.message;console.warn('GPU initialization failed; using full-precision CPU:',e.message);
    if(model)await model.close();
    model=await Laya.load({...loadOptions,executionProviders:['cpu'],sessionOptions:{intraOpNumThreads:0}});
    await warm(model);device='LOCAL CPU';backend='Laya · CPU fallback · FP32 · local';
  }
  parentPort.postMessage({type:'status',status:{state:'ready',message:fallbackReason?'Laya ready · CPU fallback':gpu?'Local Laya ready · GPU accelerated':'Local Laya is ready',modelDir,backend,device,precision:'FP32',fallbackReason}});
  parentPort.on('message',async({candidates,piece})=>{
    try {
      const {state,questions}=decisionRequest(candidates,piece);
      const result=await model.systemOne(state,questions);
      result.backend=backend;
      if(candidates.length===1){result.rawAnswer=structuredClone(result.answers.move);const a=result.answers.move;a.choice=candidates[0].key;a.probabilities={[candidates[0].key]:1};a.confidence=1;result.constrained=true;}
      parentPort.postMessage({result});
    }catch(e){parentPort.postMessage({error:e.message});}
  });
}catch(e){parentPort.postMessage({type:'status',status:{state:'error',message:e.message}});}
