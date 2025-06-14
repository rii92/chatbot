const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');

// Simple logging function with level support
const log = (message, level = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = level.toUpperCase().padEnd(5);
    console.log(`[${timestamp}] ${prefix} ${message}`);
};

// Debug function for object inspection
const debug = (obj) => {
    try {
        return JSON.stringify(obj, null, 2);
    } catch (e) {
        return '[Circular Object]';
    }
};

async function connectToWhatsApp() {
    try {
        // Use the saved state
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: ['WA Bot', 'Chrome', '1.0.0']
        });

        // Handle connection updates
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if(qr) {
                log('Scan QR code below to login:', 'info');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                log('Connection closed due to: ' + lastDisconnect?.error?.message, 'error');
                
                if (shouldReconnect) {
                    log('Reconnecting...', 'info');
                    connectToWhatsApp();
                }
            } else if(connection === 'open') {
                log('Bot is now connected and ready!', 'info');
            }
        });

        // Save credentials whenever updated
        sock.ev.on('creds.update', saveCreds);

        // Handle incoming messages
        sock.ev.on('messages.upsert', async (m) => {
            try {
                const msg = m.messages[0];
                
                // Basic validation
                if (!msg?.message) {
                    log('Skipping: No message content', 'debug');
                    return;
                }
                
                if (msg.key.remoteJid === 'status@broadcast') {
                    log('Skipping: Status message', 'debug');
                    return;
                }

                if (msg.key.fromMe) {
                    log('Skipping: Message from self', 'debug');
                    return;
                }
                
                const chat = msg.key.remoteJid;
                const messageType = Object.keys(msg.message)[0];
                
                // Get the message text based on type
                let messageText = '';
                
                if (messageType === 'conversation') {
                    messageText = msg.message.conversation;
                } else if (messageType === 'extendedTextMessage') {
                    messageText = msg.message.extendedTextMessage.text;
                } else {
                    log(`Skipping: Unsupported message type: ${messageType}`, 'debug');
                    return;
                }

                // Log message details
                log('===== New Message =====', 'debug');
                log(`Type: ${messageType}`, 'debug');
                log(`Content: ${messageText}`, 'debug');
                log(`From: ${msg.key.remoteJid}`, 'debug');
                log('=====================', 'debug');

                // Only process text commands
                if (!messageText || !messageText.startsWith('!')) {
                    return;
                }

                // Handle commands
                const command = messageText.toLowerCase();
                try {
                    switch(command) {
                        case '!ping':
                            await sock.sendMessage(chat, { text: 'Pong! 🏓' });
                            log('Sent: Pong response', 'info');
                            break;
                            
                        case '!help':
                            const helpText = `*Available Commands:*\n\n` +
                                `!ping - Check if bot is online\n` +
                                `!help - Show this help message\n` +
                                `!time - Show current time\n` +
                                `!about - About this bot\n` +
                                `!echo [text] - Repeat your message`;
                            await sock.sendMessage(chat, { text: helpText });
                            log('Sent: Help message', 'info');
                            break;
                            
                        case '!time':
                            const time = new Date().toLocaleString();
                            await sock.sendMessage(chat, { text: `Current time: ${time}` });
                            log('Sent: Current time', 'info');
                            break;
                            
                        case '!about':
                            await sock.sendMessage(chat, { 
                                text: '*WhatsApp Bot*\nA simple bot created with Baileys' 
                            });
                            log('Sent: About message', 'info');
                            break;
                            
                        default:
                            if (command.startsWith('!echo ')) {
                                const echo = messageText.slice(6).trim(); // Remove !echo and trim
                                if (echo) {
                                    await sock.sendMessage(chat, { text: echo });
                                    log(`Sent: Echo message: ${echo}`, 'info');
                                }
                            }
                    }
                } catch (error) {
                    log(`Error sending response: ${error.message}`, 'error');
                    // Try to send error message to user
                    await sock.sendMessage(chat, { 
                        text: '⚠️ Sorry, there was an error processing your command.' 
                    }).catch(() => {}); // Ignore errors sending error message
                }
            } catch (error) {
                log(`Error handling message: ${error.message}`, 'error');
            }
        });

    } catch (error) {
        log('Error in main loop: ' + error.message, 'error');
    }
}

// Start the bot
log('Starting WhatsApp bot...', 'info');
connectToWhatsApp();
