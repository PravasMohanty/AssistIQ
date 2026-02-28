import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Bot, MessageSquare, Shield, LogOut, Sparkles, Database } from 'lucide-react'
import './Navbar.css'

const Navbar = () => {
    const { profile, logout, isAdmin } = useAuth()

    return (
        <nav className="navbar">
            <div className="nav-brand">
                <div className="nav-logo">
                    <Bot size={20} />
                </div>
                <span className="nav-title">AssistIQ</span>
                <Sparkles size={12} className="nav-sparkle" />
            </div>

            <div className="nav-links">
                <NavLink
                    to="/chat"
                    className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                >
                    <MessageSquare size={16} />
                    Chat
                </NavLink>

                {isAdmin && (
                    <NavLink
                        to="/admin"
                        className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                    >
                        <Shield size={16} />
                        Admin
                    </NavLink>
                )}

                {isAdmin && (
                    <NavLink
                        to="/admin/kb"
                        className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                    >
                        <Database size={16} />
                        Knowledge Base
                    </NavLink>
                )}
            </div>

            <div className="nav-right">
                <div className="nav-user">
                    <span className="nav-user-name">{profile?.name || profile?.email || 'User'}</span>
                    {isAdmin && <span className="badge badge-admin">Admin</span>}
                </div>
                <button className="btn btn-ghost btn-icon nav-logout" onClick={logout} title="Sign out">
                    <LogOut size={18} />
                </button>
            </div>
        </nav>
    )
}

export default Navbar
