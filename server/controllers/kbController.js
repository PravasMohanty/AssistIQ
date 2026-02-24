const { supabase } = require('../config/supabase')
const getTime = require('../utils/getTime')
const { generateEmbedding, searchByEmbedding, resolveQuery } = require('../utils/vectorUtils')

const VALID_TYPES = ['instruction', 'qa']

const addKbContent = async (req, res) => {
    try {
        const { title, content, type, metadata } = req.body

        if (!title || !content || !type) {
            return res.status(400).json({ status: 'error', error: 'title, content and type are required' })
        }

        if (!VALID_TYPES.includes(type)) {
            return res.status(400).json({ status: 'error', error: `type must be one of: ${VALID_TYPES.join(', ')}` })
        }

        const embedding = await generateEmbedding(`${title} ${content}`)

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
            console.error('[addKbContent] Supabase insert error:', error)
            return res.status(500).json({ status: 'error', error: 'Failed to insert knowledge base entry' })
        }

        return res.status(201).json({ status: 'success', message: 'Knowledge base entry added', data })
    } catch (error) {
        console.error('[addKbContent] Unexpected error:', error)
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

module.exports = { addKbContent, searchKbContent, resolveKbQuery, _searchKb, _resolveKb }
