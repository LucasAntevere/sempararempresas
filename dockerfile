FROM node:18-alpine

# Create app directory
#WORKDIR /src
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install dependencies
RUN npm install
RUN npm install -g typescript 

# Copy the rest of the application code
COPY . .

# Compile typescript
RUN tsc --build tsconfig.json

# Expose the port the app runs on
EXPOSE 8080

# Start the application
CMD ["node", "./src/app.js"]