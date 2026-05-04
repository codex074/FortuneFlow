import { get, set } from 'idb-keyval'

const USERS_KEY = 'fortuneflow-users'
const SESSION_KEY = 'fortuneflow-session'

export interface UserRecord {
  id: string
  username: string
  passwordHash: string
  createdAt: string
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function getUsers(): Promise<UserRecord[]> {
  return (await get<UserRecord[]>(USERS_KEY)) ?? []
}

async function saveUsers(users: UserRecord[]): Promise<void> {
  await set(USERS_KEY, users)
}

export async function register(username: string, password: string): Promise<UserRecord> {
  const users = await getUsers()

  if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    throw new Error('This username is already taken')
  }

  if (username.length < 3) {
    throw new Error('Username must be at least 3 characters')
  }

  if (password.length < 4) {
    throw new Error('Password must be at least 4 characters')
  }

  const user: UserRecord = {
    id: crypto.randomUUID(),
    username,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
  }

  users.push(user)
  await saveUsers(users)
  return user
}

export async function login(username: string, password: string): Promise<UserRecord> {
  const users = await getUsers()
  const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase())

  if (!user) {
    throw new Error('Invalid username or password')
  }

  const hash = await hashPassword(password)
  if (hash !== user.passwordHash) {
    throw new Error('Invalid username or password')
  }

  return user
}

export async function saveSession(userId: string): Promise<void> {
  await set(SESSION_KEY, userId)
}

export async function getSession(): Promise<UserRecord | null> {
  const userId = await get<string>(SESSION_KEY)
  if (!userId) return null

  const users = await getUsers()
  return users.find((u) => u.id === userId) ?? null
}

export async function clearSession(): Promise<void> {
  await set(SESSION_KEY, null)
}
