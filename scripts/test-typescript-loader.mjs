// Node-only test support. Never imported by the production frontend.
import {registerHooks} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {existsSync,readFileSync} from 'node:fs';
import ts from 'typescript';
registerHooks({
 resolve(specifier,context,next){
  if(specifier.startsWith('@/')||specifier.startsWith('.')){
   const base=specifier.startsWith('@/')?new URL('../'+specifier.slice(2),import.meta.url):new URL(specifier,context.parentURL);
   for(const suffix of ['','.ts','.tsx'])if(/\.tsx?$/.test(base.pathname+suffix)&&existsSync(fileURLToPath(base)+suffix))return{url:pathToFileURL(fileURLToPath(base)+suffix).href,shortCircuit:true};
  }
  return next(specifier,context);
 },
 load(url,context,next){
  if(/\.tsx?$/.test(url))return{format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText};
  return next(url,context);
 }
});
