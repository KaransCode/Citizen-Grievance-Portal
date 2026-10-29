import React, { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, ClipboardList, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, formatDate } from '../api.js';
import { ErrorNotice, InlineLoading, MetricCard, PageHeading, StatusBadge } from '../components/Shared.jsx';

const PIE_COLORS = ['#0d9488', '#f59e0b', '#7c9fe8', '#e8798b', '#a78bfa', '#64748b', '#35a37a'];
const nextSteps = {
  SUBMITTED: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['ASSIGNED', 'REJECTED'],
  ASSIGNED: ['IN_PROGRESS', 'REJECTED'],
  IN_PROGRESS: ['RESOLVED', 'REJECTED'],
  RESOLVED: ['IN_PROGRESS', 'CLOSED'],
  REJECTED: [],
  CLOSED: []
};

function TrendChart({ data = [] }) {
  if (!data.length) return <div className="chart-empty">No monthly trend data yet.</div>;
  const width = 620, height = 218, left = 35, right = 12, top = 14, bottom = 34;
  const max = Math.max(1, ...data.flatMap((row) => [Number(row.total) || 0, Number(row.resolved) || 0]));
  const x = (index) => left + (data.length <= 1 ? 0 : index * (width - left - right) / (data.length - 1));
  const y = (value) => top + (max - value) / max * (height - top - bottom);
  const reported = data.map((row, index) => `${x(index)},${y(Number(row.total) || 0)}`).join(' ');
  const resolved = data.map((row, index) => `${x(index)},${y(Number(row.resolved) || 0)}`).join(' ');
  const labelStep = Math.max(1, Math.ceil(data.length / 6));
  return <div className="trend-chart-wrap">
    <svg className="trend-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Reported and resolved complaints by month">
      {[0, 0.25, 0.5, 0.75, 1].map((portion) => {
        const yy = top + portion * (height - top - bottom);
        return <g key={portion}><line x1={left} y1={yy} x2={width - right} y2={yy} stroke="#e8edf0" strokeDasharray="4 4"/><text x={left - 9} y={yy + 4} textAnchor="end" fontSize="10" fill="#71808e">{Math.round(max * (1 - portion))}</text></g>;
      })}
      <polyline points={reported} fill="none" stroke="#0d9488" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={resolved} fill="none" stroke="#8b9ed8" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((row, index) => <g key={`${row.month}-${index}`}>
        <circle cx={x(index)} cy={y(Number(row.total) || 0)} r="3.2" fill="#0d9488" />
        <circle cx={x(index)} cy={y(Number(row.resolved) || 0)} r="3.2" fill="#8b9ed8" />
        {index % labelStep === 0 || index === data.length - 1 ? <text x={x(index)} y={height - 10} textAnchor="middle" fontSize="10" fill="#71808e">{String(row.month || '').slice(5) || String(row.month || '')}</text> : null}
      </g>)}
    </svg>
    <div className="chart-series-legend"><span><i className="legend-reported"/>Reported</span><span><i className="legend-resolved"/>Resolved</span></div>
  </div>;
}

function CategoryDonut({ data = [] }) {
  const items = data.filter((item) => Number(item.count) > 0);
  if (!items.length) return <div className="chart-empty">Category breakdown will appear once reports arrive.</div>;
  const total = items.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
  let cursor = 0;
  const slices = items.map((item, index) => {
    const start = cursor;
    cursor += (Number(item.count) || 0) / total * 100;
    return `${PIE_COLORS[index % PIE_COLORS.length]} ${start}% ${cursor}%`;
  });
  return <div className="donut-layout">
    <div className="donut-ring" style={{ background: `conic-gradient(${slices.join(',')})` }} role="img" aria-label={`Total reports by category: ${total}`}>
      <div className="donut-center"><strong>{total}</strong><span>Reports</span></div>
    </div>
    <div className="chart-legend">{items.map((item, index) => <div className="chart-legend-row" key={item.name}>
      <span className="chart-legend-name"><i style={{ background: PIE_COLORS[index % PIE_COLORS.length] }}/>{item.name}</span><strong>{item.count}</strong>
    </div>)}</div>
  </div>;
}

