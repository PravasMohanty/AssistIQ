import { useState, useEffect, useCallback, useRef } from 'react'
import { kbAPI } from '../../api/kb'
import {
    Upload, FileText, Trash2, Database, Search,
    CheckCircle, AlertCircle, RefreshCw, HardDrive,
    Layers, Clock, FileCode, Check, AlertTriangle
} from 'lucide-react'
import './KBUploadPage.css'

const TOAST_DURATION = 4000

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

    // File upload state
    const [selectedFile, setSelectedFile] = useState(null)
    const [uploading, setUploading] = useState(false)
    const [dragActive, setDragActive] = useState(false)
    const [syncingAll, setSyncingAll] = useState(false)
    const [reingestingId, setReingestingId] = useState(null)

    const fileInputRef = useRef(null)

    const addToast = useCallback((message, type = 'success') => {
        const id = Date.now()
        setToasts(prev => [...prev, { id, message, type }])
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), TOAST_DURATION)
    }, [])

    // Load documents from rag-service
    const loadEntries = useCallback(async () => {
        try {
            setLoading(true)
            const res = await kbAPI.getAllEntries()
            const list = res.entries || []
            setEntries(list)
            if (res.warning) {
                addToast(res.warning, 'error')
            }
        } catch (err) {
            console.error('Failed to load KB entries:', err)
            addToast('Failed to load knowledge base entries', 'error')
        } finally {
            setLoading(false)
        }
    }, [addToast])

    useEffect(() => {
        loadEntries()
    }, [loadEntries])

    // Drag and drop handlers
    const handleDrag = (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true)
        } else if (e.type === 'dragleave') {
            setDragActive(false)
        }
    }

    const handleDrop = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setDragActive(false)

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelection(e.dataTransfer.files[0])
        }
    }

    const handleFileInput = (e) => {
        if (e.target.files && e.target.files[0]) {
            handleFileSelection(e.target.files[0])
        }
    }

    const handleFileSelection = (file) => {
        const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
        if (ext !== '.txt' && ext !== '.md') {
            addToast('Only .txt and .md files are supported for knowledge base ingestion', 'error')
            return
        }
        setSelectedFile(file)
    }

    const handleUpload = async (e) => {
        e.preventDefault()
        if (!selectedFile) return

        setUploading(true)
        try {
            const res = await kbAPI.uploadFile(selectedFile)
            addToast(res.message || 'File uploaded and ingested into ChromaDB successfully')
            setSelectedFile(null)
            if (fileInputRef.current) fileInputRef.current.value = ''
            await loadEntries()
        } catch (err) {
            console.error('Upload error:', err)
            addToast(err?.response?.data?.error || err.message || 'Upload and ingestion failed', 'error')
        } finally {
            setUploading(false)
        }
    }

    const handleDelete = async (id, filename) => {
        if (!window.confirm(`Delete "${filename}"? This will remove the file from rag-service/data and purge all its vector chunks from ChromaDB.`)) {
            return
        }
        try {
            await kbAPI.deleteEntry(id)
            setEntries(prev => prev.filter(e => e.id !== id))
            addToast(`"${filename}" removed from knowledge base and ChromaDB`)
        } catch (err) {
            console.error('Delete error:', err)
            addToast(err?.response?.data?.error || 'Failed to delete file', 'error')
        }
    }

    const handleReingest = async (id, filename) => {
        setReingestingId(id)
        try {
            const res = await kbAPI.reingestEntry(id)
            addToast(res.message || `"${filename}" re-ingested successfully`)
            await loadEntries()
        } catch (err) {
            console.error('Re-ingest error:', err)
            addToast(err?.response?.data?.error || 'Failed to re-ingest file', 'error')
        } finally {
            setReingestingId(null)
        }
    }

    const handleSyncAll = async () => {
        setSyncingAll(true)
        try {
            const res = await kbAPI.syncEmbeddings()
            addToast(res.message || 'All documents synchronized successfully')
            await loadEntries()
        } catch (err) {
            console.error('Sync error:', err)
            addToast(err?.response?.data?.error || 'Failed to sync knowledge base', 'error')
        } finally {
            setSyncingAll(false)
        }
    }

    const filteredEntries = entries.filter(e =>
        e.filename?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.id?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const formatFileSize = (bytes) => {
        if (!bytes && bytes !== 0) return '—'
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    const formatDate = (ts) => {
        if (!ts) return '—'
        return new Date(ts).toLocaleDateString([], {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        })
    }

    const totalChunks = entries.reduce((acc, curr) => acc + (curr.chunks_count || 0), 0)

    return (
        <div className="kbup-page fade-in">
            <Toast toasts={toasts} />

            {/* Header */}
            <div className="kbup-header">
                <div className="kbup-header-text">
                    <div className="kbup-header-icon">
                        <Database size={24} />
                    </div>
                    <div>
                        <h2>Knowledge Base Management</h2>
                        <p className="kbup-subtitle">
                            Upload documents (.txt, .md) directly to <code>rag-service/data</code> with automatic ChromaDB vector indexing
                        </p>
                    </div>
                </div>
                <div className="kbup-header-actions">
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={handleSyncAll}
                        disabled={syncingAll || loading}
                        title="Re-index all documents in rag-service/data"
                    >
                        <RefreshCw size={14} className={syncingAll ? 'spin' : ''} />
                        {syncingAll ? 'Syncing...' : 'Sync All Embeddings'}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={loadEntries} title="Refresh list">
                        <RefreshCw size={14} className={loading ? 'spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="kbup-stats-grid">
                <div className="kbup-stat-card glass-card">
                    <div className="kbup-stat-icon">
                        <FileText size={18} />
                    </div>
                    <div className="kbup-stat-info">
                        <span className="kbup-stat-value">{entries.length}</span>
                        <span className="kbup-stat-label">Total Documents</span>
                    </div>
                </div>

                <div className="kbup-stat-card glass-card">
                    <div className="kbup-stat-icon kbup-stat-icon--chunks">
                        <Layers size={18} />
                    </div>
                    <div className="kbup-stat-info">
                        <span className="kbup-stat-value">{totalChunks}</span>
                        <span className="kbup-stat-label">Vector Chunks in Chroma</span>
                    </div>
                </div>

                <div className="kbup-stat-card glass-card">
                    <div className="kbup-stat-icon kbup-stat-icon--storage">
                        <HardDrive size={18} />
                    </div>
                    <div className="kbup-stat-info">
                        <span className="kbup-stat-value">rag-service/data</span>
                        <span className="kbup-stat-label">Storage Location</span>
                    </div>
                </div>
            </div>

            {/* Drag & Drop File Upload Section */}
            <div className="kbup-upload-panel glass-card">
                <div className="kbup-upload-title">
                    <Upload size={18} />
                    <h3>Upload New Document</h3>
                </div>

                <form onSubmit={handleUpload}>
                    <div
                        className={`kbup-dropzone ${dragActive ? 'kbup-dropzone--active' : ''} ${selectedFile ? 'kbup-dropzone--selected' : ''}`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".txt,.md"
                            onChange={handleFileInput}
                            style={{ display: 'none' }}
                        />

                        {selectedFile ? (
                            <div className="kbup-file-selected-view">
                                <div className="kbup-file-icon">
                                    {selectedFile.name.endsWith('.md') ? <FileCode size={32} /> : <FileText size={32} />}
                                </div>
                                <div className="kbup-file-details">
                                    <span className="kbup-file-name">{selectedFile.name}</span>
                                    <span className="kbup-file-meta">
                                        {formatFileSize(selectedFile.size)} • Click to choose a different file
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="kbup-dropzone-placeholder">
                                <div className="kbup-dropzone-icon">
                                    <Upload size={28} />
                                </div>
                                <p className="kbup-dropzone-prompt">
                                    <strong>Click to browse</strong> or drag and drop your document here
                                </p>
                                <p className="kbup-dropzone-sub">
                                    Supports <strong>.txt</strong> and <strong>.md</strong> files (up to 25MB)
                                </p>
                            </div>
                        )}
                    </div>

                    {selectedFile && (
                        <div className="kbup-upload-actions">
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedFile(null)
                                    if (fileInputRef.current) fileInputRef.current.value = ''
                                }}
                                disabled={uploading}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={uploading}
                            >
                                {uploading ? (
                                    <>
                                        <div className="loader-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                                        Chunking & Generating Embeddings via Ollama...
                                    </>
                                ) : (
                                    <>
                                        <Upload size={16} />
                                        Save to rag-service/data & Ingest
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </form>
            </div>

            {/* Document Library Section */}
            <div className="kbup-entries-section">
                <div className="kbup-entries-toolbar">
                    <div className="admin-search">
                        <Search size={16} />
                        <input
                            className="input"
                            type="text"
                            placeholder={`Search ${entries.length} documents in knowledge base...`}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="kbup-loading">
                        <div className="loader-spinner" />
                        <p>Loading documents from ChromaDB and rag-service/data...</p>
                    </div>
                ) : filteredEntries.length === 0 ? (
                    <div className="empty-state">
                        <Database size={40} />
                        <h3>{searchQuery ? 'No matching documents found' : 'No documents in knowledge base yet'}</h3>
                        <p>
                            {searchQuery
                                ? `No files match "${searchQuery}"`
                                : 'Upload your first .txt or .md handbook or policy document above to train the AI.'}
                        </p>
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
                                            title="Re-chunk and update embeddings in ChromaDB"
                                        >
                                            <RefreshCw size={14} className={reingestingId === entry.id ? 'spin' : ''} />
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-icon btn-sm kb-delete"
                                            onClick={() => handleDelete(entry.id, entry.filename)}
                                            title="Delete document and remove its chunks"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                <h4 className="kb-card-title">{entry.filename}</h4>

                                <div className="kb-card-meta-row">
                                    <span className="kb-meta-item">
                                        <HardDrive size={12} />
                                        {formatFileSize(entry.size_bytes)}
                                    </span>
                                    <span className="kb-meta-item">
                                        <Layers size={12} />
                                        {entry.chunks_count} {entry.chunks_count === 1 ? 'chunk' : 'chunks'}
                                    </span>
                                    <span className="kb-meta-item">
                                        <Clock size={12} />
                                        {formatDate(entry.created_at)}
                                    </span>
                                </div>

                                <div className="kb-card-status">
                                    {entry.chunks_count > 0 ? (
                                        <span className="kb-badge-ingested">
                                            <Check size={12} /> Ingested & Active in Chroma
                                        </span>
                                    ) : (
                                        <span className="kb-badge-pending">
                                            <AlertTriangle size={12} /> Pending Ingestion
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

export default KBUploadPage
