// Shared by the live worker and benchmarks; keep the model's input identical.
export function decisionRequest(candidates,piece) {
  const state=`Tetris. Current piece ${piece}. Choose a placement to survive and clear lines. Avoid holes first, then prefer line clears and a low, smooth stack. Holes are empty cells underneath blocks. Each option is a legal simulated landing. Outcomes:\n`+candidates.map(c=>`${c.key}: clears ${c.lines} lines, ${c.holes} total holes, maximum height ${c.height}, total height ${c.aggregate}, unevenness ${c.bumpiness}.`).join('\n');
  const criteria=Object.fromEntries(candidates.map(c=>[c.key,`Landing ${c.key}`]));
  if(candidates.length===1)criteria.EQUIVALENT=`The same landing as ${candidates[0].key}`;
  return {state,questions:{move:{type:'choice',instructions:'Which landing is best for long-term Tetris survival? Minimize holes, clear lines, and keep the stack low.',criteria}}};
}