function DepartmentBars({ data = [] }) {
  if (!data.length) return <div className="chart-empty">No department workload data.</div>;
  const max = Math.max(1, ...data.map((row) => Number(row.count) || 0));
  return <div className="simple-bars">{data.slice(0, 10).map((row) => {
    const count = Number(row.count) || 0;
    return <div className="simple-bar-row" key={row.name}>
      <div className="simple-bar-label"><span title={row.name}>{row.name}</span><strong>{count}</strong></div>
      <div className="simple-bar-track"><span style={{ width: `${count / max * 100}%` }}/></div>
    </div>;
  })}</div>;
}

export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const [users, setUsers] = useState([]);
  const [showUsers, setShowUsers] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dash, stats, items, depts] = await Promise.all([
        api('/admin/dashboard'), api('/admin/analytics'), api('/complaints?limit=100'), api('/admin/departments')
      ]);
      setDashboard(dash);
      setAnalytics(stats);
      setComplaints(items.data || []);
      setDepartments(depts.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const assign = async (complaint) => {
    const departmentId = assignments[complaint.id] || '';
    if (!departmentId) return setError('Choose a department before assigning.');
    setSaving(complaint.id); setError('');
    try {
      await api(`/admin/complaints/${complaint.id}/assign-department`, { method: 'PUT', body: { departmentId } });
      await load();
    } catch (err) { setError(err.message); }
    finally { setSaving(''); }
  };

  const updateStatus = async (complaint, status) => {
    let note = '';
    if (status === 'RESOLVED') {
      note = window.prompt('Add a resolution note:', 'Work completed and verified.');
      if (!note?.trim()) return;
    }
    if (status === 'REJECTED') {
      note = window.prompt('Enter the reason for rejection:', 'Insufficient details to process this report.');
      if (!note?.trim()) return;
    }
    if (status === 'CLOSED') note = window.prompt('Optional closure note:', 'Citizen issue closed.');
    setSaving(complaint.id); setError('');
    try {
      await api(`/admin/complaints/${complaint.id}/update-status`, {
        method: 'PUT',
        body: { status, note: note || undefined, resolutionNote: status === 'RESOLVED' ? note : undefined, rejectionReason: status === 'REJECTED' ? note : undefined }
      });
      await load();
    } catch (err) { setError(err.message); }
    finally { setSaving(''); }
  };

  const loadUsers = async () => {
    try { const data = await api('/admin/users?limit=50'); setUsers(data.data || []); setShowUsers((value) => !value); }
    catch (err) { setError(err.message); }
  };

  if (loading) return <main className="section"><div className="container"><InlineLoading text="Loading administration dashboard…" /></div></main>;
  const summary = dashboard?.summary || {};

  return <main className="section dashboard-section admin-section"><div className="container">
    <PageHeading eyebrow="ADMINISTRATION CONSOLE" title="Civic operations overview" description="Monitor incoming reports, route issues to the right department, and review service performance." action={<button className="btn btn-quiet" onClick={load}><RefreshCw size={16}/> Refresh data</button>} />
    <ErrorNotice message={error} onRetry={load}/>
    <div className="metric-grid metric-grid-five">
      <MetricCard label="Total reports" value={summary.total ?? 0} help="All submitted complaints" icon={ClipboardList} tone="teal"/>
      <MetricCard label="Pending" value={summary.pending ?? 0} help="Need action or progress" icon={Activity} tone="amber"/>
      <MetricCard label="Resolved" value={summary.resolved ?? 0} help="Marked as resolved" icon={CheckCircle2} tone="green"/>
      <MetricCard label="Rejected" value={summary.rejected ?? 0} help="Rejected reports" icon={AlertTriangle} tone="rose"/>
      <MetricCard label="Active users" value={summary.active_users ?? 0} help="Active accounts" icon={Users} tone="blue"/>
    </div>

    <div className="analytics-grid">
      <div className="card-panel chart-panel"><div className="panel-heading"><div><h2>Complaint trend</h2><p>Reports created and resolved in the last 12 months.</p></div><span className="chart-tag">12 months</span></div><div className="chart-area"><TrendChart data={analytics?.monthlyTrends || []}/></div></div>
      <div className="card-panel chart-panel"><div className="panel-heading"><div><h2>By category</h2><p>Where reports are coming from.</p></div></div><div className="pie-area"><CategoryDonut data={analytics?.categoryWise || []}/></div></div>
      <div className="card-panel chart-panel chart-wide"><div className="panel-heading"><div><h2>Department workload</h2><p>Distribution of assigned complaints across departments.</p></div></div><div className="chart-area chart-bar"><DepartmentBars data={analytics?.departmentWise || []}/></div></div>
      <div className="card-panel chart-panel chart-wide"><div className="panel-heading"><div><h2>Ward-level heat map</h2><p>Relative number of reports by area. This grid is an aggregate view, not an official GIS boundary map.</p></div><span className="chart-tag">Top 20 areas</span></div><div className="ward-heatmap">{analytics?.wardHeatmap?.length ? analytics.wardHeatmap.map((ward) => { const max = Math.max(...analytics.wardHeatmap.map((item) => Number(item.count) || 0), 1); const intensity = Math.max(.08, Number(ward.count) / max); return <div className="ward-tile" key={ward.ward} style={{ backgroundColor: `rgba(13,148,136,${0.07 + intensity * 0.25})`, borderColor: `rgba(13,148,136,${0.12 + intensity * 0.35})` }}><span>{ward.ward}</span><strong>{ward.count}</strong><small>{ward.open_count} open</small></div>; }) : <div className="chart-empty">Ward data appears after citizens include an area in reports.</div>}</div></div>
    </div>

    <div className="toolbar-panel admin-toolbar"><div><h2>Complaint management</h2><p>Assign departments or update a report's status.</p></div><button className="btn btn-outline btn-sm" onClick={loadUsers}><Users size={15}/>{showUsers ? 'Hide users' : 'Manage users'}</button></div>
    {showUsers && <div className="card-panel user-table-wrap"><table className="data-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Account</th><th>Action</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td><span className="role-tag">{user.role}</span></td><td>{user.department_name || '—'}</td><td>{user.is_active ? 'Active' : 'Inactive'}</td><td><button className="btn btn-outline btn-xs" onClick={async () => { try { await api(`/admin/users/${user.id}/active`, { method: 'PATCH', body: { isActive: !user.is_active } }); await loadUsers(); } catch (err) { setError(err.message); } }}>{user.is_active ? 'Deactivate' : 'Activate'}</button></td></tr>)}</tbody></table></div>}
    <div className="admin-complaints-list">{complaints.length ? complaints.map((complaint) => <div className="admin-complaint-row card-panel" key={complaint.id}>
      <div className="admin-row-main"><div className="admin-row-top"><span className="ref-number">{complaint.reference_no}</span><StatusBadge status={complaint.status_code}/><span className={`priority-pill priority-${complaint.priority?.toLowerCase()}`}>{complaint.priority}</span></div><h3>{complaint.title}</h3><p>{complaint.category_name} · {complaint.address} · {formatDate(complaint.created_at, false)}</p><Link to={`/complaints/${complaint.id}`} className="text-link">Open complaint details <span>→</span></Link></div>
      <div className="admin-row-actions"><label className="field-label">Assign department</label><div className="inline-assign"><select className="form-control form-control-sm" value={assignments[complaint.id] ?? departments.find((d) => d.id === complaint.assigned_department_id)?.id ?? ''} onChange={(event) => setAssignments((old) => ({ ...old, [complaint.id]: event.target.value }))}><option value="">Select department</option>{departments.filter((d) => d.is_active).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select><button className="btn btn-primary btn-sm" disabled={saving === complaint.id} onClick={() => assign(complaint)}>{saving === complaint.id ? '…' : 'Assign'}</button></div><label className="field-label status-action-label">Change status</label><select className="form-control form-control-sm" value="" disabled={saving === complaint.id || !(nextSteps[complaint.status_code]?.length)} onChange={(event) => { if (event.target.value) updateStatus(complaint, event.target.value); }}><option value="">Choose next status…</option>{(nextSteps[complaint.status_code] || []).map((next) => <option key={next} value={next}>{next.replaceAll('_', ' ')}</option>)}</select></div>
    </div>) : <div className="card-panel"><p>No complaints have been submitted yet.</p></div>}</div>
    <div className="analytics-note"><ShieldCheck size={17}/><span>Analytics are generated from the current database. For official reporting, validate reporting periods and export rules with the administering authority.</span></div>
  </div></main>;
}
