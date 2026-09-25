import {Worker} from 'node:worker_threads';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {decisionRequest} from './decision.js';

export const models={};
function attach(id,transport,send,close){
  const name=id==='von'?'Von':'Laya';
  const model=models[id]={status:{state:'loading',message:`Loading local ${name}…`},busy:false,pending:null,close};
  const fail=error=>{
    model.status={state:'error',message:`${name}: ${error.message}`};
    if(model.pending){model.pending.reject(error);model.pending=null;}model.busy=false;
  };
  const receive=m=>{
    if(m.type==='status'){model.status=m.status;return;}
    if(model.pending){const p=model.pending;model.pending=null;model.busy=false;m.error?p.reject(new Error(m.error)):p.resolve(m.result);}
  };
  transport(receive,fail);
  model.decide=async(candidates,piece)=>{
    if(model.busy)throw new Error(`${name} is already deciding`);
    model.busy=true;
    try{
      const result=await new Promise((resolve,reject)=>{model.pending={resolve,reject};send(candidates,piece);});
      if(candidates.length===1&&!result.constrained){result.rawAnswer=structuredClone(result.answers.move);result.answers.move={...result.answers.move,choice:candidates[0].key,probabilities:{[candidates[0].key]:1},confidence:1};result.constrained=true;}
      return result;
    }finally{model.busy=false;model.pending=null;}
  };
}
const laya=new Worker(new URL('./worker.js',import.meta.url));
attach('laya',(receive,fail)=>{laya.on('message',receive);laya.on('error',fail);laya.on('exit',code=>fail(new Error(`Worker exited (${code}). Restart the server.`)));},(candidates,piece)=>laya.postMessage({candidates,piece}),()=>laya.terminate());
const root=fileURLToPath(new URL('.',import.meta.url));
const python=fileURLToPath(new URL(process.platform==='win32'?'./.venv-von/Scripts/python.exe':'./.venv-von/bin/python',import.meta.url));
const von=spawn(python,['-u',fileURLToPath(new URL('./von-service.py',import.meta.url))],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});
attach('von',(receive,fail)=>{
  createInterface({input:von.stdout}).on('line',line=>{try{receive(JSON.parse(line));}catch{console.error('Invalid Von response:',line.slice(0,1500));fail(new Error('Invalid response from local Von'));}});
  von.stderr.on('data',chunk=>process.stderr.write(chunk));von.on('error',fail);von.stdin.on('error',fail);von.on('exit',code=>fail(new Error(`Local process exited (${code}). Restart the server.`)));
},(candidates,piece)=>von.stdin.write(JSON.stringify(decisionRequest(candidates,piece))+'\n'),stopVon);
function stopVon(){
  if(!von.pid)return;
  if(process.platform==='win32')spawn('taskkill',['/PID',String(von.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
  else von.kill();
}
export function closeModels(){for(const model of Object.values(models))model.close();}
process.on('exit',stopVon);
