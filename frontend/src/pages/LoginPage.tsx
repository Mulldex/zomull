import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { AlertCircle, Lock } from 'lucide-react'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Nesprávny email alebo heslo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <div className="login-logo">
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f5f5f5',
            borderRadius: 8,
            padding: '10px 20px',
            marginBottom: 14,
          }}>
            <img src="/mulldex-logo.png" alt="MULLDEX" style={{ height: 44, width: 'auto' }} />
          </div>
          <h1>ZO<span>MU</span>LL</h1>
          <p>Stavebno-obchodná spoločnosť · Objednávky a zmluvy</p>
        </div>

        {error && (
          <div className="alert alert-error">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email" value={email} required
              onChange={e => setEmail(e.target.value)}
              placeholder="vas@email.sk"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Heslo</label>
            <input
              type="password" value={password} required
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ marginTop: 6, justifyContent: 'center' }}
          >
            {loading
              ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Prihlasujem...</>
              : <><Lock size={14} /> Prihlásiť sa</>
            }
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 11, color: 'var(--text3)' }}>
          ZOMULL v1.0 · MULLDEX s.r.o.
        </div>
      </div>
    </div>
  )
}
