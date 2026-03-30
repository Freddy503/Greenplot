import { API_BASE } from '../config';
import { useState } from 'react';

interface LoginScreenProps {
  onLogin: (token: string) => void;
  onSwitchToRegister: () => void;
}

export function LoginScreen({ onLogin, onSwitchToRegister }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Login failed');
      }
      const data = await res.json();
      localStorage.setItem('token', data.access_token);
      onLogin(data.access_token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-headline font-bold text-center">Sign In</h1>
        {error && <div className="p-3 bg-error/20 text-on-error rounded">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full p-3 rounded bg-surface-dim/30 border border-outline-variant focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full p-3 rounded bg-surface-dim/30 border border-outline-variant focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-full bg-secondary text-on-secondary font-headline font-bold disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <p className="text-center text-sm text-on-surface-variant">
          Don't have an account?{' '}
          <button onClick={onSwitchToRegister} className="text-primary underline">
            Create one
          </button>
        </p>
      </div>
    </div>
  );
}
