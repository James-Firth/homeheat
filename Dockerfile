FROM node

WORKDIR /app
COPY package.json .
COPY package-lock.json .
RUN npm install

COPY . /app/

CMD ["node", "index.js"]