FROM node
RUN mkdir /app
COPY . /app
WORKDIR /app
EXPOSE 8000
RUN npm install
CMD ["node", "app.js"]

