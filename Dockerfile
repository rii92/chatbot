FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the app
COPY . .

# Expose port (if needed)
EXPOSE 3000

# Start the bot
CMD ["npm", "start"]
