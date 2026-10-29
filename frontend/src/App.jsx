import React, { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Bell, Building2, CheckCircle2, ChevronDown, Flag, LogOut, MapPin, Menu, ShieldCheck, X } from 'lucide-react';
import { api } from './api.js';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import CitizenDashboardPage from './pages/CitizenDashboardPage.jsx';
import NewComplaintPage from './pages/NewComplaintPage.jsx';
import ComplaintDetailPage from './pages/ComplaintDetailPage.jsx';
import AdminDashboardPage from './pages/AdminDashboardPage.jsx';
import DepartmentDashboardPage from './pages/DepartmentDashboardPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';

import { AuthContext, useAuth } from './auth-context.jsx';
export { useAuth } from './auth-context.jsx';

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const refresh = async () => {
    try { const result = await api('/auth/me'); setUser(result.user); }
    catch { setUser(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);
  const value = useMemo(() => ({ user, setUser, loading, refresh, notice, setNotice }), [user, loading, notice]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="page-loader"><span className="spinner" />Checking your session…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={user.role === 'ADMIN' ? '/admin' : user.role === 'DEPARTMENT' ? '/department' : '/dashboard'} replace />;
  return children;
}

function SiteLayout({ children }) {
  const { user, setUser, setNotice } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    setMobileOpen(false);
    if (user) api('/notifications').then((data) => setUnread(data.unread || 0)).catch(() => {});
  }, [location.pathname, user]);
  const signOut = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* Clear client state even if the session expired. */ }
    setUser(null); setNotice('You have been signed out.'); navigate('/');
  };
  return <>
    <div className="utility-bar"><div className="container utility-inner"><span><MapPin size={13} /> Civic services, made clearer</span><span className="utility-status"><span className="online-dot" /> Transparent. Trackable. Accountable.</span></div></div>
    <header className="site-header">
      <div className="container nav-row">
        <Link to="/" className="brand"><span className="brand-mark"><Building2 size={22} /></span><span>Civic<span className="brand-accent">Connect</span><small>Citizen grievance portal</small></span></Link>
        <button className="mobile-toggle" aria-label="Toggle navigation" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X /> : <Menu />}</button>
        <nav className={`main-nav ${mobileOpen ? 'open' : ''}`}>
          <NavLink to="/" end>Home</NavLink>
          {user?.role === 'CITIZEN' && <><NavLink to="/dashboard">My complaints</NavLink><NavLink to="/complaints/new">Report an issue</NavLink></>}
          {user?.role === 'ADMIN' && <NavLink to="/admin">Admin console</NavLink>}
          {user?.role === 'DEPARTMENT' && <NavLink to="/department">Department desk</NavLink>}
          {user && <NavLink className="nav-notify" to="/notifications"><Bell size={16} /> Updates{unread > 0 && <span className="notify-count">{unread}</span>}</NavLink>}
        </nav>
        <div className="nav-actions">
          {user ? <><span className="user-chip"><span className="avatar-mini">{user.name?.slice(0,1).toUpperCase()}</span><span className="user-chip-name">{user.name?.split(' ')[0]}<small>{user.role === 'ADMIN' ? 'Administrator' : user.role === 'DEPARTMENT' ? 'Department' : 'Citizen'}</small></span><ChevronDown size={14} /></span><button className="btn btn-quiet btn-sm" onClick={signOut}><LogOut size={15} /> Sign out</button></> : <><Link className="btn btn-quiet btn-sm" to="/login">Sign in</Link><Link className="btn btn-primary btn-sm" to="/register">Create account <ArrowRight size={15} /></Link></>}
        </div>
      </div>
    </header>
    {children}
    <footer className="site-footer"><div className="container footer-top"><Link to="/" className="brand footer-brand"><span className="brand-mark"><Building2 size={20} /></span><span>Civic<span className="brand-accent">Connect</span><small>Citizen grievance portal</small></span></Link><p>A clearer path from civic concern to resolution.</p><div className="footer-links"><Link to="/">Home</Link><Link to="/login">Sign in</Link><Link to="/register">Register</Link></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} CivicConnect · Academic reference implementation</span><span><ShieldCheck size={14} /> Privacy-conscious by design</span></div></footer>
  </>;
}

function AppRoutes() {
  const { notice, setNotice } = useAuth();
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 4200); return () => clearTimeout(timer); } }, [notice]);
  return <>
    {notice && <div className="toast-message"><CheckCircle2 size={17} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15} /></button></div>}
    <SiteLayout><Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/dashboard" element={<Protected roles={['CITIZEN']}><CitizenDashboardPage /></Protected>} />
      <Route path="/complaints/new" element={<Protected roles={['CITIZEN']}><NewComplaintPage /></Protected>} />
      <Route path="/complaints/:id" element={<Protected><ComplaintDetailPage /></Protected>} />
      <Route path="/admin" element={<Protected roles={['ADMIN']}><AdminDashboardPage /></Protected>} />
      <Route path="/department" element={<Protected roles={['DEPARTMENT']}><DepartmentDashboardPage /></Protected>} />
      <Route path="/notifications" element={<Protected><NotificationsPage /></Protected>} />
      <Route path="*" element={<main className="section"><div className="container empty-state"><Flag size={34}/><h2>Page not found</h2><p>The page you requested does not exist.</p><Link className="btn btn-primary" to="/">Back to home</Link></div></main>} />
    </Routes></SiteLayout>
  </>;
}

export default function App() { return <AuthProvider><AppRoutes /></AuthProvider>; }
