import type {InventoryState} from '@/lib/inventory';
export default function InventorySummary({state,onSelect}:{state:InventoryState;onSelect:(id:string)=>void}){
 const active=state.spools.filter(p=>p.status!=='archived');
 const low=active.filter(p=>p.remaining<200);
 return <section className="panel help"><h2>Inventory breakdown</h2><div className="breakdownGrid">{(['material','brand','colorName'] as const).map(field=>{const groups=new Map<string,{count:number;cents:number}>();for(const p of active){const key=p[field]||'Unspecified';const g=groups.get(key)||{count:0,cents:0};g.count++;g.cents+=Math.round(p.remaining*100);groups.set(key,g)}return <div key={field}><h3>By {field==='colorName'?'colour':field}</h3>{[...groups].map(([name,g])=><p key={name}><strong>{name}</strong> · {g.count} spools · {(g.cents/100).toFixed(2)} g</p>)}{!groups.size&&<p>No spools yet.</p>}</div>})}</div><h3>Low-stock & empty spool alerts</h3>{low.map(p=><button className="secondary" key={p.id} onClick={()=>onSelect(p.id)}>{p.code||p.name} · {p.remaining===0?'Empty':`${p.remaining.toFixed(2)} g remaining`}</button>)}{!low.length&&<p>No low-stock or empty spools.</p>}</section>;
}
