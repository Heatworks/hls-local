FROM mhart/alpine-node:latest

WORKDIR /heatworks-lab-local
ADD src/* src/
ADD package.json package.json

RUN npm install

EXPOSE 80
EXPOSE 443
CMD ["npm", "start"]