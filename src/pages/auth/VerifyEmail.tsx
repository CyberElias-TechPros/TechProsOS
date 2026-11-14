import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../platform/api';
import { useLiveAuth } from '../../platform/session';
import { toast } from '../../components/ui';
export default function VerifyEmail() {
  const [params] = useSearchParams(); const token = params.get('token') ?? ''; const navigate = useNavigate(); const completeLogin = useLiveAuth(s => s.completeLogin);
  const [state, setState] = useState<'working' | 'error'>('working'); const [message, setMessage] = useState('Verifying your email…');
  useEffect(() => { let cancelled = false; (async () => { if (!token) { setState('error'); setMessage('Missing verification token.'); return; } try { const r = await api.verifyEmail(token); if (cancelled) return; await completeLogin(r.user, r.tenantId); toast('Email verified'); navigate('/app/overview', { replace: true }); } catch (e) { if (!cancelled) { setState('error'); setMessage(e instanceof Error ? e.message : 'Verification failed'); } } })(); return () => { cancelled = true; }; }, [token, completeLogin, navigate]);
  return <div className="auth-wrap"><main className="auth-main"><div className="auth-card stack-lg"><h1 style={{ fontSize: 24 }}>Email verification</h1><p className="muted sm" role="status">{message}</p>{state === 'error' && <Link className="btn block" to="/login">Back to sign in</Link>}</div></main></div>;
}
