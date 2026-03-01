import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Bot, Mail, Lock, User, ArrowRight, Sparkles } from 'lucide-react'
import './AuthPage.css'

const AuthPage = () => {
    const [isLogin, setIsLogin] = useState(true)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [name, setName] = useState('')
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const { login, register } = useAuth()
    const navigate = useNavigate()

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setSuccess('')
        setSubmitting(true)

        try {
            if (isLogin) {
                await login(email, password)
                navigate('/chat', { replace: true })
            } else {
                await register(email, password, name)
                setSuccess('Account created! You can now sign in.')
                setIsLogin(true)
                setPassword('')
            }
        } catch (err) {
            setError(err.message || 'Something went wrong')
        } finally {
            setSubmitting(false)
        }
    }

    const toggleMode = () => {
        setIsLogin(!isLogin)
        setError('')
        setSuccess('')
    }

    return (
        <div className="auth-page">
            {/* Background effects */}
            <div className="auth-bg">
                <div className="auth-bg-orb auth-bg-orb-1" />
                <div className="auth-bg-orb auth-bg-orb-2" />
                <div className="auth-bg-orb auth-bg-orb-3" />
            </div>

            <div className="auth-container fade-in">
                {/* Branding */}
                <div className="auth-brand">
                    <div className="auth-logo">
                        <Bot size={32} />
                        <Sparkles size={16} className="auth-logo-sparkle" />
                    </div>
                    <h1>AssistIQ</h1>
                    <p>AI-Powered Customer Support</p>
                </div>

                {/* Card */}
                <div className="auth-card glass-card">
                    <div className="auth-tabs">
                        <button
                            className={`auth-tab ${isLogin ? 'active' : ''}`}
                            onClick={() => toggleMode()}
                            type="button"
                        >
                            Sign In
                        </button>
                        <button
                            className={`auth-tab ${!isLogin ? 'active' : ''}`}
                            onClick={() => toggleMode()}
                            type="button"
                        >
                            Sign Up
                        </button>
                    </div>

                    <form className="auth-form" onSubmit={handleSubmit}>
                        {!isLogin && (
                            <div className="input-group">
                                <label htmlFor="auth-name">Full Name</label>
                                <div className="auth-input-wrapper">
                                    <User size={18} />
                                    <input
                                        id="auth-name"
                                        className="input"
                                        type="text"
                                        placeholder="Enter your name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        required={!isLogin}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="input-group">
                            <label htmlFor="auth-email">Email</label>
                            <div className="auth-input-wrapper">
                                <Mail size={18} />
                                <input
                                    id="auth-email"
                                    className="input"
                                    type="email"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="input-group">
                            <label htmlFor="auth-password">Password</label>
                            <div className="auth-input-wrapper">
                                <Lock size={18} />
                                <input
                                    id="auth-password"
                                    className="input"
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={6}
                                />
                            </div>
                        </div>

                        {error && <div className="auth-error">{error}</div>}
                        {success && <div className="auth-success">{success}</div>}

                        <button
                            className="btn btn-primary btn-lg w-full"
                            type="submit"
                            disabled={submitting}
                        >
                            {submitting ? (
                                <div className="loader-spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
                            ) : (
                                <>
                                    {isLogin ? 'Sign In' : 'Create Account'}
                                    <ArrowRight size={18} />
                                </>
                            )}
                        </button>
                    </form>

                    <p className="auth-footer">
                        {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
                        <button type="button" className="auth-link" onClick={toggleMode}>
                            {isLogin ? 'Sign up' : 'Sign in'}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    )
}

export default AuthPage
