const { supabase } = require('../config/supabase')
const { generateEmbedding, searchByEmbedding, resolveQuery } = require('../utils/vectorUtils')

const VALID_TYPES = ['instruction', 'qa']

const addKbContent = async (req, res) => {
    try {
        console.log('[addKbContent] 📥 Request received')
        const { title, content, type, metadata } = req.body

        if (!title || !content || !type) {
            console.log('[addKbContent] ❌ Validation failed: missing title/content/type')
            return res.status(400).json({ status: 'error', error: 'title, content and type are required' })
        }

        if (!VALID_TYPES.includes(type)) {
            return res.status(400).json({ status: 'error', error: `type must be one of: ${VALID_TYPES.join(', ')}` })
        }

        if (metadata !== undefined && metadata !== null && (typeof metadata !== 'object' || Array.isArray(metadata))) {
            return res.status(400).json({ status: 'error', error: 'metadata must be a JSON object if provided' })
        }

        console.log('[addKbContent] 🔄 Generating embedding via Ollama...')
        const embedding = await generateEmbedding(`${title} ${content}`)
        console.log('[addKbContent] ✅ Embedding generated')

        console.log('[addKbContent] 💾 Inserting into Supabase...')
        const { data, error } = await supabase
            .from('knowledge_base')
            .insert({
                title,
                content,
                type,
                metadata: metadata || null,
                embedding,
            })
            .select()
            .single()

        if (error) {
            console.error('[addKbContent] ❌ Supabase insert error:', error)
            return res.status(500).json({ status: 'error', error: 'Failed to insert knowledge base entry' })
        }

        console.log('[addKbContent] ✅ Entry added successfully:', data?.id)
        return res.status(201).json({ status: 'success', message: 'Knowledge base entry added', data })
    } catch (error) {
        console.error('[addKbContent] ❌ Unexpected error:', error.message || error)
        return res.status(500).json({ status: 'error', error: error.message || 'Internal Server Error' })
    }
}

const getAllKbEntries = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('knowledge_base')
            .select('id, title, content, type, metadata, created_at')
            .order('created_at', { ascending: false })

        if (error) {
            console.error('[getAllKbEntries] Supabase error:', error)
            return res.status(500).json({ status: 'error', error: 'Failed to fetch knowledge base entries' })
        }

        return res.status(200).json({ status: 'success', entries: data || [] })
    } catch (error) {
        console.error('[getAllKbEntries] Unexpected error:', error)
        return res.status(500).json({ status: 'error', error: 'Internal Server Error' })
    }
}

const updateKbEntry = async (req, res) => {
    try {
        const { id } = req.params
        const { title, content, type, metadata } = req.body

        if (!id) {
            return res.status(400).json({ status: 'error', error: 'Entry id is required' })
        }

        if (type && !VALID_TYPES.includes(type)) {
            return res.status(400).json({ status: 'error', error: `type must be one of: ${VALID_TYPES.join(', ')}` })
        }

        // Build update payload
        const updatePayload = {}
        if (title !== undefined) updatePayload.title = title
        if (content !== undefined) updatePayload.content = content
        if (type !== undefined) updatePayload.type = type
        if (metadata !== undefined) updatePayload.metadata = metadata

        // Re-generate embedding if title or content changed
        if (title || content) {
            // Fetch current entry to combine with partial update
            const { data: current } = await supabase
                .from('knowledge_base')
                .select('title, content')
                .eq('id', id)
                .single()

            const newTitle = title || current?.title || ''
            const newContent = content || current?.content || ''
            updatePayload.embedding = await generateEmbedding(`${newTitle} ${newContent}`)
        }

        const { data, error } = await supabase
            .from('knowledge_base')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .single()

        if (error) {
            console.error('[updateKbEntry] Supabase error:', error)
            return res.status(500).json({ status: 'error', error: 'Failed to update knowledge base entry' })
        }

        return res.status(200).json({ status: 'success', message: 'Knowledge base entry updated', data })
    } catch (error) {
        console.error('[updateKbEntry] Unexpected error:', error)
        return res.status(500).json({ status: 'error', error: 'Internal Server Error' })
    }
}

