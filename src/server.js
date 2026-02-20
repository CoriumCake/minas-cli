import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fileUpload from 'express-fileupload';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRouter from './routes/authRoute.js';
import fsRouter from './routes/fsRoute.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startServer() {
    const app = express();
    const port = process.env.PORT || 3000;

    // Trust Proxy setting so that express-rate-limit can see the X-Forwarded-For header
    // from Localtunnel / Ngrok
    app.set('trust proxy', 1);

    // Security Headers (OWASP A05)
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                "script-src": ["'self'", "https://unpkg.com"],
                "img-src": ["'self'", "data:", "https://*"],
                "connect-src": ["'self'", "https://*"]
            }
        }
    }));

    // Rate Limiting (OWASP A07)
    const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 20,
        message: { error: 'Too many attempts, please try again later.' },
        standardHeaders: true,
        legacyHeaders: false
    });

    app.use(cors());
    app.use(express.json());
    app.use(fileUpload({
        limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10GB limit
        abortOnLimit: true
    }));

    // Protect sensitive routes
    app.use('/api/auth/login', authLimiter);

    app.use('/api/auth', authRouter);
    app.use('/api/fs', fsRouter);

    // Serve static files from 'public' directory
    app.use(express.static(path.join(process.cwd(), 'public')));

    // Basic API ping
    app.get('/api/ping', (req, res) => {
        res.json({ status: 'ok' });
    });

    return new Promise((resolve, reject) => {
        const server = app.listen(port, () => {
            resolve({ server, port });
        }).on('error', (err) => {
            reject(err);
        });
    });
}
