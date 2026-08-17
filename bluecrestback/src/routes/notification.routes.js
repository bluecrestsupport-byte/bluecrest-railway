const { requireAuth } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/admin.middleware');
const { successResponse, errorResponse } = require('../utils/response');
const notificationService = require('../services/notification.service');

async function notificationRoutes(req, res, body) {
    try {
        if (req.method === 'GET' && req.url === '/api/v1/notifications/unread-count') {
            if (!await requireAuth(req, res)) return true;
            const count = await notificationService.getUnreadCount(req.user.id);
            return successResponse(res, { count }, 'Unread notification count fetched');
        }

        if (req.method === 'GET' && req.url === '/api/v1/notifications') {
            if (!await requireAuth(req, res)) return true;
            const notifications = await notificationService.listForUser(req.user.id);
            return successResponse(res, notifications, 'Notifications fetched');
        }

        if (req.method === 'PATCH' && req.url === '/api/v1/notifications/read-all') {
            if (!await requireAuth(req, res)) return true;
            await notificationService.markAllRead(req.user.id);
            return successResponse(res, null, 'All notifications marked as read');
        }

        if (req.method === 'PATCH' && /^\/api\/v1\/notifications\/\d+\/read$/.test(req.url)) {
            if (!await requireAuth(req, res)) return true;
            const id = req.url.split('/')[4];
            const notification = await notificationService.markRead(id, req.user.id);
            return successResponse(res, notification, 'Notification marked as read');
        }

        if (req.method === 'POST' && req.url === '/api/v1/admin/notifications') {
            if (!await requireAdmin(req, res)) return true;
            const result = await notificationService.sendNotification(req.user, body);
            return successResponse(res, result, 'Notification sent', 201);
        }
    } catch (error) {
        return errorResponse(res, error.message, 400);
    }
    return false;
}

module.exports = notificationRoutes;
