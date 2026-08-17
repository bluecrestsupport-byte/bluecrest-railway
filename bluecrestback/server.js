require('dotenv').config();

const activityRoutes =
    require('./src/routes/activity.routes');
const http = require('http');

const initializeDatabase =
    require('./src/database/init');

const userRoutes =
    require('./src/routes/user.routes');

const transactionRoutes =
    require(
        './src/routes/transaction.routes'
    );


const loanRoutes =
    require('./src/routes/loan.routes');
const cardRoutes =
    require('./src/routes/card.routes');


const authRoutes =
    require('./src/routes/auth.routes');

const transferRoutes =
    require('./src/routes/transfer.routes');


const adminRoutes =
    require('./src/routes/admin.routes');

const sandboxRoutes =
    require('./src/routes/sandbox.routes');

const notificationRoutes =
    require('./src/routes/notification.routes');

const emailRoutes =
    require('./src/routes/email.routes');

const withdrawalRoutes =
    require('./src/routes/withdrawal.routes');
const withdrawalAccountRoutes =
    require('./src/routes/withdrawal-account.routes');
const transferVerificationRoutes =
    require('./src/routes/transfer-verification.routes');

const marketRoutes =
    require('./src/routes/market.routes');
const depositRoutes = require('./src/routes/deposit.routes');
const supportRoutes = require('./src/routes/support.routes');
const supportAttachmentStorage = require('./src/services/support-attachment.service');
const jointAccountRoutes = require('./src/routes/joint-account.routes');



const {
    successResponse,
    errorResponse
} = require('./src/utils/response');
const db = require('./src/database/db');

const PORT = process.env.PORT || 4000;

const server = http.createServer((req, res) => {

    // CORS preflight handling
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400'
        });
        return res.end();
    }

    let body = '';
    let bodyBytes = 0;
    let bodyTooLarge = false;
    const requestBodyLimit = req.url === '/api/v1/support/messages'
        ? 5 * 1024 * 1024
        : 20 * 1024 * 1024;

    req.on('data', chunk => {
        if (bodyTooLarge) return;
        bodyBytes += chunk.length;
        if (bodyBytes > requestBodyLimit) {
            bodyTooLarge = true;
            body = '';
            return errorResponse(
                res,
                req.url === '/api/v1/support/messages'
                    ? 'Support messages and images must be 5 MB or smaller'
                    : 'Request body is too large',
                413
            );
        }
        body += chunk.toString();
    });

    req.on('end', async () => {
        if (bodyTooLarge) return;
        try {
            try {
                body = body
                    ? JSON.parse(body)
                    : {};
            } catch {
                body = {};
            }

        // HEALTH ROUTE
        if (req.url === '/health' || req.url === '/api/v1/health') {

            return successResponse(
                res,
                {
                    api_version: 2,
                    database_provider: db.PROVIDER,
                    database_location: db.DATABASE_LOCATION,
                    database_persistent: db.IS_PERSISTENT,
                    database_storage_mode: db.STORAGE_MODE,
                    capabilities: [
                        'auth',
                        'loans',
                        'card_applications'
                    ]
                },
                'Backend running'
            );
        }

        // USER ROUTES
        const userRouteHandled =
            await userRoutes(req, res, body);

        if (userRouteHandled !== false) {
            return;
        }

        // AUTH ROUTES
        const authRouteHandled =
            await authRoutes(req, res, body);

        if (authRouteHandled !== false) {
            return;
        }

        // DEVELOPER SANDBOX
        const sandboxRouteHandled =
            await sandboxRoutes(req, res, body);

        if (sandboxRouteHandled !== false) {
            return;
        }

        const notificationRouteHandled =
            await notificationRoutes(req, res, body);

        if (notificationRouteHandled !== false) {
            return;
        }

        const depositRouteHandled = await depositRoutes(req, res, body);
        if (depositRouteHandled !== false) return;

        const supportRouteHandled = await supportRoutes(req, res, body);
        if (supportRouteHandled !== false) return;

        const jointAccountRouteHandled = await jointAccountRoutes(req, res, body);
        if (jointAccountRouteHandled !== false) return;

        const emailRouteHandled =
            await emailRoutes(req, res, body);

        if (emailRouteHandled !== false) {
            return;
        }

        const withdrawalRouteHandled =
            await withdrawalRoutes(req, res, body);

        if (withdrawalRouteHandled !== false) {
            return;
        }

        const withdrawalAccountRouteHandled =
            await withdrawalAccountRoutes(req, res, body);

        if (withdrawalAccountRouteHandled !== false) {
            return;
        }

        const transferVerificationRouteHandled =
            await transferVerificationRoutes(req, res, body);

        if (transferVerificationRouteHandled !== false) {
            return;
        }

        const marketRouteHandled =
            await marketRoutes(req, res);

        if (marketRouteHandled !== false) {
            return;
        }


        //TRANSFERS ROUTES

        if (
            await transactionRoutes(
                req,
                res,
                body
            )
        ) {
            return;
        }

        if (
            await loanRoutes(
                req,
                res,
                body
            )
        ) {
            return;
        }

        const cardRouteHandled = await cardRoutes(req, res, body);
        if (cardRouteHandled !== false) {
            return;
        }

        // TRANSFER ROUTES
        const transferRouteHandled =
            await transferRoutes(req, res, body);

        if (transferRouteHandled !== false) {
            return;
        }
        const activityRouteHandled =
            await activityRoutes(req, res);

        if (activityRouteHandled !== false) {
            return;
        }

        const adminRouteHandled =
            await adminRoutes(req, res);

        if (adminRouteHandled !== false) {
            return;
        }

        // 404
            return errorResponse(
                res,
                'Route not found',
                404
            );
        } catch (error) {
            console.error(
                `Unhandled API request error: ${req.method} ${req.url}`,
                error
            );

            if (!res.headersSent) {
                return errorResponse(
                    res,
                    'Internal server error',
                    500
                );
            }

            if (!res.writableEnded) {
                res.end();
            }
        }
    });
});








// START DATABASE + SERVER
(async () => {
    await initializeDatabase();
    await supportAttachmentStorage.ensureUploadDirectory();

    server.listen(PORT, () => {
        console.log(`Database provider: ${db.PROVIDER}`);
        console.log(`Database location: ${db.DATABASE_LOCATION}`);
        console.log(`Database persistent: ${db.IS_PERSISTENT} (${db.STORAGE_MODE})`);
        console.log(`Server running on port ${PORT}`);
    });
})().catch(error => {
    console.error('Backend startup failed:', error);
    process.exit(1);
});
