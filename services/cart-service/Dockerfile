FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
EXPOSE 4008
CMD ["npm", "start"]