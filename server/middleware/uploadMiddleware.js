const multer = require('multer')
const path = require('path')
const fs = require('fs')

const RAG_DATA_DIR = path.resolve(__dirname, '../../rag-service/data')

// Ensure data directory exists
if (!fs.existsSync(RAG_DATA_DIR)) {
    fs.mkdirSync(RAG_DATA_DIR, { recursive: true })
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, RAG_DATA_DIR)
    },
    filename: (req, file, cb) => {
        // Sanitize original filename (keep extension, alphanumeric, dashes, underscores, dots)
        const parsed = path.parse(file.originalname)
        const cleanName = parsed.name
            .trim()
            .replace(/[^a-zA-Z0-9_\-\s]/g, '')
            .replace(/\s+/g, '_') || 'document'
        const ext = parsed.ext.toLowerCase()
        cb(null, `${cleanName}${ext}`)
    }
})

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (ext === '.txt' || ext === '.md') {
        cb(null, true)
    } else {
        cb(new Error('Only .txt and .md files are supported for Knowledge Base ingestion'), false)
    }
}

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 25 * 1024 * 1024 // 25MB limit
    }
})

module.exports = {
    upload,
    RAG_DATA_DIR
}
