var __assign = (this && this.__assign) || Object.assign || function(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
            t[p] = s[p];
    }
    return t;
};
const express = require("express");

const path = require('path')

const app = express();

var bodyParser = require("body-parser");
app.use(bodyParser.json());

require('./iam/routes')(app);
require('./dac/routes')(app);

const port = process.env.PORT || 4000;
const env = process.env.NODE_ENV || 'production';

// start the server

app.listen(port, err => {
    if (err) {
        return console.error(err);
    }
    console.info(`Server running on http://localhost:${port} [${env}]`);
});