const axios = require('axios')

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://127.0.0.1:8000'

const queryRAG = async (question, top_k = 5) => {
    const response = await axios.post(
        `${RAG_SERVICE_URL}/query`,
        {
            question,
            top_k
        }
    )

    return response.data
}

module.exports = {
    queryRAG
}