import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getConfig, getJwtSecret, getBannedDevices } from './config.js';

export async function hashPassword(password) {
    return await bcrypt.hash(password, 10);
}

export async function comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

export async function generateToken(payload) {
    const secret = await getJwtSecret();
    return jwt.sign(payload, secret, { expiresIn: '365d' });
}

export async function requireAuth(req, res, next) {
    const deviceId = req.headers['x-device-id'] || req.query['X-Device-Id'];
    const bannedDevices = await getBannedDevices();

    if (deviceId && bannedDevices.includes(deviceId)) {
        return res.status(403).json({ error: 'Device is banned' });
    }

    let token = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }

    try {
        const secret = await getJwtSecret();
        const decoded = jwt.verify(token, secret);
        req.user = decoded;
        req.deviceId = deviceId;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
}
