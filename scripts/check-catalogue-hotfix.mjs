import {spawnSync} from 'node:child_process';
// Component tests in jsdom, not a real-browser or visual-layout test.
import { JSDOM } from 'jsdom';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {url: 'http://localhost:5173'});
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Node']) {
  Object.defineProperty(globalThis, name, {value: dom.window[name], configurable: true});
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const base = specifier.startsWith('@/') ? new URL('../' + specifier.slice(2), import.meta.url) : new URL(specifier, context.parentURL);
      for (const suffix of ['', '.ts', '.tsx']) {
        if (/\.tsx?$/.test(base.pathname + suffix) && existsSync(fileURLToPath(base) + suffix)) {
          return {url: pathToFileURL(fileURLToPath(base) + suffix).href, shortCircuit: true};
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (/\.tsx?$/.test(url)) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}}).outputText,
    };
    return nextLoad(url, context);
  },
});
const React=await import('react');
const {render,screen,fireEvent,waitFor,cleanup,act}=await import('@testing-library/react');



const {default:Products}=await import('../components/product-library.tsx');
const {default:Actions}=await import('../components/record-actions.tsx');
const product={id:'fixture',name:'Original',brand:'Numaker',brandId:'1',material:'PLA',colorName:'White',color:'#ffffff',diameter:1.75,temperature:210,bed:60,price:500,profileId:null,active:true,version:1,editToken:'snapshot-token',lifecycleAvailable:false};
const state={managementAvailable:false,spools:[],slots:{},history:[],profiles:[],brands:[{id:'1',name:'Numaker',active:true},{id:'2',name:'Other',active:true}],catalogue:[product]};
let actions=[];render(React.createElement(Products,{state,saving:false,act:async a=>{actions.push(a);return true},onAdd:()=>{}}));
assert(!screen.getByRole('button',{name:'Edit product'}).disabled);assert(screen.getByRole('button',{name:'Archive'}).disabled);
fireEvent.click(screen.getByRole('button',{name:'Edit product'}));
for(const [label,value] of [['name','Edited'],['material','PETG'],['colorName','Blue'],['price','650'],['temperature','240'],['bed','80']])fireEvent.change(screen.getByLabelText(label),{target:{value}});
fireEvent.change(screen.getByLabelText('Product brand'),{target:{value:'2'}});fireEvent.change(screen.getByLabelText('Colour'),{target:{value:'#0000ff'}});
fireEvent.click(screen.getByRole('button',{name:'Save product'}));await waitFor(()=>assert.equal(actions.length,1));
assert.equal(actions[0].filament.editToken,'snapshot-token');assert.equal(actions[0].filament.brandId,'2');assert.equal(actions[0].filament.price,'650');assert.equal(actions[0].filament.material,'PETG');assert.equal(actions[0].filament.color,'#0000ff');cleanup();
globalThis.confirm=()=>true;render(React.createElement(Actions,{entity:'spool',id:'spool',version:3,active:true,saving:false,act:async a=>{actions.push(a);return true}}));fireEvent.click(screen.getByRole('button',{name:'Archive'}));assert.equal(actions[1].operation,'archive');assert.equal(actions[1].confirmed,true);cleanup();
const phpPath=fileURLToPath(new URL('../.tools/php/php.exe',import.meta.url));const backend=spawnSync(process.env.DLOOP_PHP||(existsSync(phpPath)?phpPath:'php'),['-n',fileURLToPath(new URL('../backend/tests/catalogue-hotfix-offline.php',import.meta.url))],{encoding:'utf8'});assert.equal(backend.error,undefined);process.stdout.write(backend.stdout??'');assert.equal(backend.status,0,backend.stderr);
console.log('PASS: legacy-schema product edit UI, frozen edit token, editable details/settings, lifecycle limitation and explicit spool archive. No network/database.');
