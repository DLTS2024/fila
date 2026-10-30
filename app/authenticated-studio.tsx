import {useEffect,useState} from 'react';
import {studioApi,type Session} from '@/lib/api';
import Studio from './page';

export default function AuthenticatedStudio(){
 const [session,setSession]=useState<Session|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const restore=async()=>{setLoading(true);setError('');try{setSession(await studioApi.session())}catch(e){setError((e as Error).message)}finally{setLoading(false)}};
 useEffect(()=>{void restore();const expired=()=>{setSession(null);void restore()};window.addEventListener('dloop:session-expired',expired);return()=>window.removeEventListener('dloop:session-expired',expired)},[]);
 const logout=async()=>{setBusy(true);try{setSession(await studioApi.logout());setPassword('');setError('')}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 if(session?.authenticated)return <>{error&&<div role="alert" className="error">{error}</div>}<Studio user={session.user?.email} onLogout={logout} sessionBusy={busy}/></>;
 return <main className="loginShell"><section className="panel help"><div className="eyebrow">D LOOP 3D / FILAMENT STUDIO</div><h1>Your studio, in the loop.</h1>{loading?<p role="status">Restoring your session…</p>:<><p>Sign in to manage your physical filament inventory.</p>{error&&<p role="alert" className="error">{error}</p>}<form onSubmit={async e=>{e.preventDefault();if(!session||busy)return;setBusy(true);setError('');try{setSession(await studioApi.login(email,password));setPassword('')}catch(err){setError((err as Error).message)}finally{setBusy(false)}}}><label>Email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy||!session}>{busy?'Signing in…':'Sign in'}</button>{!session&&<button type="button" className="secondary" onClick={restore}>Retry API connection</button>}</form><p className="hint">First administrator setup is available only through the private CLI. There is no public registration form.</p></>}</section></main>;
}
