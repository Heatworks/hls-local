# HLS Local

HLS Local is a Node.js server application which manages local operations of an HLS deployment.

## Responsibilities
- DAC: Collecting, cacheing, and uploading data collected through an MQTT Broker or other data collection device.
- IAM: Cacheing credentials to be authenticated against locally when offline.
- Scripts: Installing and running scripts locally that are managed remotely.

## Deployment

Deploy using docker. The HLS Local server require the following environment variables:
- `PORT`
- `HLS_ACCESS_TOKEN`: Can be generated using the IAM service.
- `HLS_ORGANIZATION_ID`: The organization id (this can be gotten from the IAM service although it's not highly publicized).
- `HLS_MQTT_BROKER`: Full protocol, hostname, and port for the MQTT Broker.

Redis DB for caching credential policies:
- `REDIS_DB`
- `REDIS_PORT`
- `REDIS_HOST`

These containers can be deployed to supply the above environment variables:
- HLS MQTT Broker https://github.com/Heatworks/hls-mqtt-broker
- Redis https://hub.docker.com/_/redis/


