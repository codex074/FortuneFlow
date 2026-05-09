import { type Request, type Response, type NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthPayload {
  userId: number
  email: string
}

export interface AuthRequest extends Request {
  user?: AuthPayload
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization token' })
    return
  }

  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload
    req.user = payload
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '30d' })
}
