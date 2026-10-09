// const { queryRAG } = require('./utils/ragClient')
const { queryRAG } = require('./utils/ragClient')

const test = async () => {
    try {
        const result = await queryRAG(
            'How many days can employees work remotely?',
            5
        )

        console.log('RAG Response:')
        console.log(result)
    } catch (error) {
        console.error('RAG request failed:')
        console.error(error.response?.data || error.message)
    }
}

test()