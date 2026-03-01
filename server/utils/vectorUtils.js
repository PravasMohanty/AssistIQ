const { supabase } = require('../config/supabase')

const OLLAMA_BASE_URL = 'http://localhost:11434'

const prompt = (content) => {
    return `
Role: Consider yourself as a top notch Customer Support Assistant who specializes in resolving
customer queries with maximum efficiency and best result
Task: Take the context of ${content} and respond to the user query in a concise and professional manner
Do not give un necessary instructions if specifically not asked for by the user. Guide only if the user 
asks to with a series of options or steps. If not prompted directly , dont give it in the response.
Notes: Only refer to the context provided and do not search for any other information
Any infomation scavenging on the internet is strictly prohibited, You can only refer to the context provided
provided to get a efficient solution to user's query
`
}

const generateEmbedding = async (text) => {
    console.log('[vectorUtils] Generating embedding for text:', text.substring(0, 80) + '...')

    // Add a timeout so the request doesn't hang forever if Ollama is down
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout

    try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'nomic-embed-text',
                prompt: text,
            }),
            signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
            const errorText = await response.text()
            console.error('[vectorUtils] Ollama embedding error:', response.status, errorText)
            throw new Error(`Failed to generate embedding: ${response.status} ${errorText}`)
        }

        const data = await response.json()
        const embedding = data.embedding

        if (!embedding || embedding.length !== 768) {
            throw new Error(`Unexpected dimensions: got ${embedding?.length}, expected 768`)
        }

        console.log('[vectorUtils] ✅ Embedding generated successfully (768 dims)')
        return embedding
    } catch (err) {
        clearTimeout(timeoutId)
        if (err.name === 'AbortError') {
            console.error('[vectorUtils] ❌ Ollama embedding request timed out after 15s. Is Ollama running?')
            throw new Error('Embedding generation timed out. Make sure Ollama is running at ' + OLLAMA_BASE_URL)
        }
        // Connection refused = Ollama not running
        if (err.cause?.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
            console.error('[vectorUtils] ❌ Cannot connect to Ollama at', OLLAMA_BASE_URL, '- Is it running?')
            throw new Error('Cannot connect to Ollama. Make sure Ollama is running: ollama serve')
        }
        throw err
    }
}

const searchByEmbedding = async (queryEmbedding, topK = 5) => {
    const { data, error } = await supabase.rpc('search_knowledge_base', {
        query_embedding: queryEmbedding,
        top_k: topK
    })
    if (error) {
        throw new Error("Error searching knowledge base: " + error.message);
    }
    return data;
}


const resolveQuery = async (query, content) => {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'mistral',
            stream: false,
            messages: [
                {
                    role: 'system',
                    content: prompt(content)
                },
                {
                    role: 'user',
                    content: query
                }
            ]
        })
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to generate response: ${errorText}`)
    }

    const data = await response.json()
    const reply = data.message?.content
    if (!reply) {
        console.warn('[resolveQuery] Unexpected LLM response shape:', JSON.stringify(data))
        return 'Sorry, I was unable to generate a response. Please try again.'
    }
    return reply
}

module.exports = { generateEmbedding, searchByEmbedding, resolveQuery }
