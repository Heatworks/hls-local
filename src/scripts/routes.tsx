import * as ScriptsAPI from "../hls-scripts"
import * as redis from "redis"
const mkdirp = require("mkdirp");
const fs = require('fs');
const download = require('download');
const mqtt = require("mqtt")
var cors = require('cors')

var child_process = require('child_process');

class ScriptEnvironment {
    env: Map<string, any>
    channels: Map<string, string>
}

class Script {
    defaultEnvironment: ScriptEnvironment
    name:string
    environments: Map<String, ScriptEnvironment>
    files: [string]
    version: string
}

var api = new ScriptsAPI.DefaultApi()
api.setApiKey(ScriptsAPI.DefaultApiApiKeys.oAuth_2_0, process.env.HLS_ACCESS_TOKEN)

var psTree = require('ps-tree');

var kill = function (pid, signal, callback) {
    signal   = signal || 'SIGKILL';
    callback = callback || function () {};
    var killTree = true;
    if(killTree) {
        psTree(pid, function (err, children) {
            [pid].concat(
                children.map(function (p) {
                    return p.PID;
                })
            ).forEach(function (tpid) {
                try { process.kill(tpid, signal) }
                catch (ex) { }
            });
            callback();
        });
    } else {
        try { process.kill(pid, signal) }
        catch (ex) { }
        callback();
    }
};


