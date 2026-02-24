const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const { generateEmbedding, resolveQuery } = require('./vectorUtils')

const testEmbedding = async () => {
    console.log('--- Testing Embedding Generation ---')
    try {
        const embedding = await generateEmbedding('Hello AssistIQ')
        console.log('Embedding generated successfully')
        console.log('Dimensions:', embedding.length)
    } catch (err) {
        console.error('Embedding failed:', err.message)
    }
}

const testQueryResolution = async () => {
    console.log('\n--- Testing Query Resolution ---')
    try {
        const query = "What is the return policy?"
        const context = "Customers can return any item within 30 days of purchase for a full refund."
        console.log('Query:', query)
        console.log('Context:', context)

        const response = await resolveQuery(query, context)
        console.log('\nResponse received:')
        console.log(response)
    } catch (err) {
        console.error('Query resolution failed:', err.message)
    }
}

const runTests = async () => {
    await testEmbedding()
    await testQueryResolution()
}

runTests()