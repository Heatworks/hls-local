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
                        console.log('dac:cache:remove:'+ file);
                    });
                }).catch((error) => {
                    console.warn(error);
                    console.log(`dac:cache:error:${file}:Error Uploading Cache`);
                    if (error.code == 'ENOTFOUND' && error.syscall == 'getaddrinfo') {
                        console.log(`dac:retry:${file}`);
                        update(file, false)
                    }
                })
            })
        }, 10000)
    }

    update(currentFile, true);

    app.post('/dac/Data', function(req, res) {
        res.status(200).send({})
        fs.appendFile(currentFile, [req.body.organizationId, req.body.topic, req.body.payload ].join(",")+"\n", (err) => {
            if (err) {
                console.warn(err);
            }
        });
    });

    app.post('/dac/Recovery', function(req, res) {
        console.log(`dac:recover`);
        var recoveredFiles = [];
        fs.readdir('/tmp/', (err, files) => {
            files.forEach((file) => {
                if (/hls.dac.buffer.[0-9]+.csv/.test(file)) {
                     console.log(`dac:recover:${file}`);
                    recoveredFiles.push(file);
                    update('/tmp/'+file, false);
                }
            })
            res.send({
                "message":"Recovering files.",
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
    console.log(`dac:cache:upload`)
    var fileName = 'hls.dac.'+new Date().toISOString()+'.csv';
    return api.dataPut(data, 'text/csv', process.env.HLS_ORGANIZATION_ID, fileName )
}

function createCacheFile() {
    var time = new Date().getTime();
    var newFile = `/tmp/hls.dac.buffer.${time}.csv`;
    console.log(`dac:cache:create:${newFile}`)
    fs.writeFileSync(newFile, '')
    return newFile;
}