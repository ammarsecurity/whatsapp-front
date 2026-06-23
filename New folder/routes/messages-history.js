const express = require('express');
const router = express.Router();
const MessageModel = require('../models/Message');
const { verifyToken } = require('../middleware/auth');

/**
 * @swagger
 * /api/messages:
 *   get:
 *     summary: Get message history
 *     tags: [Messages]
 *     parameters:
 *       - in: query
 *         name: accountId
 *         schema:
 *           type: string
 *         description: Filter by account ID
 *       - in: query
 *         name: phoneNumber
 *         schema:
 *           type: string
 *         description: Filter by phone number
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, sent, failed]
 *         description: Filter by status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Number of records to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of records to skip
 *     responses:
 *       200:
 *         description: Message history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 messages:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       account_id:
 *                         type: string
 *                       user_id:
 *                         type: integer
 *                       phone_number:
 *                         type: string
 *                       message_text:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [pending, sent, failed]
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: number
 *                 limit:
 *                   type: number
 *                 offset:
 *                   type: number
 *       500:
 *         description: Internal server error
 */
router.get('/', async (req, res) => {
  try {
    const { accountId, phoneNumber, status, limit = 100, offset = 0 } = req.query;
    const userId = req.userId;

    const filters = { userId };
    if (accountId) filters.accountId = accountId;
    if (phoneNumber) filters.phoneNumber = phoneNumber;
    if (status) filters.status = status;
    filters.limit = parseInt(limit);
    filters.offset = parseInt(offset);

    const messages = await MessageModel.findAll(filters);

    res.json({
      success: true,
      messages,
      total: messages.length,
      limit: filters.limit,
      offset: filters.offset
    });
  } catch (error) {
    console.error('Error getting message history:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/messages/statistics:
 *   get:
 *     summary: Get message statistics
 *     tags: [Messages]
 *     parameters:
 *       - in: query
 *         name: accountId
 *         schema:
 *           type: string
 *         description: Filter by account ID
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statistics:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                       example: 100
 *                     sent:
 *                       type: number
 *                       example: 85
 *                     failed:
 *                       type: number
 *                       example: 10
 *                     pending:
 *                       type: number
 *                       example: 5
 *       500:
 *         description: Internal server error
 */
router.get('/statistics', async (req, res) => {
  try {
    const { accountId } = req.query;
    const userId = req.userId;
    const statistics = await MessageModel.getStatistics(userId, accountId || null);

    res.json({
      success: true,
      statistics
    });
  } catch (error) {
    console.error('Error getting statistics:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/messages/{id}:
 *   get:
 *     summary: Get a specific message by ID
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Message ID
 *     responses:
 *       200:
 *         description: Message retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     account_id:
 *                       type: string
 *                     user_id:
 *                       type: integer
 *                     phone_number:
 *                       type: string
 *                     message_text:
 *                       type: string
 *                     status:
 *                       type: string
 *                     created_at:
 *                       type: string
 *       404:
 *         description: Message not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const message = await MessageModel.findById(parseInt(id), userId);

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    res.json({
      success: true,
      message
    });
  } catch (error) {
    console.error('Error getting message:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

module.exports = router;

