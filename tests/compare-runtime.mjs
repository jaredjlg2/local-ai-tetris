import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const baselineName=process.argv[2]||'cpu4-validation';
const candidateName=process.argv[3]||'webgpu-validation';
const read=async name=>JSON.parse(await readFile(`test-results/performance/${name}.json`,'utf8'));
const baseline=await read(baselineName),candidate=await read(candidateName);
assert.equal(baseline.measurements.length,candidate.measurements.length);
let changedChoices=0,maxProbabilityDelta=0;
for(let i=0;i<baseline.measurements.length;i++){
  const a=baseline.measurements[i],b=candidate.measurements[i];
  assert.equal(a.fixture,b.fixture);assert.equal(a.round,b.round);assert.equal(a.tokens,b.tokens);
  if(a.answer.choice!==b.answer.choice)changedChoices++;
  assert.deepEqual(Object.keys(a.answer.probabilities),Object.keys(b.answer.probabilities));
  for(const key in a.answer.probabilities)maxProbabilityDelta=Math.max(maxProbabilityDelta,Math.abs(a.answer.probabilities[key]-b.answer.probabilities[key]));
}
const report={baseline:baselineName,candidate:candidateName,positions:baseline.cases,comparisons:baseline.measurements.length,changedChoices,maxProbabilityDelta,baselineMeanMs:baseline.meanMs,candidateMeanMs:candidate.meanMs,latencyReductionPercent:(1-candidate.meanMs/baseline.meanMs)*100,precision:'Original FP32 weights; identical model inputs'};
await writeFile('test-results/performance/comparison.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
assert.equal(changedChoices,0,'Candidate runtime changed a sampled decision');
assert.ok(maxProbabilityDelta<=.001,'Probability drift exceeds validation tolerance');
