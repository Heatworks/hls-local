module.exports = function(app){

    app.get('/api/data', function(req, res){
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