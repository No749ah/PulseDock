FROM node:24-alpine
WORKDIR /app
COPY package.json .
COPY dist/ ./dist/
COPY bin/ ./bin/
RUN chmod +x bin/agent.js
CMD ["node", "dist/index.js"]