const deleteKbEntry = async (req, res) => {
    try {
        const { id } = req.params

        if (!id) {
            return res.status(400).json({ status: 'error', error: 'Entry id is required' })
        }

        const { error } = await supabase
            .from('knowledge_base')
            .delete()
            .eq('id', id)

        if (error) {
            console.error('[deleteKbEntry] Supabase error:', error)
            return res.status(500).json({ status: 'error', error: 'Failed to delete knowledge base entry' })
        }

        return res.status(200).json({ status: 'success', message: 'Knowledge base entry deleted' })
    } catch (error) {
        console.error('[deleteKbEntry] Unexpected error:', error)
        return res.status(500).json({ status: 'error', error: 'Internal Server Error' })
    }
}

// Internal: core search logic, callable without req/res
const _searchKb = async (query) => {
    const queryEmbedding = await generateEmbedding(query.trim())

    const [similarResults, { data: instructions, error: instrError }] = await Promise.all([
        searchByEmbedding(queryEmbedding),
        supabase
            .from('knowledge_base')
            .select('id, title, content, type, metadata')
            .eq('type', 'instruction'),
    ])

    if (instrError) {
        throw new Error(`Failed to fetch instructions: ${instrError.message}`)
    }

    const similarIds = new Set(similarResults.map((r) => r.id))
    const uniqueInstructions = (instructions || []).filter((i) => !similarIds.has(i.id))

    return {
        instructions: uniqueInstructions,
        relevant: similarResults,
    }
}

const searchKbContent = async (req, res) => {
    try {
        const { query } = req.body

        if (!query || typeof query !== 'string' || !query.trim()) {
            return res.status(400).json({ status: 'error', error: 'A non-empty query string is required' })
        }

        const context = await _searchKb(query)

        return res.status(200).json({ status: 'success', context })
    } catch (error) {
        console.error('[searchKbContent] Unexpected error:', error)
        return res.status(500).json({ status: 'error', error: 'Internal Server Error' })
    }
}

// Internal: core resolve logic, callable without req/res
const _resolveKb = async (query, content) => {
    return await resolveQuery(query.trim(), content.trim())
}

const resolveKbQuery = async (req, res) => {
    try {
        const { query, content } = req.body

        if (!query || !content) {
            return res.status(400).json({ status: 'error', error: 'query and content are required' })
        }

        if (typeof query !== 'string' || typeof content !== 'string') {
            return res.status(400).json({ status: 'error', error: 'query and content must be strings' })
        }

        const result = await _resolveKb(query, content)

        return res.status(200).json({ status: 'success', result })
    } catch (error) {
        console.error('[resolveKbQuery] Unexpected error:', error)
        return res.status(500).json({ status: 'error', error: 'Internal Server Error' })
    }
}

// Sync embeddings for all KB entries (re-generate embeddings, useful after model changes)
const syncEmbeddings = async (req, res) => {
    try {
        const { data: entries, error: fetchError } = await supabase
            .from('knowledge_base')
            .select('id, title, content')

        if (fetchError) {
            console.error('[syncEmbeddings] Fetch error:', fetchError)
            return res.status(500).json({ status: 'error', error: 'Failed to fetch entries' })
        }

        if (!entries || entries.length === 0) {
            return res.status(200).json({ status: 'success', message: 'No entries to sync', synced: 0 })
        }

        let synced = 0
        for (const entry of entries) {
            try {
                const embedding = await generateEmbedding(`${entry.title || ''} ${entry.content || ''}`)
                const { error: updateError } = await supabase
                    .from('knowledge_base')
                    .update({ embedding })
                    .eq('id', entry.id)

                if (!updateError) synced++
            } catch (err) {
                console.error(`[syncEmbeddings] Failed for entry ${entry.id}:`, err.message)
            }
        }

        return res.status(200).json({ status: 'success', message: `Synced ${synced} of ${entries.length} entries`, synced })
    } catch (error) {
        console.error('[syncEmbeddings] Unexpected error:', error)
        return res.status(500).json({ status: 'error', error: 'Internal Server Error' })
    }
}

module.exports = { addKbContent, getAllKbEntries, updateKbEntry, deleteKbEntry, searchKbContent, resolveKbQuery, syncEmbeddings, _searchKb, _resolveKb }
