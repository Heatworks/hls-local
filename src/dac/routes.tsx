import * as DAC from "../hls-dac"
import * as redis from "redis"
import * as fs from 'fs'
import * as Promise from "bluebird"

module.exports = function(app){

    var currentFile = createCacheFile();

    var update = function (file, updateCache) {
        setTimeout(() => {
            if (updateCache) {
                currentFile = createCacheFile()
                update(currentFile, true);
            }
            fs.readFile(file, (error, data) => {
                if (error) {
                    console.warn(error)
                    return;
                }
                uploadData(data.toString()).then(() => {
                    fs.unlink(file, (err) => {
                        if (err) {
                            console.warn(error)
                            return;
                        }
                        console.log('Removed Cache: '+ file);
                    });
                }).catch((error) => {
                    console.log('Error Uploading Cache: '+ file);
                    if (error.code == 'ENOTFOUND' && error.syscall == 'getaddrinfo') {
                        console.log('Will retry indefinitly...');
                        update(file, false)
                    }
                    console.warn(error);
                })
            })
        }, 10000)
    }

    update(currentFile, true);

    app.post('/dac/Data', function(req, res) {
        res.send({
            "message":"Received data.",
            "body": req.body
        })
        fs.appendFileSync(currentFile, [req.body.organizationId, req.body.topic, req.body.payload ].join(",")+"\n", (err) => {
            if (err) {
                console.warn(err);
            }
        });
    });

    app.post('/dac/Recovery', function(req, res) {
        var recoveredFiles = [];
        fs.readdir('/tmp/', (err, files) => {
            files.forEach((file) => {
                recoveredFiles.push(file);
            })
            res.send({
                "message":"Recovered files.",
                "files": recoveredFiles
            })
        });
    })
}


var api = new DAC.DefaultApi()
api.setApiKey(DAC.DefaultApiApiKeys.oAuth_2_0, process.env.HLS_ACCESS_TOKEN)

function uploadData(data) {
    if (data == "") {
        return new Promise(function(resolve, reject) {
            resolve()
        })
    }
    console.log('Send data to server.')
    var fileName = 'hls.dac.'+new Date().toISOString()+'.csv';
    return api.dataPut(data, 'text/csv', process.env.HLS_ORGANIZATION_ID, fileName )
}

function createCacheFile() {
    var time = new Date().getTime();
    var newFile = `/tmp/hls.dac.buffer.${time}.csv`;
    fs.writeFileSync(newFile, '')
    return newFile;
}