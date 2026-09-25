export const modelName=id=>id==='von'?'Von':'Laya';
export function initialModel(){try{return localStorage.getItem('tetris-model')==='von'?'von':'laya';}catch{return 'laya';}}
export function paintModel(id){
  try{localStorage.setItem('tetris-model',id);}catch{}
  const name=modelName(id);
  document.querySelectorAll('[data-model-name]').forEach(el=>el.textContent=name);
  document.querySelectorAll('[data-model-upper]').forEach(el=>el.textContent=name.toUpperCase());
  document.getElementById('model-choice').value=id;
  document.getElementById('ai-board')?.setAttribute('aria-label',`${name} game grid`);
}
