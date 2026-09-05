import test from 'node:test';
import assert from 'node:assert/strict';
import { loadToolbox } from './load-toolbox.mjs';
const {UI}=loadToolbox({files:['src/core/namespace.js','src/ui/window.js']});

test('saved or corrupt window positions stay reachable after viewport changes',()=>{
  for(const [width,height] of [[1440,1000],[320,568],[240,320]])for(const rect of [{},{left:-500,top:99999,width:9000,height:9000},{left:NaN,top:Infinity,width:-1,height:null}]) {
    const fitted=UI.fitWindow(rect,width,height);
    assert.ok(Object.values(fitted).every(Number.isFinite));
    assert.ok(fitted.left>=8&&fitted.top>=8);
    assert.ok(fitted.left+fitted.width<=width-8);
    assert.ok(fitted.top+fitted.height<=height-8);
  }
});
