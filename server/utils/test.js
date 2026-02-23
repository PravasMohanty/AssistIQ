const OLLAMA_BASE_URL = 'http://localhost:11434'

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
    if (!data.embedding || data.embedding.length !== 768) {
        throw new Error(`Unexpected dimensions: got ${data.embedding?.length}, expected 768`)
    }
    return data.embedding
}
const soln = generateEmbedding("Hello world")
soln.then((res) => {
    console.log(res)
}).catch((err) => {
    console.log(err)
})