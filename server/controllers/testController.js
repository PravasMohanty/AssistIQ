const { login } = require('./authController')

const runLoginCheck = async (req, res, requireAdmin = false) => {
    let status = 200
    let body

    await login(req, {
        status(code) {
            status = code
            return this
        },
        json(responseBody) {
            body = responseBody
            return this
        }
    })

    if (status !== 200) {
        return res.status(status).json(body)
    }

    if (requireAdmin && body.user.role !== 'admin') {
        return res.status(403).json({ status: 'error', error: 'Admin access required' })
    }

    return res.status(200).json({
        ...(requireAdmin ? { is_admin: true } : {}),
        user: body.user,
        token: body.access_token
    })
}

const testUserLogin = (req, res) => runLoginCheck(req, res)
const testAdminLogin = (req, res) => runLoginCheck(req, res, true)

module.exports = { testUserLogin, testAdminLogin }