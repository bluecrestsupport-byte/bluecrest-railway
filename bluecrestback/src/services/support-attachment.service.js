const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MIME_EXTENSIONS = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
};

function uploadRoot() {
    const defaultDirectory = process.env.RAILWAY_ENVIRONMENT
        ? '/app/data/support-uploads'
        : path.join(process.cwd(), '.local-data', 'support-uploads');
    return path.resolve(
        process.env.SUPPORT_UPLOAD_DIR || defaultDirectory
    );
}

async function ensureUploadDirectory() {
    const root = uploadRoot();
    await fs.promises.mkdir(root, { recursive: true });
    return root;
}

function hasValidSignature(buffer, mimeType) {
    if (mimeType === 'image/jpeg') {
        return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (mimeType === 'image/png') {
        return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (mimeType === 'image/webp') {
        return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    }
    return false;
}

function prepareAttachment(input) {
    if (!input || typeof input !== 'object') return null;
    const dataUrl = String(input.data_url || '');
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (!match) throw new Error('Upload a JPEG, PNG, or WebP support image');

    const mimeType = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0 || buffer.length > MAX_ATTACHMENT_BYTES) {
        throw new Error('Support images must be 3 MB or smaller');
    }
    if (!hasValidSignature(buffer, mimeType)) {
        throw new Error('The uploaded support image is invalid or does not match its file type');
    }

    const originalName = path.basename(String(input.name || `support-image.${MIME_EXTENSIONS[mimeType]}`))
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .slice(0, 160) || `support-image.${MIME_EXTENSIONS[mimeType]}`;

    return {
        buffer,
        mime_type: mimeType,
        byte_size: buffer.length,
        original_name: originalName,
        storage_key: `${crypto.randomUUID()}.${MIME_EXTENSIONS[mimeType]}`
    };
}

async function saveAttachment(prepared) {
    const root = await ensureUploadDirectory();
    const filePath = path.resolve(root, prepared.storage_key);
    if (path.dirname(filePath) !== root) throw new Error('Invalid support attachment storage key');
    await fs.promises.writeFile(filePath, prepared.buffer, { flag: 'wx' });
    return prepared.storage_key;
}

async function deleteAttachment(storageKey) {
    if (!storageKey) return;
    try {
        await fs.promises.unlink(resolveAttachmentPath(storageKey));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
}

function resolveAttachmentPath(storageKey) {
    const root = uploadRoot();
    const filePath = path.resolve(root, String(storageKey || ''));
    if (path.dirname(filePath) !== root) throw new Error('Invalid support attachment storage key');
    return filePath;
}

module.exports = {
    MAX_ATTACHMENT_BYTES,
    ensureUploadDirectory,
    prepareAttachment,
    saveAttachment,
    deleteAttachment,
    resolveAttachmentPath
};
