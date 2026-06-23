const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WhatsApp Sender API',
      version: '1.0.0',
      description: 'REST API for sending WhatsApp messages via WhatsApp Web',
      contact: {
        name: 'API Support'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      }
    ],
    tags: [
      {
        name: 'Auth',
        description: 'User authentication'
      },
      {
        name: 'Messages',
        description: 'Send WhatsApp messages'
      },
      {
        name: 'Status',
        description: 'Check connection status and QR code'
      },
      {
        name: 'Accounts',
        description: 'Manage multiple WhatsApp accounts'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./routes/*.js', './server.js']
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;

