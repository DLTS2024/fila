import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const privateFile=new URL('.scale-secrets.h',root);
if(!existsSync(privateFile)){
 let config=readFileSync(new URL('public/scale/scale_secrets.example.h',root),'utf8');
 const match=readFileSync(new URL('.dev.vars',root),'utf8').match(/^\s*SCALE_DEVICE_TOKEN\s*=\s*(.+?)\s*$/m);
 if(!match)throw Error('Missing local device token');
 const token=match[1].replace(/^(["'])(.*)\1$/,'$2');
 if(token.length<24)throw Error('Invalid local device token');
 config=config.replace('"REPLACE_LOCALLY_FROM_DEV_VARS"',JSON.stringify(token));
 writeFileSync(privateFile,config,{flag:'wx'});
 console.log('Created ignored .scale-secrets.h; configure Wi-Fi credentials locally.');
}
const dir=new URL('work/firmware/esp8266_wifi_sync/',root);
mkdirSync(dir,{recursive:true});
copyFileSync(new URL('public/scale/esp8266_wifi_sync.ino',root),new URL('esp8266_wifi_sync.ino',dir));
copyFileSync(privateFile,new URL('scale_secrets.h',dir));
console.log('Private sketch staged at '+fileURLToPath(dir));
