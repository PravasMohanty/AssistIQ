const TOKEN_KEY = 'assistiq_access_token'

export const AUTH_UNAUTHORIZED_EVENT = 'assistiq:unauthorized'

export const getToken = () => localStorage.getItem(TOKEN_KEY)

export const setToken = (token) => {
    localStorage.setItem(TOKEN_KEY, token)
}

export const clearToken = () => {
    localStorage.removeItem(TOKEN_KEY)
}

export const notifyUnauthorized = () => {
    window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT))
}