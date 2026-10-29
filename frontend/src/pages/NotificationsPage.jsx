import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, Clock3, MessageSquareText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, formatDate } from '../api.js';
import { ErrorNotice, InlineLoading, PageHeading } from '../components/Shared.jsx';
export default function NotificationsPage(){
 const [items,setItems]=useState([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 const load=useCallback(async()=>{setLoading(true);setError('');try{const r=await api('/notifications');setItems(r.data||[]);}catch(err){setError(err.message);}finally{setLoading(false);}},[]);
 useEffect(()=>{load();},[load]);
 const markRead=async(item)=>{try{await api(`/notifications/${item.id}/read`,{method:'PATCH',body:{}});setItems(old=>old.map(n=>n.id===item.id?{...n,read_at:new Date().toISOString()}:n));}catch(err){setError(err.message);}};
 const readAll=async()=>{try{await api('/notifications/read-all',{method:'PATCH',body:{}});setItems(old=>old.map(n=>({...n,read_at:n.read_at||new Date().toISOString()})));}catch(err){setError(err.message);}};
 return <main className="section dashboard-section"><div className="container"><PageHeading eyebrow="YOUR UPDATES" title="Notifications" description="Status changes, assignments, and messages about your civic reports." action={<button className="btn btn-quiet" onClick={readAll}><CheckCheck size={16}/> Mark all read</button>}/><ErrorNotice message={error} onRetry={load}/>{loading?<InlineLoading/>:items.length?<div className="notification-list">{items.map(item=><div className={`notification-item card-panel ${item.read_at?'is-read':''}`} key={item.id}><span className="notification-icon"><Bell size={19}/></span><div className="notification-copy"><div className="notification-title-row"><h3>{item.title}</h3><span>{formatDate(item.created_at)}</span></div><p>{item.message}</p><div className="notification-bottom">{item.complaint_id&&<Link className="text-link" to={`/complaints/${item.complaint_id}`}>Open complaint</Link>}{!item.read_at&&<button className="text-link button-link" onClick={()=>markRead(item)}>Mark read</button>}</div></div>{!item.read_at&&<span className="unread-indicator"/>}</div>)}</div>:<div className="card-panel empty-state"><div className="empty-illustration"><MessageSquareText size={29}/></div><h3>You're all caught up</h3><p>New complaint updates will appear here.</p></div>}</div></main>;
}
