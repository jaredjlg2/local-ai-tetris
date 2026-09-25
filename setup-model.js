import { Laya } from '@receptron/laya';
import { fileURLToPath } from 'node:url';
let last = 0;
const model = await Laya.load({
  cacheDir: fileURLToPath(new URL('./models', import.meta.url)),
  executionProviders: ['cpu'], sessionOptions: { intraOpNumThreads: 4 },
  onProgress: ({file, received, total}) => {
    if (Date.now() - last > 2000 || received === total) {
      console.log(`${file}: ${(received / 1048576).toFixed(0)} / ${(total / 1048576).toFixed(0)} MB`); last = Date.now();
    }
  }
});
const start = performance.now();
console.log(JSON.stringify(await model.systemOne('Tetris: A clears one line without holes; B adds three holes.', {move:{type:'choice', instructions:'Choose the safer Tetris placement.', criteria:{A:'Clear a line, no holes',B:'Add three holes'}}}), null, 2));
console.log(`Inference: ${Math.round(performance.now()-start)} ms`);
await model.close();
