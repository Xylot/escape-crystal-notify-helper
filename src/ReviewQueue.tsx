import { useState } from 'react';
import { Icon } from './Icons';
import { exportProblem } from './core/authoring.mjs';
import type { Draft, Snapshot } from './types';

export default function ReviewQueue({ drafts, snapshot, onClose, onEdit, onExport, onCreatePR }: {
  drafts: Draft[]; snapshot: Snapshot; onClose: () => void;
  onCreatePR?: (ids:string[])=>void; onEdit: (id: string) => void; onExport: (kind: string, ids: string[]) => void;
}) {
  const [selected, setSelected] = useState(() => drafts.filter(d => !exportProblem(snapshot, [d])).map(d => d.id));
  const changes = drafts.filter(d => selected.includes(d.id));
  const issue = exportProblem(snapshot, changes);
  return <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="review-title" className="modal review-modal">
    <button className="close" onClick={onClose} aria-label="Close review">×</button><div className="eyebrow">YOUR CONTRIBUTIONS</div><h2 id="review-title">Export your drafts</h2><p>Choose the encounters to include. Ready drafts are selected for you.</p>
    {!drafts.length && <div className="library-empty"><Icon name="file" size={30}/><h3>No drafts yet</h3><p>Open an encounter and edit its coverage to start a contribution.</p><button onClick={onClose}>Back to workspace</button></div>}
    <div className="export-queue">{drafts.map(d => { const problem = exportProblem(snapshot, [d]); return <article className="queue-item" key={d.id}><label><input type="checkbox" checked={selected.includes(d.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, d.id] : ids.filter(id => id !== d.id))}/><span><strong>{d.name}</strong><small>{d.regions.length} region{d.regions.length === 1 ? '' : 's'} · {d.deathType || 'Death behavior not selected'}</small></span></label><span className={`review-readiness ${problem ? 'pending' : 'ready'}`}>{problem ? 'Needs attention' : 'Ready'}</span><button onClick={() => onEdit(d.id)}>{problem ? 'Finish review' : 'Edit'}</button>{problem && <p>{problem}</p>}</article>; })}</div>
    {drafts.length > 0 && <><div className="queue-total"><strong>{changes.length} selected</strong><button onClick={() => setSelected(drafts.filter(d => !exportProblem(snapshot, [d])).map(d => d.id))}>Select ready drafts</button></div>{issue && <p className="export-issue" role="status">{issue}</p>}<div className="export-actions">{onCreatePR&&<button className="primary" disabled={!!issue} onClick={()=>onCreatePR(selected)}>Create pull request</button>}<button className="primary" disabled={!!issue} onClick={() => onExport('json', selected)}>Download proposal</button><button disabled={!!issue} onClick={() => onExport('patch', selected)}>Download patch</button><button disabled={!!issue} onClick={() => onExport('copy', selected)}>Copy proposal</button></div><p className="muted">Exports contain only the selected encounters. Nothing is submitted automatically.</p></>}
  </section></div>;
}
