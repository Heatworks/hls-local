//import * as DAC from "../hls-dac"
import * as redis from "redis"

module.exports = function(app){

    //var api = new DAC.DefaultApi()
    //api.setApiKey(DAC.DefaultApiApiKeys.oAuth_2_0, process.env.HLS_ACCESS_TOKEN)

    app.post('/dac/Data', function(req, res) {
        console.log(req.body)
        res.send({
            "message":"Received data.",
            "body": req.body
        })

        /*
			elements = packet.payload.toString().split(",");
			console.log(`${client.organization}: topic: ${packet.topic} ${elements.join(", ")}`);
			if (elements.length == 2) {
				const [ timestamp, value ] = elements
				var elements = packet.topic.split("/devices/")[1].split("/")
				var channel = elements.pop();
				var timestampDate = new Date(0);
				timestampDate.setUTCMilliseconds(timestamp * 1000)
				insertRecord(client.organization_id, timestampDate, channel, elements.join("/"), parseFloat(value), parseInt(value));
			}*/
    });
}


function insertRecord(organization_id, timestamp, channel, device, floatValue, integerValue) {
	var params = [organization_id, timestamp, channel, device, floatValue, integerValue];
	console.log(params);
	/* query = "INSERT INTO lab_messages VALUES ($1, $2, $3, $4, $5, $6);"
	client.query(query, params, function (err, result) {
		if (err) {
			console.warn(err)
		}
	}); */
}
