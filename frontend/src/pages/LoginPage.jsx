import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth-context.jsx';
import { ErrorNotice } from '../components/Shared.jsx';

function roleHome(user) { return user.role === 'ADMIN' ? '/admin' : user.role === 'DEPARTMENT' ? '/department' : '/dashboard'; }
export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { setUser, setNotice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const submit = async (event) => {
    event.preventDefault(); setError(''); setBusy(true);
    try { const result = await api('/auth/login', { method: 'POST', body: form }); setUser(result.user); setNotice('Welcome back. You are signed in.'); navigate(location.state?.from || roleHome(result.user), { replace: true }); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <main className="auth-page"><div className="auth-decoration"><div className="auth-decoration-circle circle-a"/><div className="auth-decoration-circle circle-b"/><div className="auth-side-content"><span className="eyebrow eyebrow-light">CIVICCONNECT</span><h2>Every voice can<br/><em>make a difference.</em></h2><p>Stay connected to the issues that shape your neighbourhood. Report, track, and see progress with clarity.</p><div className="auth-side-stat"><div className="side-stat-icon"><LockKeyhole size={19}/></div><span><strong>Your reports, your timeline.</strong><small>A secure place to follow every update.</small></span></div></div></div><div className="auth-form-wrap"><form className="auth-form" onSubmit={submit}><div className="eyebrow">WELCOME BACK</div><h1>Sign in to CivicConnect</h1><p className="form-subtitle">Use your registered account to continue.</p><ErrorNotice message={error}/><label className="field-label">Email address</label><div className="input-with-icon"><Mail size={17}/><input type="email" autoComplete="email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} placeholder="you@example.com" required maxLength={254}/></div><div className="password-label-row"><label className="field-label">Password</label><Link to="/forgot-password" className="small-link">Forgot password?</Link></div><div className="input-with-icon"><LockKeyhole size={17}/><input type={showPassword?'text':'password'} autoComplete="current-password" value={form.password} onChange={(e)=>setForm({...form,password:e.target.value})} placeholder="Enter your password" required maxLength={128}/><button className="input-action" type="button" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword?'Hide password':'Show password'}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div><button className="btn btn-primary btn-full btn-lg auth-submit" disabled={busy}>{busy?'Signing in…':'Sign in'} <ArrowRight size={17}/></button><div className="auth-switch">New to CivicConnect? <Link to="/register">Create an account</Link></div><div className="auth-security"><LockKeyhole size={15}/> Protected sign-in · Secure session cookies</div></form></div></main>;
}
