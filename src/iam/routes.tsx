import * as IAM from "../hls-iam"
import * as redis from "redis"

module.exports = function(app){

    var api = new IAM.DefaultApi()
    api.setApiKey(IAM.DefaultApiApiKeys.oAuth_2_0, process.env.HLS_ACCESS_TOKEN)

    var client = redis.createClient({
        db: process.env.REDIS_DB,
        port: process.env.REDIS_PORT,
        host: process.env.REDIS_HOST
    })

    app.get('/iam/AccessToken', function(req, res) {
        var accessToken = req.query.accessToken
        client.get(accessToken, function (err, cached) {
            if (err || cached == null) {
                console.log(`Refetching: ${accessToken}`);
                api.accessTokenGet(req.query.accessToken).then((response) => {
                    res.send(response.body)
                    client.set(req.query.accessToken, JSON.stringify(response.body))
                }).catch((err) => {
                    res.send(403, {
                        "message": err
                    })
                })
            } else {
                console.log(`Cached: ${accessToken}`);
                res.send(JSON.parse(cached))
            }
        })
    });

    app.delete('/iam/AccessToken', function(req, res) {
        var accessToken = req.query.accessToken
        client.del(accessToken);
        res.send({});
    });

    app.get('/iam/', function(req, res){
        res.send({
            policy: {
                'hls:*': {
                    resources: [
                        "*"
                    ]
                }
            }
        })
    });

    //other routes..
}