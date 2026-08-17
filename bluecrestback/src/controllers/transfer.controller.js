const activityService =
    require('../services/activity.service');

const transferService =
    require('../services/transfer.service');

const {
    successResponse,
    errorResponse
} = require('../utils/response');

async function create(req, res, body) {

    console.log(
        'TRANSFER BODY:',
        body
    );

    console.log(
        'AUTH USER:',
        req.user
    );

    try {

        console.log(
            'CALLING TRANSFER SERVICE'
        );

        const transfers =
            await transferService
                .createTransfer(
                    req.user,
                    body
                );

        await activityService.logActivity({
            user_id: req.user.id,
            type: 'TRANSFER_CREATED',
            description:
                `Transfer of ${body.amount} created`
        });

        return successResponse(
            res,
            transfers,
            'Transfer created successfully',
            201
        );

    } catch (error) {

        console.error(
            'TRANSFER ERROR:',
            error
        );

        return errorResponse(
            res,
            error.message,
            400
        );
    }
}

async function recover(req, res, body) {
    try {
        const transfer = await transferService.recoverTransfer(body, req.user.id);
        await activityService.logActivity({
            user_id: body.sender_id,
            type: 'TRANSFER_RECOVERED',
            description: `Historical transfer ${transfer.id} reconstructed as ${transfer.status} by administrator ${req.user.id}`
        });
        return successResponse(res, transfer, 'Historical transfer recovered successfully', 201);
    } catch (error) {
        return errorResponse(res, error.message, 400);
    }
}

async function getAll(req, res) {

    try {

        const transfers =
            await transferService
                .fetchTransfers(req.user);

        return successResponse(
            res,
            transfers,
            'Transfers fetched successfully'
        );

    } catch (error) {

        console.error(
            'GET TRANSFERS ERROR:',
            error
        );

        return errorResponse(
            res,
            error.message,
            500
        );
    }
}

async function updateStatus(
    req,
    res,
    body,
    transferId
) {

    try {

        if (body.clearance_fee_amount !== undefined) {
            const updatedTransfer = await transferService.changeClearanceFee(
                transferId,
                body.clearance_fee_amount
            );
            return successResponse(res, updatedTransfer, 'Transfer clearance fee updated');
        }

        const updatedTransfer =
            await transferService
                .changeTransferStatus(
                    transferId,
                    body.status
                );

        await activityService.logActivity({
            user_id:
                req.user
                    ? req.user.id
                    : null,
            type:
                'TRANSFER_STATUS_UPDATED',
            description:
                `Transfer ${transferId} updated to ${body.status}`
        });

        return successResponse(
            res,
            updatedTransfer,
            'Transfer status updated'
        );

    } catch (error) {

        console.error(
            'UPDATE TRANSFER ERROR:',
            error
        );

        return errorResponse(
            res,
            error.message,
            500
        );
    }
}

async function submitClearanceReceipt(req, res, body, transferId) {
    try {
        const transfer = await transferService.submitClearanceReceipt(
            req.user,
            transferId,
            body.receipt
        );
        return successResponse(res, transfer, 'Clearance receipt submitted for confirmation');
    } catch (error) {
        return errorResponse(
            res,
            error.message,
            error.message === 'Clearance receipt access denied' ? 403 : 400
        );
    }
}


async function receipt(
    req,
    res,
    transferId
) {

    try {

        const receipt =
            await transferService
                .getTransferReceipt(
                    transferId,
                    req.user
                );

        return successResponse(
            res,
            receipt,
            'Receipt fetched successfully'
        );

    } catch (error) {

        return errorResponse(
            res,
            error.message,
            error.message === 'Receipt access denied' ? 403 : 400
        );
    }
}

module.exports = {
    create,
    recover,
    getAll,
    updateStatus,
    submitClearanceReceipt,
    receipt
};
