import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../../app.js',import.meta.url),'utf8');
const start=source.indexOf('class PresentationAssetManager {');
const end=source.indexOf('\nfunction createRemoteCallsignSprite',start);
const Manager=vm.runInNewContext(source.slice(start,end)+'\nPresentationAssetManager;',{ABSTRACT_ONLY_PRESENTATION_IDS:new Set()});

test('target identity changes retain model and in-flight asset request',()=>{
 const manager=Object.create(Manager.prototype);let builds=0;
 manager.showCompatibility=()=>builds++;
 const object={},slot={name:'target',presentationId:'su27',entityId:'one',object,epoch:4,pendingKey:'loading',failedKey:''};
 manager.setPresentation(slot,'su27','two');
 assert.equal(slot.entityId,'two');assert.equal(slot.object,object);assert.equal(slot.epoch,4);
 assert.equal(slot.pendingKey,'loading');assert.equal(builds,0);
 manager.setPresentation(slot,'f16','three');
 assert.equal(builds,1);assert.equal(slot.epoch,5);assert.equal(slot.pendingKey,'');assert.equal(slot.presentationId,'f16');
});

test('compatibility cache retains independent models per slot across entity changes',()=>{
 const manager=Object.create(Manager.prototype);let builds=0;
 manager.compatibilityFactory=()=>()=>({serial:++builds});
 manager.swap=(slot,object,metadata)=>{slot.object=object;slot.activeKey=metadata.key;};
 const target={name:'target',presentationId:'su27',entityId:'one'};
 const wingman={name:'wingman',presentationId:'su27',entityId:'two'};
 manager.showCompatibility(target);manager.showCompatibility(wingman);
 assert.notEqual(target.object,wingman.object);assert.equal(builds,2);
 target.entityId='promoted';manager.showCompatibility(target);assert.equal(builds,2);
 target.presentationId='f16';manager.showCompatibility(target);assert.equal(builds,3);
});


test('registry instance survives target promotion but changes for a new presentation',async()=>{
 const manager=Object.create(Manager.prototype);let allocations=0;
 manager.activePack={id:'pack',profile:{id:'profile'}};
 manager.activePackKey=manager.requestedPackKey='pack-key';
 manager.projectedPixels=()=>30;manager.lodSelectionPixels=x=>x;
 manager.runtime={registry:{getAssetDescriptor:()=>({id:'model',kind:'procedural'}),instantiate:async()=>({scene:{serial:++allocations}})}};
 manager.swap=(slot,object,meta)=>{slot.object=object;slot.instance=meta.instance;slot.activeKey=meta.key;slot.pendingKey='';};
 manager.showCompatibility=()=>{};
 const slot={name:'target',presentationId:'su27',entityId:'first',root:{visible:true},epoch:0};
 manager.resolveSlot(slot);await Promise.resolve();const first=slot.object;
 manager.setPresentation(slot,'su27','replacement');manager.resolveSlot(slot);await Promise.resolve();
 assert.equal(allocations,1);assert.equal(slot.object,first);
 manager.setPresentation(slot,'f16','different-type');manager.resolveSlot(slot);await Promise.resolve();
 assert.equal(allocations,2);assert.notEqual(slot.object,first);
});
