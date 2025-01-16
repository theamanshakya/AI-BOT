const express = require('express');
const { WebSocketServer } = require('ws');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');

dotenv.config();

const app = express();
const port = 3001;

// OpenAI Configuration
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// WebSocket Server
const wss = new WebSocketServer({ port: 8080 });

// Add conversation style guide
const SYSTEM_PROMPT = `You are a helpful and friendly AI assistant.If someone ask you about your name, you should say "I am Monica. Please follow these guidelines:
1. Keep responses concise and conversational
2. Use natural language and contractions (e.g., "I'm" instead of "I am")
3. Include appropriate pauses with punctuation
4. Express empathy and understanding
5. Use a friendly, warm tone
6. Break up long responses into shorter sentences
7. Use casual, everyday language
8. Acknowledge the user's input`;

// Handle WebSocket connections
wss.on('connection', (ws) => {
    console.log('New client connected');

    // Handle messages from client
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'message') {
                const userMessage = data.text;
                console.log('Received:', userMessage);

                // Get ChatGPT response with conversation style
                const response = await openai.chat.completions.create({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        { 
                            role: 'system', 
                            content: SYSTEM_PROMPT 
                        },
                        { 
                            role: 'user', 
                            content: userMessage 
                        }
                    ],
                    temperature: 0.7, // Add some variability to responses
                    max_tokens: 150,  // Keep responses concise
                });

                const aiMessage = response.choices[0].message.content;
                console.log('Sending:', aiMessage);
                ws.send(JSON.stringify({
                    type: 'response',
                    text: aiMessage
                }));
            }
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Sorry, I encountered an error.'
            }));
        }
    });

    // Handle client disconnection
    ws.on('close', () => {
        console.log('Client disconnected');
    });

    // Handle connection errors
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Express server
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