module.exports = function(app){
    var currentRuns = {}
    var client = mqtt.connect(process.env.HLS_MQTT_BROKER, {
        username: 'HLS:AccessToken',
        password: process.env.HLS_ACCESS_TOKEN
    })

    var redis_client = redis.createClient({
        db: process.env.REDIS_DB,
        port: process.env.REDIS_PORT,
        host: process.env.REDIS_HOST
    })
   
    client.on("connect", () => {
        console.log(`scripts:mqtt:connected`)
    })

    client.on("error", (error) => {
        console.warn(error);
        console.log(`scripts:mqtt:error:${error.message}`)
    })

    app.use(cors())

    app.get('/scripts/Start', function(req, res) {
        if (client.connected == false) {
            res.status(500).send({"message": `Could not connect to MQTT client.`})
            return;
        }
        var extraVariables = Object.assign({}, req.query);
        var scriptName = req.query.name;
        var environment = req.query.environment;
        delete extraVariables["name"];
        delete extraVariables["environment"];
        console.log(`scripts:start:${scriptName}:'${environment}'`);  
        console.log(` - w/ variables: ${JSON.stringify(extraVariables)}`);
        var runName;
        var script:Script;
        var scriptPath:string;
        getScript(scriptName).then((_script:Script) => {
            script = _script;
            if (script == null) {
                throw Error(`Failed getting script '${scriptName}'.`)
            }
            if (!(environment in script.environments)) {
                throw Error(`Environment '${environment}' does not exist in ${script.name}`)
            }
            runName = script.name+"/"+environment;
            return isScriptRunning(scriptName, environment);
        }).then((running) => {
            if (running) {
                throw Error(`${script.name} with environment '${environment}' is already running.`);
            }
        }).then(() => {
            console.log(` - Determining script path.'`);  
            var scriptNameSuffix = script.name.split('/scripts/')[1]
            scriptPath = `/tmp/hls/scripts/`+scriptNameSuffix;
            return new Promise((resolve, reject) => {
                console.log(" - Generating script path if it does not exist.");
                mkdirp(scriptPath, function (error) {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(scriptPath);
                    }
                });
            })
        }).then(() => {
            console.log(" - Checking latest script version against local files.");
            return new Promise((resolve, reject) => {
                redis_client.get(`${script.name}:version`, (err, value) => {
                    if (value == script.version) {
                        resolve(false);
                    } else {
                        redis_client.set(`${script.name}:version`, script.version, () => {
                            resolve(true);
                        })
                    }
                })
            }).then((needsToUpdate) => {
                if (needsToUpdate) {
                    console.log(` - Downloading latest script files...`);
                    return Promise.all(script.files.map((file) => {
                        console.log(` - Get file ${file}.`)
                        return api.fileGet(script.name, file).then((response) => {
                            console.log(` - Downloading file ${response.body["url"]} to ${scriptPath}/${file}...`)
                            return download(response.body["url"], `${scriptPath}`);
                        })
                    })).then(() => {
                        console.log(` - Downloaded latest script files.`);
                    })
                } else {
                    console.log(` - Script files meet current version (${script.version}).`);
                }
                return needsToUpdate;
            })
        }).then(() => {
            const which = require('which');
            const npm = which.sync('npm');

            var defaults = {
                HLS_ACCESS_TOKEN: process.env.HLS_ACCESS_TOKEN,
                HLS_MQTT_BROKER: process.env.HLS_MQTT_BROKER,
                NODE: process.env.NODE,
                PATH: process.env.PATH
            }
            var env = {
            }
            Object.keys(script.environments[environment].channels).forEach((channel) => {
                env['channels.'+channel] = script.environments[environment].channels[channel];
                env['channels/'+channel] = script.environments[environment].channels[channel];
                env['channels-'+channel] = script.environments[environment].channels[channel];
            })

            var runScript = () => {
                console.log(`scripts:run:${scriptName}:'${environment}'`);  
                runlog(client, runName, "Start")          
                var finalizedEnvironment = Object.assign({}, defaults, script.defaultEnvironment.env, script.environments[environment].env, extraVariables, env);                        
                        
                var run_process = child_process.spawn('npm', ['start'], {             
                    cwd: scriptPath,                                                  
                    env: finalizedEnvironment,
                    shell: true,
                    detatched: true                                       
                })
                                                                                            
                run_process.stdout.on('data', function (data) {                              
                    runlog(client, runName, data.toString())                                     
                });                                                                          
                                                                                            
                run_process.stderr.on('data', function (data) {                              
                    runlog(client, runName, data.toString())                                     
                });

                var killed = function (code) {
                    runlog(client, runName, "Exit: "+code)
                    setScriptKilled(scriptName, environment);
                }
                run_process.on('kill', killed)
                run_process.on('close', killed) 
                run_process.on('error', killed)

                runningEnvironments[runName] = {
                    running: true,
                    process: run_process
                }                                     
                res.status(200).send({"message": `Started script ${script.name} with environment '${environment}'`})                
            }
            
            var installScript = () => { 
                console.log(`scripts:install:${scriptName}:'${environment}'`);  
                child_process.exec(npm+' install', {                                         
                    cwd: scriptPath                                                          
                }, (error, stdout, stderr) => {                                              
                    if (error) {        
                        console.error(error);                                       
                        res.status(400).send({"message": error})
                        return;                                          
                    }                                                                        
                    console.log(`scripts:install:stdout:${stdout}`);                                        
                    console.log(`scripts:install:stderr:${stderr}`);                                        

                    setTimeout(() => {                                                       
                        runScript.call(this)                                                 
                    })                                                                       
                })                                                                           
            }       

            installScript()
        }).catch((error:Error) => {
            console.error(error);
            console.log(`scripts:error:${error.message}`)
            res.status(400).send({"message": error.message})
        });
        
    });

    app.get('/scripts/Stop', function(req, res) {
        var scriptName = req.query.name;
        var environment = req.query.environment;
        var runName = scriptName+"/"+environment;
        var run = isScriptRunning(scriptName, environment);
        if (!run) {
            res.status(400).send({"message": `${runName} is not running.`})
            return;
        }
        console.log(`scripts:kill:${scriptName}:${environment}`);
        kill(run.process.pid, 'SIGKILL', () => {
            res.status(200).send({"message": `Stopped run ${runName}.`})
        })        
    });

    app.get('/scripts/Status', function(req, res) {
        var scriptName = req.query.name;
        var environment = req.query.environment;
        var status = isScriptRunning(scriptName, environment);
        if (status) {
            res.status(200).send({"message": `${scriptName}/${environment} is running.`, "status": true})
            return;
        } else {
            res.status(200).send({"message": `${scriptName}/${environment} is not running.`, "status": false})
            return;
        }
    });

    app.get('/scripts/Reset', function(req, res) {
        var scriptName = req.query.name;
        var environment = req.query.environment;
        console.log(`scripts:reset:${scriptName}:${environment}`);
        if (isScriptRunning(scriptName, environment)) {
            res.status(500).send({"message": `${scriptName}/${environment} is running, it must be stopped in order to be reset.`})
            return;
        }
        redis_client.del(`${scriptName}:version`, () => {
            res.status(200).send({"message": `${scriptName} has been reset.`})
            return;
        })
    });
}
                                                                                                     
function runlog(client, run, log) {                                                                              
    console.log(`[${run}] ${log}`);                                                                                            
    var parts = run.split("/scripts/")                                                                      
    var topic = `${parts[0]}/devices/scripts/${parts[1]}`                                                        
    var lines = log.split("\n");                                                                                 
    lines.forEach((line) => {                                                                                    
        if (line.length > 0) {                                                                                   
            publishLine(client, topic, line)                                                                     
        }                                                                                                        
    })                                                                                                           
}                                                                                                                
function publishLine(client, topic, line) {                                                                      
    var date = new Date();                                                                                       
    client.publish(topic, [ date.getTime() / 1000, `"${line}"` ].join(","));                                     
}                                                                                                                
                                                                                                                 
function getScript(name) {    
    return api.scriptGet(name).then((response) => {
        return response.body
    })
}

var runningEnvironments = {};

function isScriptRunning(name, environment) {
    var runName = name + "/" + environment;
    if (runName in runningEnvironments) {
        return runningEnvironments[runName];
    }
    return false;
}

function setScriptKilled(name, environment) {
    delete runningEnvironments[name + "/" + environment];
}