# HLS Local

HLS Local is a Node.js server application which manages local operations of an HLS deployment.

## Responsibilities
- DAC: Collecting, cacheing, and uploading data collected through an MQTT Broker or other data collection device.
- IAM: Cacheing credentials to be authenticated against locally when offline.
- Scripts: Installing and running scripts locally that are managed remotely.

## Deployment

Deploy using docker.