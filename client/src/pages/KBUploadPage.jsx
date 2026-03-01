import { useState, useEffect, useCallback } from 'react'
import { kbAPI } from '../../api/kb'
import {
    Upload, Plus, Edit3, Trash2,
    X, Save, Database, Search, FileText, HelpCircle,
    CheckCircle, AlertCircle, RefreshCw, ChevronDown
} from 'lucide-react'
import './KBUploadPage.css'

const TOAST_DURATION = 3500

const Toast = ({ toasts }) => (
    <div className="kb-toast-stack">
        {toasts.map(t => (
            <div key={t.id} className={`kb-toast kb-toast--${t.type}`}>
                {t.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                <span>{t.message}</span>
            </div>
        ))}
    </div>
)

const KBUploadPage = () => {
    const [entries, setEntries] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [toasts, setToasts] = useState([])

    // Form state
    const [formData, setFormData] = useState({ title: '', content: '', type: 'qa', metadata: '' })
    const [editingId, setEditingId] = useState(null)
    const [saving, setSaving] = useState(false)
    const [formOpen, setFormOpen] = useState(false)

    // Toast helpers
    const addToast = useCallback((message, type = 'success') => {
        const id = Date.now()
        setToasts(prev => [...prev, { id, message, type }])
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), TOAST_DURATION)
    }, [])

    // Load entries
    const loadEntries = useCallback(async () => {
        try {
            setLoading(true)
            const res = await kbAPI.getAllEntries()
            const list = res.entries || res.data || res || []
            setEntries(Array.isArray(list) ? list : [])
        } catch (err) {
            console.error('Failed to load KB entries:', err)
            addToast('Failed to load entries', 'error')
        } finally {
            setLoading(false)
        }
    }, [addToast])

    useEffect(() => { loadEntries() }, [loadEntries])

    const openAddForm = () => {
        setEditingId(null)
        setFormData({ title: '', content: '', type: 'qa', metadata: '' })
        setFormOpen(true)
    }

    const openEditForm = (entry) => {
        setEditingId(entry.id)
        setFormData({
            title: entry.title || '',
            content: entry.content || '',
            type: entry.type || 'qa',
            metadata: entry.metadata ? JSON.stringify(entry.metadata, null, 2) : ''
        })
        setFormOpen(true)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const closeForm = () => {
        setFormOpen(false)
        setEditingId(null)
        setFormData({ title: '', content: '', type: 'qa', metadata: '' })
    }

    const parseMetadata = (raw) => {
        if (!raw || !raw.trim()) return {}
        try { return JSON.parse(raw) } catch { return {} }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!formData.title.trim() || !formData.content.trim()) return
        setSaving(true)
        try {
            const meta = parseMetadata(formData.metadata)
            if (editingId) {
                const res = await kbAPI.updateEntry(editingId, {
                    title: formData.title,
                    content: formData.content,
                    type: formData.type,
                    metadata: meta
                })
                const updated = res.data || { id: editingId, ...formData, metadata: meta }
                setEntries(prev => prev.map(e => e.id === editingId ? { ...e, ...updated } : e))
                addToast('Entry updated successfully')
            } else {
                const res = await kbAPI.addEntry(formData.title, formData.content, formData.type, meta)
                const created = res.data || res.entry || res
                setEntries(prev => [created, ...prev])
                addToast('Entry added to knowledge base')
            }
            closeForm()
        } catch (err) {
            console.error('Save error:', err)
            addToast(err?.response?.data?.error || 'Failed to save entry', 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this knowledge base entry? This cannot be undone.')) return
        try {
            await kbAPI.deleteEntry(id)
            setEntries(prev => prev.filter(e => e.id !== id))
            addToast('Entry deleted')
        } catch (err) {
            console.error('Delete error:', err)
            addToast('Failed to delete entry', 'error')
        }
    }

    const filteredEntries = entries.filter(e =>
        e.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.content?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const formatDate = (ts) => {
        if (!ts) return '—'
        return new Date(ts).toLocaleDateString([], {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        })
    }

    return (
        <div className="kbup-page fade-in">
            <Toast toasts={toasts} />

            {/* Header */}
            <div className="kbup-header">
                <div className="kbup-header-text">
                    <div className="kbup-header-icon">
                        <Database size={22} />
                    </div>
                    <div>
                        <h2>Knowledge Base</h2>
                        <p className="kbup-subtitle">
                            Upload and manage AI training content — {entries.length} {entries.length === 1 ? 'entry' : 'entries'} total
                        </p>
                    </div>
                </div>
                <div className="kbup-header-actions">
                    <button className="btn btn-secondary btn-sm" onClick={loadEntries} title="Refresh">
                        <RefreshCw size={14} />
                        Refresh
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={openAddForm}>
                        <Plus size={14} />
                        New Entry
                    </button>
                </div>
            </div>

            {/* Upload / Edit Form */}
            <div className={`kbup-form-panel glass-card ${formOpen ? 'kbup-form-panel--open' : ''}`}>
                <button className="kbup-form-toggle" onClick={() => formOpen ? closeForm() : openAddForm()}>
                    <span className="kbup-form-toggle-label">
                        <Upload size={15} />
                        {editingId ? 'Edit Knowledge Entry' : 'Upload New Knowledge'}
                    </span>
                    <ChevronDown size={16} className={`kbup-chevron ${formOpen ? 'kbup-chevron--up' : ''}`} />
                </button>

                {formOpen && (
                    <form className="kbup-form" onSubmit={handleSubmit}>
                        <div className="kbup-form-grid">
                            <div className="input-group kbup-field--title">
                                <label htmlFor="kbup-title">Title *</label>
                                <input
                                    id="kbup-title"
                                    className="input"
                                    type="text"
                                    placeholder="e.g. How to reset your password"
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="input-group kbup-field--type">
                                <label htmlFor="kbup-type">Type *</label>
                                <select
                                    id="kbup-type"
                                    className="input"
                                    value={formData.type}
                                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                                >
                                    <option value="qa">Q&amp;A</option>
                                    <option value="instruction">Instruction</option>
                                </select>
                            </div>

                            <div className="input-group kbup-field--content">
                                <label htmlFor="kbup-content">Content *</label>
                                <textarea
                                    id="kbup-content"
                                    className="input kbup-textarea"
                                    placeholder={formData.type === 'qa'
                                        ? 'Write the answer to this question...'
                                        : 'Write the instruction or guideline...'}
                                    value={formData.content}
                                    onChange={e => setFormData({ ...formData, content: e.target.value })}
                                    required
                                    rows={5}
                                />
                            </div>

                            <div className="input-group kbup-field--meta">
                                <label htmlFor="kbup-meta">
                                    Metadata <span className="kbup-optional">(optional JSON)</span>
                                </label>
                                <textarea
                                    id="kbup-meta"
                                    className="input kbup-textarea kbup-meta-input"
                                    placeholder='{"source": "docs", "version": "1.0"}'
                                    value={formData.metadata}
                                    onChange={e => setFormData({ ...formData, metadata: e.target.value })}
                                    rows={2}
                                />
                            </div>
                        </div>

                        <div className="kbup-form-actions">
                            {editingId && (
                                <button type="button" className="btn btn-secondary" onClick={closeForm}>
                                    <X size={14} />
                                    Cancel Edit
                                </button>
                            )}
                            <button type="submit" className="btn btn-primary" disabled={saving}>
                                {saving ? (
                                    <div className="loader-spinner" style={{ width: 15, height: 15, borderWidth: 2 }} />
                                ) : editingId ? (
                                    <><Save size={14} />Update Entry</>
                                ) : (
                                    <><Upload size={14} />Upload to Knowledge Base</>
                                )}
                            </button>
                        </div>
                    </form>
                )}
            </div>

            {/* Entries Section */}
            <div className="kbup-entries-section">
                <div className="kbup-entries-toolbar">
                    <div className="admin-search">
                        <Search size={15} />
                        <input
                            className="input"
                            type="text"
                            placeholder={`Search ${entries.length} entries...`}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="kbup-counts">
                        <span className="kbup-count-badge">
                            <FileText size={13} />
                            {entries.filter(e => e.type === 'qa').length} Q&A
                        </span>
                        <span className="kbup-count-badge kbup-count-badge--instruction">
                            <HelpCircle size={13} />
                            {entries.filter(e => e.type === 'instruction').length} Instructions
                        </span>
                    </div>
                </div>

                {loading ? (
                    <div className="kbup-loading">
                        <div className="loader-spinner" />
                        <p>Loading knowledge base...</p>
                    </div>
                ) : filteredEntries.length === 0 ? (
                    <div className="empty-state">
                        <Database size={40} />
                        <h3>{searchQuery ? 'No matching entries' : 'Knowledge base is empty'}</h3>
                        <p>
                            {searchQuery
                                ? `No entries match "${searchQuery}"`
                                : 'Start by uploading your first knowledge base entry above'}
                        </p>
                        {!searchQuery && (
                            <button className="btn btn-primary btn-sm" onClick={openAddForm}>
                                <Plus size={14} />
                                Upload First Entry
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="kb-grid">
                        {filteredEntries.map(entry => (
                            <div key={entry.id} className={`kb-card glass-card ${editingId === entry.id ? 'kb-card--editing' : ''}`}>
                                <div className="kb-card-header">
                                    <div className="kb-card-type">
                                        {entry.type === 'instruction'
                                            ? <FileText size={13} />
                                            : <HelpCircle size={13} />
                                        }
                                        <span className={`badge ${entry.type === 'instruction' ? 'badge-admin' : 'badge-active'}`}>
                                            {entry.type === 'instruction' ? 'Instruction' : 'Q&A'}
                                        </span>
                                    </div>
                                    <div className="kb-card-actions">
                                        <button
                                            className="btn btn-ghost btn-icon btn-sm"
                                            onClick={() => openEditForm(entry)}
                                            title="Edit entry"
                                        >
                                            <Edit3 size={13} />
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-icon btn-sm kb-delete"
                                            onClick={() => handleDelete(entry.id)}
                                            title="Delete entry"
                                        >
                                            <Trash2 size={13} />
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
            </div>
        </div>
    )
}

export default KBUploadPage
