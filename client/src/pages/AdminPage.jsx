import { useState, useEffect } from 'react'
import { kbAPI } from '../../api/kb'
import { sessionAPI } from '../../api/session'
import {
    BookOpen, MessageSquare, Plus, Edit3, Trash2,
    X, Save, Database, RefreshCw, Search, FileText, HelpCircle
} from 'lucide-react'
import './AdminPage.css'

const AdminPage = () => {
    const [activeTab, setActiveTab] = useState('knowledge')

    // Knowledge Base state
    const [entries, setEntries] = useState([])
    const [loadingEntries, setLoadingEntries] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [editingEntry, setEditingEntry] = useState(null)
    const [formData, setFormData] = useState({ title: '', content: '', type: 'qa' })
    const [saving, setSaving] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')

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
            const list = res.entries || res.data || res || []
            setEntries(Array.isArray(list) ? list : [])
        } catch (err) {
            console.error('Failed to load KB entries:', err)
        } finally {
            setLoadingEntries(false)
        }
    }

    const openAddForm = () => {
        setEditingEntry(null)
        setFormData({ title: '', content: '', type: 'qa' })
        setShowForm(true)
    }

    const openEditForm = (entry) => {
        setEditingEntry(entry)
        setFormData({ title: entry.title, content: entry.content, type: entry.type || 'qa' })
        setShowForm(true)
    }

    const closeForm = () => {
        setShowForm(false)
        setEditingEntry(null)
        setFormData({ title: '', content: '', type: 'qa' })
    }

    const handleSave = async (e) => {
        e.preventDefault()
        if (!formData.title.trim() || !formData.content.trim()) return

        setSaving(true)
        try {
            if (editingEntry) {
                await kbAPI.updateEntry(editingEntry.id, formData)
                setEntries(prev => prev.map(e =>
                    e.id === editingEntry.id ? { ...e, ...formData } : e
                ))
            } else {
                const res = await kbAPI.addEntry(formData.title, formData.content, formData.type)
                const newEntry = res.entry || res.data || res
                setEntries(prev => [newEntry, ...prev])
            }
            closeForm()
        } catch (err) {
            console.error('Failed to save entry:', err)
        } finally {
            setSaving(false)
        }
    }

    const deleteEntry = async (entryId) => {
        if (!confirm('Delete this knowledge base entry?')) return
        try {
            await kbAPI.deleteEntry(entryId)
            setEntries(prev => prev.filter(e => e.id !== entryId))
        } catch (err) {
            console.error('Failed to delete entry:', err)
        }
    }

    const syncEmbeddings = async () => {
        try {
            await kbAPI.syncEmbeddings()
            alert('Embeddings synced successfully!')
        } catch (err) {
            console.error('Failed to sync embeddings:', err)
        }
    }

    // Filter entries
    const filteredEntries = entries.filter(e =>
        e.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.content?.toLowerCase().includes(searchQuery.toLowerCase())
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

    const formatDate = (ts) => {
        if (!ts) return '—'
        return new Date(ts).toLocaleDateString([], {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        })
    }

    return (
        <div className="admin-page fade-in">
            <div className="admin-header">
                <div>
                    <h2>Admin Dashboard</h2>
                    <p className="admin-subtitle">Manage knowledge base and chat sessions</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="admin-tabs">
                <button
                    className={`admin-tab ${activeTab === 'knowledge' ? 'active' : ''}`}
                    onClick={() => setActiveTab('knowledge')}
                >
                    <BookOpen size={16} />
                    Knowledge Base
                </button>
                <button
                    className={`admin-tab ${activeTab === 'sessions' ? 'active' : ''}`}
                    onClick={() => setActiveTab('sessions')}
                >
                    <MessageSquare size={16} />
                    Sessions
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
                                placeholder="Search entries..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="admin-toolbar-actions">
                            <button className="btn btn-secondary btn-sm" onClick={syncEmbeddings}>
                                <RefreshCw size={14} />
                                Sync Embeddings
                            </button>
                            <button className="btn btn-primary btn-sm" onClick={openAddForm}>
                                <Plus size={14} />
                                Add Entry
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
                            <h3>No entries found</h3>
                            <p>Add knowledge base entries to train the AI assistant</p>
                            <button className="btn btn-primary btn-sm" onClick={openAddForm}>
                                <Plus size={14} />
                                Add First Entry
                            </button>
                        </div>
                    ) : (
                        <div className="kb-grid">
                            {filteredEntries.map(entry => (
                                <div key={entry.id} className="kb-card glass-card">
                                    <div className="kb-card-header">
                                        <div className="kb-card-type">
                                            {entry.type === 'instruction' ? (
                                                <FileText size={14} />
                                            ) : (
                                                <HelpCircle size={14} />
                                            )}
                                            <span className={`badge ${entry.type === 'instruction' ? 'badge-admin' : 'badge-active'}`}>
                                                {entry.type || 'qa'}
                                            </span>
                                        </div>
                                        <div className="kb-card-actions">
                                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEditForm(entry)}>
                                                <Edit3 size={14} />
                                            </button>
                                            <button className="btn btn-ghost btn-icon btn-sm kb-delete" onClick={() => deleteEntry(entry.id)}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <h4 className="kb-card-title">{entry.title}</h4>
                                    <p className="kb-card-content">{entry.content}</p>
                                    <span className="kb-card-date">{formatDate(entry.created_at)}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Add/Edit Modal */}
                    {showForm && (
                        <div className="modal-overlay" onClick={closeForm}>
                            <div className="modal glass-card" onClick={e => e.stopPropagation()}>
                                <div className="modal-header">
                                    <h3>{editingEntry ? 'Edit Entry' : 'Add Entry'}</h3>
                                    <button className="btn btn-ghost btn-icon" onClick={closeForm}>
                                        <X size={18} />
                                    </button>
                                </div>
                                <form className="modal-body" onSubmit={handleSave}>
                                    <div className="input-group">
                                        <label htmlFor="kb-title">Title</label>
                                        <input
                                            id="kb-title"
                                            className="input"
                                            type="text"
                                            placeholder="Entry title..."
                                            value={formData.title}
                                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label htmlFor="kb-content">Content</label>
                                        <textarea
                                            id="kb-content"
                                            className="input"
                                            placeholder="Entry content..."
                                            value={formData.content}
                                            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                                            required
                                            rows={5}
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label htmlFor="kb-type">Type</label>
                                        <select
                                            id="kb-type"
                                            className="input"
                                            value={formData.type}
                                            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                        >
                                            <option value="qa">Q&A</option>
                                            <option value="instruction">Instruction</option>
                                        </select>
                                    </div>
                                    <div className="modal-actions">
                                        <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
                                        <button type="submit" className="btn btn-primary" disabled={saving}>
                                            {saving ? (
                                                <div className="loader-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                                            ) : (
                                                <>
                                                    <Save size={14} />
                                                    {editingEntry ? 'Update' : 'Create'}
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </div>
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
                            <h3>No sessions found</h3>
                            <p>Chat sessions will appear here once users start conversations</p>
                        </div>
                    ) : (
                        <div className="sessions-table-wrapper">
                            <table className="sessions-table">
                                <thead>
                                    <tr>
                                        <th>Title</th>
                                        <th>Status</th>
                                        <th>Created</th>
                                        <th>Session ID</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sessions.map(session => (
                                        <tr key={session.id}>
                                            <td className="session-cell-title">{session.title || 'Untitled'}</td>
                                            <td>
                                                <span className={`badge ${session.status === 'active' ? 'badge-active' : 'badge-resolved'}`}>
                                                    {session.status}
                                                </span>
                                            </td>
                                            <td className="session-cell-date">{formatDate(session.created_at)}</td>
                                            <td className="session-cell-id">{session.id?.slice(0, 8)}...</td>
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
