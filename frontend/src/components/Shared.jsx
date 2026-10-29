import React from 'react';
import { AlertCircle, ArrowRight, ClipboardList, Clock3, FileSearch, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export function PageHeading({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div>{action}</div>}</div>;
}

export function MetricCard({ label, value, help, icon: Icon, tone = 'teal' }) {
  return <div className={`metric-card tone-${tone}`}><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={19} /></span></div><strong>{value ?? '—'}</strong>{help && <small>{help}</small>}</div>;
}

export function StatusBadge({ status }) {
  const labels = { SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under review', ASSIGNED: 'Assigned', IN_PROGRESS: 'In progress', RESOLVED: 'Resolved', REJECTED: 'Rejected', CLOSED: 'Closed' };
  return <span className={`status-badge status-${String(status || 'SUBMITTED').toLowerCase()}`}><span />{labels[status] || status || 'Unknown'}</span>;
}

export function EmptyState({ title = 'Nothing here yet', description = 'When there is activity, it will appear here.', action }) {
  return <div className="empty-state"><div className="empty-illustration"><FileSearch size={30}/></div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function ErrorNotice({ message, onRetry }) {
  if (!message) return null;
  return <div className="error-notice"><AlertCircle size={17}/><span>{message}</span>{onRetry && <button onClick={onRetry}>Try again</button>}</div>;
}

export function ComplaintCard({ complaint }) {
  return <Link to={`/complaints/${complaint.id}`} className="complaint-card">
    <div className="complaint-card-top"><span className="ref-number">{complaint.reference_no}</span><StatusBadge status={complaint.status_code}/></div>
    <h3>{complaint.title}</h3>
    <p>{complaint.description?.length > 128 ? `${complaint.description.slice(0,128)}…` : complaint.description}</p>
    <div className="complaint-card-meta"><span><ClipboardList size={14}/>{complaint.category_name}</span><span><Clock3 size={14}/>{new Date(complaint.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</span></div>
    <div className="complaint-card-bottom"><span className="location-line">{complaint.department_name || 'Awaiting department assignment'}</span><span className="text-link">View details <ArrowRight size={14}/></span></div>
  </Link>;
}

export function InlineLoading({ text = 'Loading information…' }) {
  return <div className="inline-loading"><span className="spinner" />{text}</div>;
}

export function WorkflowStrip({ status }) {
  const steps = ['SUBMITTED','UNDER_REVIEW','ASSIGNED','IN_PROGRESS','RESOLVED','CLOSED'];
  const currentIndex = steps.indexOf(status);
  const rejected = status === 'REJECTED';
  return <div className={`workflow-strip ${rejected ? 'workflow-rejected' : ''}`}>
    {steps.slice(0,5).map((step,index) => {
      const complete = currentIndex > index || ['CLOSED'].includes(status) && index <= 4;
      const current = currentIndex === index;
      return <div className={`workflow-step ${complete ? 'complete' : ''} ${current ? 'current' : ''}`} key={step}>
        <span className="workflow-node">{complete ? <CheckCircle2 size={15}/> : index+1}</span>
        <span>{step.replaceAll('_',' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())}</span>
      </div>;
    })}
    {rejected && <div className="workflow-reject-note"><AlertCircle size={15}/>This complaint was rejected.</div>}
  </div>;
}
