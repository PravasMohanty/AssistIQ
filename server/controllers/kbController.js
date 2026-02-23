const { supabase } = require('../config/supabase')
const getTime = require('../utils/getTime')
const { generateEmbedding, searchByEmbedding, resolveQuery } = require('../utils/vectorUtils')

const VALID_TYPES = ['instruction', 'qa']

const addKbContent = async (req, res) => {
    try {
        const { title, content, type, metadata } = req.body

        if (!title || !content || !type) {
            return res.status(400).json({ message: 'title, content and type are required' })
        }

        if (!VALID_TYPES.includes(type)) {
            return res.status(400).json({ message: `type must be one of: ${VALID_TYPES.join(', ')}` })
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
            return res.status(500).json({ message: 'Failed to insert knowledge base entry' })
        }

        return res.status(201).json({ message: 'Knowledge base entry added', data })
    } catch (error) {
        console.error('[addKbContent] Unexpected error:', error)
        return res.status(500).json({ message: 'Internal Server Error' })
    }
}

const searchKbContent = async (req, res) => {
    try {
        const { query } = req.body

        if (!query || typeof query !== 'string' || !query.trim()) {
            return res.status(400).json({ message: 'A non-empty query string is required' })
        }

        const queryEmbedding = await generateEmbedding(query.trim())

        // Run similarity search and fetch instructions in parallel
        const [similarResults, { data: instructions, error: instrError }] = await Promise.all([
            searchByEmbedding(queryEmbedding),
            supabase
                .from('knowledge_base')
                .select('id, title, content, type, metadata')
                .eq('type', 'instruction'),
        ])

        if (instrError) {
            console.error('[searchKbContent] Failed to fetch instructions:', instrError)
            return res.status(500).json({ message: 'Failed to fetch instructions' })
        }

        // Deduplicate — instructions already in similarity results shouldn't appear twice
        const similarIds = new Set(similarResults.map((r) => r.id))
        const uniqueInstructions = (instructions || []).filter((i) => !similarIds.has(i.id))

        const context = {
            instructions: uniqueInstructions,
            relevant: similarResults,
        }

        return res.status(200).json({ context })
    } catch (error) {
        console.error('[searchKbContent] Unexpected error:', error)
        return res.status(500).json({ message: 'Internal Server Error' })
    }
}

const resolveKbQuery = async (req, res) => {
    try {
        const { query, content } = req.body

        if (!query || !content) {
            return res.status(400).json({ message: 'query and content are required' })
        }

        if (typeof query !== 'string' || typeof content !== 'string') {
            return res.status(400).json({ message: 'query and content must be strings' })
        }

        const result = await resolveQuery(query.trim(), content.trim())

        return res.status(200).json({ result })
    } catch (error) {
        console.error('[resolveKbQuery] Unexpected error:', error)
        return res.status(500).json({ message: 'Internal Server Error' })
    }
}

module.exports = { addKbContent, searchKbContent, resolveKbQuery }
