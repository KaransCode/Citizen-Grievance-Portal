import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Send } from 'lucide-react';
import { api } from '../api.js';
import { ErrorNotice } from '../components/Shared.jsx';

export default function ForgotPasswordPage(){
 const [email,setEmail]=useState('');const [error,setError]=useState('');const [result,setResult]=useState(null);const [busy,setBusy]=useState(false);
 const submit=async(e)=>{e.preventDefault();setBusy(true);setError('');try{setResult(await api('/auth/forgot-password',{method:'POST',body:{email}}));}catch(err){setError(err.message);}finally{setBusy(false);}};
 return <main className="simple-auth-page"><form className="auth-form card-panel" onSubmit={submit}><div className="auth-icon-circle"><Send size={22}/></div><div className="eyebrow">ACCOUNT RECOVERY</div><h1>Reset your password</h1><p className="form-subtitle">Enter your registered email. If the account exists, we'll provide password reset instructions.</p><ErrorNotice message={error}/>{result ? <div className="success-panel"><strong>{result.message}</strong>{result.devResetUrl && <p className="dev-reset-link">Development only: <Link to={result.devResetUrl.replace(/^http:\/\/localhost:5173/, '')}>Continue to reset password</Link><br/><small>Configure SMTP before deployment. This development link is not returned in production.</small></p>}<Link className="btn btn-primary btn-full" to="/login">Back to sign in</Link></div> : <><label className="field-label">Email address</label><div className="input-with-icon"><Mail size={17}/><input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com"/></div><button className="btn btn-primary btn-full btn-lg auth-submit" disabled={busy}>{busy?'Sending…':'Send reset instructions'} <Send size={16}/></button></>}<Link to="/login" className="back-link"><ArrowLeft size={15}/> Back to sign in</Link></form></main>;
}
