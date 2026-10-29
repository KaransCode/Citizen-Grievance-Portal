import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ClipboardCheck, FilePlus2, MapPinned, MessageSquareText, ShieldCheck, TimerReset, Waves, Zap, Trash2, Construction, Lightbulb, Building2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth-context.jsx';

const categoryIcon = { 'Damaged Roads': Construction, 'Water Supply': Waves, 'Drainage': Waves, 'Garbage Collection': Trash2, 'Streetlight Failure': Lightbulb, 'Sanitation': ShieldCheck, 'Public Infrastructure': Building2 };
const categoryColor = ['mint','amber','sky','rose','lavender','mint','sky','amber'];

export default function HomePage() {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  useEffect(() => { api('/categories').then((result) => setCategories(result.data || [])).catch(() => {}); }, []);
  const dashboard = user?.role === 'ADMIN' ? '/admin' : user?.role === 'DEPARTMENT' ? '/department' : '/dashboard';
  return <main>
    <section className="hero-section">
      <div className="container hero-grid">
        <div className="hero-copy"><div className="eyebrow eyebrow-light"><span className="eyebrow-dot"/> YOUR CITY. YOUR VOICE.</div>
          <h1>Good cities start<br/>with <em>being heard.</em></h1>
          <p className="hero-description">Report civic issues, follow every update, and help your local authorities make your neighbourhood better — one resolved complaint at a time.</p>
          <div className="hero-actions"><Link className="btn btn-white btn-lg" to={user ? (user.role === 'CITIZEN' ? '/complaints/new' : dashboard) : '/register'}><FilePlus2 size={18}/> Report an issue <ArrowRight size={16}/></Link><Link className="hero-secondary-link" to={user ? dashboard : '/login'}>Track a complaint <ArrowRight size={15}/></Link></div>
          <div className="hero-trust"><div className="trust-avatars"><span>R</span><span>M</span><span>A</span><span>+</span></div><div><strong>Your concerns matter.</strong><small>Transparent tracking from report to resolution.</small></div></div>
        </div>
        <div className="hero-visual" aria-label="Illustration representing a connected civic community">
          <div className="visual-grid"/><div className="visual-orbit orbit-one"/><div className="visual-orbit orbit-two"/>
          <div className="city-card city-card-main"><div className="city-card-header"><span className="live-pill"><span/> LIVE STATUS</span><span className="city-menu">•••</span></div><div className="city-stat-row"><div><small>Resolved this month</small><strong>1,248</strong><span className="trend-good"><ArrowRight size={13}/> +12.8%</span></div><div className="city-stat-ring"><span>86%<small>resolved</small></span></div></div><div className="mini-bars"><i style={{height:'26%'}}/><i style={{height:'42%'}}/><i style={{height:'35%'}}/><i style={{height:'56%'}}/><i style={{height:'44%'}}/><i style={{height:'72%'}}/><i style={{height:'60%'}}/><i style={{height:'92%'}}/><i style={{height:'77%'}}/><i style={{height:'100%'}}/><i style={{height:'85%'}}/><i style={{height:'96%'}}/></div><div className="mini-months"><span>JAN</span><span>MAR</span><span>MAY</span><span>JUL</span><span>SEP</span><span>OCT</span></div></div>
          <div className="floating-card floating-card-alert"><span className="floating-icon alert-icon"><Waves size={18}/></span><div><strong>Water supply</strong><small>Assigned to department</small></div><span className="floating-check"><CheckCircle2 size={17}/></span></div>
          <div className="floating-card floating-card-resolved"><span className="floating-icon resolved-icon"><CheckCircle2 size={18}/></span><div><strong>Road repaired</strong><small>Resolved · 2 hours ago</small></div></div>
          <div className="visual-map-pin"><MapPinned size={23}/></div>
        </div>
      </div>
      <div className="hero-wave"/>
    </section>

    <section className="trust-strip"><div className="container trust-strip-inner"><div><ShieldCheck size={20}/><span><strong>Secure by design</strong><small>Your account and reports stay protected</small></span></div><div><ClipboardCheck size={20}/><span><strong>Trackable progress</strong><small>Clear status updates at every step</small></span></div><div><TimerReset size={20}/><span><strong>Accountable response</strong><small>Complaints routed to the right team</small></span></div><div><MessageSquareText size={20}/><span><strong>Stay informed</strong><small>Updates through your dashboard</small></span></div></div></section>

    <section className="section categories-section"><div className="container"><div className="section-title-row"><div><div className="eyebrow">WHAT NEEDS ATTENTION?</div><h2>Every civic concern<br/><span>has a place here.</span></h2></div><p>From a pothole on your daily route to a streetlight that has been out for weeks, make sure the right people know about it.</p></div><div className="category-grid">{(categories.length ? categories : [{name:'Damaged Roads'},{name:'Water Supply'},{name:'Drainage'},{name:'Garbage Collection'},{name:'Streetlight Failure'},{name:'Sanitation'}]).slice(0,6).map((category,index) => { const Icon = categoryIcon[category.name] || Building2; return <Link to={user ? '/complaints/new' : '/register'} className="category-card" key={category.name}><span className={`category-icon ${categoryColor[index % categoryColor.length]}`}><Icon size={22}/></span><span className="category-name">{category.name}</span><span className="category-arrow"><ArrowRight size={16}/></span></Link>; })}</div></div></section>

    <section className="section how-section"><div className="container"><div className="center-heading"><div className="eyebrow">SIMPLE BY DESIGN</div><h2>From concern to <span>change.</span></h2><p>A straightforward process that keeps you informed and the right department accountable.</p></div><div className="steps-grid"><div className="step-card"><span className="step-number">01</span><div className="step-icon"><FilePlus2 size={24}/></div><h3>Tell us what happened</h3><p>Describe the issue, choose a category, and attach a photo to show what's going on.</p></div><div className="step-connector"><ArrowRight size={20}/></div><div className="step-card"><span className="step-number">02</span><div className="step-icon"><Building2 size={24}/></div><h3>It reaches the right team</h3><p>Your report is reviewed, assigned to a department, and tracked as work progresses.</p></div><div className="step-connector"><ArrowRight size={20}/></div><div className="step-card"><span className="step-number">03</span><div className="step-icon"><CheckCircle2 size={24}/></div><h3>Follow the resolution</h3><p>Check your complaint timeline, read updates, and see when the issue is resolved.</p></div></div><div className="center-cta"><Link className="btn btn-primary btn-lg" to={user ? '/complaints/new' : '/register'}>Make your first report <ArrowRight size={17}/></Link></div></div></section>

    <section className="bottom-cta"><div className="container bottom-cta-inner"><div className="bottom-cta-icon"><Zap size={25}/></div><div><span className="eyebrow eyebrow-light">A BETTER WAY TO BE HEARD</span><h2>Your neighbourhood deserves<br/>a response.</h2><p>Start a report in a few minutes. Keep the reference number and follow progress from your dashboard.</p></div><Link className="btn btn-white btn-lg" to={user ? '/complaints/new' : '/register'}>Get started <ArrowRight size={17}/></Link></div></section>
  </main>;
}
