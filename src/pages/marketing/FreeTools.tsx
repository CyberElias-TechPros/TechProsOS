/** Public free tools — a taste of the platform's calculators to earn trust. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { dataBurnEstimate, splitSubnets, subnetInfo } from '../../platform/net';
import { ngn } from '../../platform/util';
import { invoiceTotals } from '../../platform/db';
import { Table } from '../../components/ui';
import { MktNav, MktFooter } from './chrome';

function SubnetTool() {
  const [cidr, setCidr] = useState('192.168.44.0/24');
  const [splitN, setSplitN] = useState(4);
  const info = useMemo(() => subnetInfo(cidr), [cidr]);
  const parts = useMemo(() => (info ? splitSubnets(cidr, splitN) : []), [cidr, info, splitN]);
  return (
    <div className="card pad-lg stack">
      <h3>Subnet calculator</h3>
      <div className="row">
        <input className="input" style={{ maxWidth: 220 }} value={cidr} onChange={e => setCidr(e.target.value)} placeholder="10.0.0.0/22" aria-label="CIDR" />
        <select className="select" style={{ maxWidth: 180 }} value={splitN} onChange={e => setSplitN(+e.target.value)} aria-label="Split count">
          {[2, 4, 8, 16].map(n => <option key={n} value={n}>Split into {n}</option>)}
        </select>
      </div>
      {!info && <div className="note">Enter a valid IPv4 CIDR, e.g. 192.168.44.0/24</div>}
      {info && (
        <>
          <div className="grid-4">
            {[['Network', info.network], ['Broadcast', info.broadcast], ['First host', info.firstHost], ['Last host', info.lastHost], ['Subnet mask', info.mask], ['Usable hosts', info.hosts]].map(([k, v]) => (
              <div key={k}><div className="lbl">{k}</div><div className="mono b">{v}</div></div>
            ))}
          </div>
          {parts.length > 0 && (
            <Table head={['Child network', 'First host', 'Last host', 'Hosts']}>
              {parts.map(p => (
                <tr key={p.cidr}><td className="mono">{p.cidr}</td><td className="mono">{p.firstHost}</td><td className="mono">{p.lastHost}</td><td className="num">{p.hosts}</td></tr>
              ))}
            </Table>
          )}
        </>
      )}
    </div>
  );
}

function QuoteTool() {
  const [lines, setLines] = useState([{ desc: 'UniFi AP installation', qty: 6, unitPrice: 245000 }]);
  const [wht, setWht] = useState(0.05);
  const totals = invoiceTotals(lines.filter(l => l.desc && l.unitPrice > 0), 0.075, wht);
  return (
    <div className="card pad-lg stack">
      <h3>Invoice / quote builder</h3>
      {lines.map((l, i) => (
        <div className="row nowrap" key={i}>
          <input className="input" style={{ flex: 2 }} value={l.desc} aria-label={`Line ${i + 1} description`}
            onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))} placeholder="Service item…" />
          <input className="input" style={{ maxWidth: 80 }} type="number" value={l.qty} aria-label="Qty"
            onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, qty: +e.target.value } : x))} />
          <input className="input" style={{ maxWidth: 140 }} type="number" value={l.unitPrice} aria-label="Unit price"
            onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, unitPrice: +e.target.value } : x))} />
        </div>
      ))}
      <div className="row">
        <button className="btn secondary sm" onClick={() => setLines(ls => [...ls, { desc: '', qty: 1, unitPrice: 0 }])}>+ Add line</button>
        <label className="lbl row" style={{ gap: 6 }}>WHT
          <select className="select" style={{ width: 120 }} value={wht} onChange={e => setWht(+e.target.value)}>
            <option value={0.05}>5% (services)</option>
            <option value={0.1}>10% (select)</option>
            <option value={0}>None</option>
          </select>
        </label>
      </div>
      <Table head={['', 'Amount']}>
        <tr><td>Subtotal</td><td className="num">{ngn(totals.subtotal)}</td></tr>
        <tr><td>VAT 7.5%</td><td className="num">{ngn(totals.vat)}</td></tr>
        {totals.wht > 0 && <tr><td>WHT deducted ({wht * 100}%)</td><td className="num">({ngn(totals.wht)})</td></tr>}
        <tr><td className="b">Client pays</td><td className="b num" style={{ fontSize: 16 }}>{ngn(totals.net)}</td></tr>
      </Table>
    </div>
  );
}

function BandwidthTool() {
  const [video, setVideo] = useState(3); const [meetings, setMeetings] = useState(2); const [users, setUsers] = useState(40);
  const est = dataBurnEstimate({ videoHoursPerDay: video, meetingHoursPerDay: meetings, users });
  return (
    <div className="card pad-lg stack">
      <h3>Data consumption estimator</h3>
      <div className="row">
        <label className="lbl">Users <input className="input" type="number" style={{ width: 90 }} value={users} onChange={e => setUsers(+e.target.value)} /></label>
        <label className="lbl">Video hrs/day <input className="input" type="number" style={{ width: 90 }} value={video} onChange={e => setVideo(+e.target.value)} /></label>
        <label className="lbl">Meeting hrs/day <input className="input" type="number" style={{ width: 90 }} value={meetings} onChange={e => setMeetings(+e.target.value)} /></label>
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em' }}>{est.gbPerMonth} GB<span className="muted" style={{ fontSize: 14, fontWeight: 500 }}> / month</span></div>
      <p className="muted sm">{est.note}</p>
    </div>
  );
}

export default function FreeToolsPage() {
  return (
    <div className="mkt">
      <MktNav />
      <section className="mkt-section">
        <div className="mkt-eyebrow">Free forever</div>
        <h1 className="mkt-h2">IT tools we built for ourselves, shared with everyone</h1>
        <p className="mkt-sub">Real CIDR math, Nigerian tax rules and honest bandwidth estimates. The full toolkit lives inside the workspace.</p>
        <div className="stack-lg" style={{ marginTop: 26 }}>
          <SubnetTool />
          <div className="grid-2">
            <QuoteTool />
            <BandwidthTool />
          </div>
        </div>
        <div className="row" style={{ marginTop: 28, justifyContent: 'center' }}>
          <Link to="/signup" className="btn lg">Get the full toolkit inside TechPros One</Link>
        </div>
      </section>
      <MktFooter />
    </div>
  );
}
