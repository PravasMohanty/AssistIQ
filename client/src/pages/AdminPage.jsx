import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { kbAPI } from '../../api/kb'
import { sessionAPI } from '../../api/session'
import {
    BookOpen, MessageSquare, Upload, Trash2,
    Database, RefreshCw, Search, FileText, CheckCircle,
    Clock, HardDrive, Layers, FileCode, Check, AlertTriangle
} from 'lucide-react'
import './AdminPage.css'

const AdminPage = () => {
    const [activeTab, setActiveTab] = useState('knowledge')
    const navigate = useNavigate()

    // Knowledge Base state
    const [entries, setEntries] = useState([])
    const [loadingEntries, setLoadingEntries] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [syncingAll, setSyncingAll] = useState(false)
    const [reingestingId, setReingestingId] = useState(null)

    // Sessions state
    const [sessions, setSessions] = useState([])
    const [loadingSessions, setLoadingSessions] = useState(true)

    useEffect(() => {
        if (activeTab === 'knowledge') loadEntries()
        else loadAllSessions()
    }, [activeTab])

    // ---- Knowledge Base ----
    const loadEntries = async () => {
        try {
            setLoadingEntries(true)
            const res = await kbAPI.getAllEntries()
            const list = res.entries || []
            setEntries(Array.isArray(list) ? list : [])
        } catch (err) {
            console.error('Failed to load KB entries:', err)
        } finally {
            setLoadingEntries(false)
        }
    }

    const deleteEntry = async (entryId, filename) => {
        if (!confirm(`Delete "${filename || entryId}"? This will delete the file from rag-service/data and purge its chunks from ChromaDB.`)) {
            return
        }
        try {
            await kbAPI.deleteEntry(entryId)
            setEntries(prev => prev.filter(e => e.id !== entryId))
        } catch (err) {
            console.error('Failed to delete entry:', err)
            alert(err?.response?.data?.error || 'Failed to delete document')
        }
    }

    const handleReingest = async (entryId, filename) => {
        setReingestingId(entryId)
        try {
            await kbAPI.reingestEntry(entryId)
            await loadEntries()
        } catch (err) {
            console.error('Failed to reingest:', err)
            alert(err?.response?.data?.error || 'Failed to re-index document')
        } finally {
            setReingestingId(null)
        }
    }

    const syncEmbeddings = async () => {
        setSyncingAll(true)
        try {
            const res = await kbAPI.syncEmbeddings()
            alert(res.message || 'Embeddings synced successfully!')
            await loadEntries()
        } catch (err) {
            console.error('Failed to sync embeddings:', err)
            alert(err?.response?.data?.error || 'Failed to sync embeddings')
        } finally {
            setSyncingAll(false)
        }
    }

    // Filter entries
    const filteredEntries = entries.filter(e =>
        e.filename?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.id?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    // ---- Sessions ----
    const loadAllSessions = async () => {
        try {
            setLoadingSessions(true)
            const res = await sessionAPI.getAllSessions()
            const list = res.sessions || res.data || res || []
            setSessions(Array.isArray(list) ? list : [])
        } catch (err) {
            console.error('Failed to load sessions:', err)
        } finally {
            setLoadingSessions(false)
        }
    }

    const formatFileSize = (bytes) => {
        if (!bytes && bytes !== 0) return '—'
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    const formatDate = (ts) => {
        if (!ts) return '—'
        return new Date(ts).toLocaleDateString([], {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        })
    }

    const totalChunks = entries.reduce((acc, curr) => acc + (curr.chunks_count || 0), 0)

    return (
        <div className="admin-page fade-in">
            <div className="admin-header">
                <div>
                    <h2>Admin Dashboard</h2>
                    <p className="admin-subtitle">Manage AI knowledge base documents and live customer sessions</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="admin-tabs">
                <button
                    className={`admin-tab ${activeTab === 'knowledge' ? 'active' : ''}`}
                    onClick={() => setActiveTab('knowledge')}
                >
                    <BookOpen size={16} />
                    Knowledge Base ({entries.length})
                </button>
                <button
                    className={`admin-tab ${activeTab === 'sessions' ? 'active' : ''}`}
                    onClick={() => setActiveTab('sessions')}
                >
                    <MessageSquare size={16} />
                    Sessions ({sessions.length})
                </button>
            </div>

            {/* Knowledge Base Tab */}
            {activeTab === 'knowledge' && (
                <div className="admin-content">
                    <div className="admin-toolbar">
                        <div className="admin-search">
                            <Search size={16} />
                            <input
                                className="input"
                                type="text"
                                placeholder={`Search ${entries.length} knowledge base files...`}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="admin-toolbar-actions">
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={syncEmbeddings}
                                disabled={syncingAll || loadingEntries}
                            >
                                <RefreshCw size={14} className={syncingAll ? 'spin' : ''} />
                                {syncingAll ? 'Syncing...' : 'Sync All'}
                            </button>
                            <button className="btn btn-primary btn-sm" onClick={() => navigate('/admin/kb')}>
                                <Upload size={14} />
                                Upload Document
                            </button>
                        </div>
                    </div>

                    {loadingEntries ? (
                        <div className="flex justify-center" style={{ padding: 48 }}>
                            <div className="loader-spinner" />
                        </div>
                    ) : filteredEntries.length === 0 ? (
                        <div className="empty-state">
                            <Database size={36} />
                            <h3>No documents found</h3>
                            <p>Upload .txt or .md files to rag-service/data to train the assistant</p>
                            <button className="btn btn-primary btn-sm" onClick={() => navigate('/admin/kb')}>
                                <Upload size={14} />
                                Upload First Document
                            </button>
                        </div>
                    ) : (
                        <div className="kb-grid">
                            {filteredEntries.map(entry => (
                                <div key={entry.id} className="kb-card glass-card">
                                    <div className="kb-card-header">
                                        <div className="kb-card-type">
                                            {entry.extension === '.md' ? <FileCode size={16} /> : <FileText size={16} />}
                                            <span className="badge badge-admin">
                                                {entry.extension || '.txt'}
                                            </span>
                                        </div>
                                        <div className="kb-card-actions">
                                            <button
                                                className="btn btn-ghost btn-icon btn-sm"
                                                onClick={() => handleReingest(entry.id, entry.filename)}
                                                disabled={reingestingId === entry.id}
                                                title="Re-index document"
                                            >
                                                <RefreshCw size={14} className={reingestingId === entry.id ? 'spin' : ''} />
                                            </button>
                                            <button
                                                className="btn btn-ghost btn-icon btn-sm kb-delete"
                                                onClick={() => deleteEntry(entry.id, entry.filename)}
                                                title="Delete document"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <h4 className="kb-card-title">{entry.filename}</h4>
                                    <div className="kb-card-meta-row" style={{ display: 'flex', gap: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                        <span><HardDrive size={12} style={{ display: 'inline', marginRight: 4 }} />{formatFileSize(entry.size_bytes)}</span>
                                        <span><Layers size={12} style={{ display: 'inline', marginRight: 4 }} />{entry.chunks_count} chunks</span>
                                    </div>
                                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatDate(entry.created_at)}</span>
                                        {entry.chunks_count > 0 ? (
                                            <span style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                <Check size={12} /> Active in Chroma
                                            </span>
                                        ) : (
                                            <span style={{ color: '#f59e0b', fontSize: '0.75rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                <AlertTriangle size={12} /> Pending
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Sessions Tab */}
            {activeTab === 'sessions' && (
                <div className="admin-content">
                    {loadingSessions ? (
                        <div className="flex justify-center" style={{ padding: 48 }}>
                            <div className="loader-spinner" />
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="empty-state">
                            <MessageSquare size={36} />
                            <h3>No sessions yet</h3>
                            <p>Customer chat sessions will appear here</p>
                        </div>
                    ) : (
                        <div className="sessions-table-wrapper glass-card">
                            <table className="sessions-table">
                                <thead>
                                    <tr>
                                        <th>Title</th>
                                        <th>User ID</th>
                                        <th>Status</th>
                                        <th>Created</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sessions.map(s => (
                                        <tr key={s.id}>
                                            <td className="session-title">{s.title || 'Untitled'}</td>
                                            <td className="session-user-id">{s.user_id}</td>
                                            <td>
                                                <span className={`badge ${s.status === 'active' ? 'badge-active' : 'badge-resolved'}`}>
                                                    {s.status}
                                                </span>
                                            </td>
                                            <td className="session-date">{formatDate(s.created_at)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default AdminPage
