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
    const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'nomic-embed-text',
            prompt: text,
        }),
    })

    if (!response.ok) {
        throw new Error('Failed to generate embedding')
    }

    const data = await response.json()
    const embedding = data.embedding

    if (!embedding || embedding.length !== 768) {
        throw new Error(`Unexpected dimensions: got ${embedding?.length}, expected 768`)
    }
    return embedding
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
